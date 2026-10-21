// Package conversationlog records text conversations without doing disk I/O on request goroutines.
package conversationlog

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const CaptureLimit = 4 * 1024 * 1024
const segmentLimit = 4 * 1024 * 1024

type Record struct {
	Time    string  `json:"time"`
	UserID  int     `json:"user_id"`
	Model   string  `json:"model"`
	Input   string  `json:"input"`
	Output  string  `json:"output"`
	Partial bool    `json:"partial,omitempty"`
	Images  []Image `json:"images,omitempty"`
}

type Job struct {
	At                time.Time
	UserID            int
	Request, Response []byte
	Partial           bool
}

type Recorder struct {
	directory string
	budget    int64
	instance  string
	current   string
	queue     chan Job
	slots     chan struct{}
	written   atomic.Uint64
	dropped   atomic.Uint64
}

// Open fails closed: an unavailable recorder never prevents the gateway starting.
func Open(directory string, budget int64) (*Recorder, error) {
	if budget < 128*1024 {
		return nil, errors.New("conversation budget too small")
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return nil, err
	}
	if err := os.Chmod(directory, 0700); err != nil {
		return nil, err
	}
	var id [4]byte
	if _, err := rand.Read(id[:]); err != nil {
		return nil, err
	}
	r := &Recorder{directory: directory, budget: budget, instance: hex.EncodeToString(id[:]), queue: make(chan Job, 4), slots: make(chan struct{}, 4)}
	go r.run()
	return r, nil
}

// Acquire limits the total memory held by active requests. It never waits.
func (r *Recorder) Acquire() bool {
	select {
	case r.slots <- struct{}{}:
		return true
	default:
		r.dropped.Add(1)
		return false
	}
}
func (r *Recorder) Release() { <-r.slots }
func (r *Recorder) Submit(job Job) {
	select {
	case r.queue <- job:
	default:
		r.dropped.Add(1)
	}
}

func (r *Recorder) run() {
	for job := range r.queue {
		record, ok := Prepare(job)
		if !ok {
			r.dropped.Add(1)
			continue
		}
		if err := r.appendRecord(record); err != nil {
			r.dropped.Add(1)
		} else {
			r.written.Add(1)
		}
	}
}

// Text accepts only protocol text fields, never attachments, tools, headers or credentials.
func Text(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case []any:
		parts := make([]string, 0, len(v))
		for _, part := range v {
			if s := Text(part); s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "\n")
	case map[string]any:
		kind, _ := v["type"].(string)
		if kind != "" && kind != "text" && kind != "input_text" && kind != "output_text" && kind != "message" {
			return ""
		}
		if s, ok := v["text"].(string); ok {
			return s
		}
		if s := Text(v["content"]); s != "" {
			return s
		}
		return Text(v["parts"])
	}
	return ""
}

func inputText(body map[string]any) string {
	if messages, ok := body["messages"].([]any); ok {
		for i := len(messages) - 1; i >= 0; i-- {
			m, _ := messages[i].(map[string]any)
			if m["role"] == "user" {
				return Text(m["content"])
			}
		}
	}
	if input, ok := body["input"].(string); ok {
		return input
	}
	if input, ok := body["input"].([]any); ok {
		for i := len(input) - 1; i >= 0; i-- {
			m, _ := input[i].(map[string]any)
			if m["role"] == "user" || (m["role"] == nil && m["type"] == "message") {
				return Text(m["content"])
			}
		}
		return ""
	}
	if contents, ok := body["contents"].([]any); ok {
		for i := len(contents) - 1; i >= 0; i-- {
			m, _ := contents[i].(map[string]any)
			if m["role"] == "user" || m["role"] == nil {
				return Text(m["parts"])
			}
		}
	}
	return Text(body["prompt"])
}

func outputText(body map[string]any) string {
	if choices, ok := body["choices"].([]any); ok && len(choices) > 0 {
		c, _ := choices[0].(map[string]any)
		for _, key := range []string{"delta", "message"} {
			if m, ok := c[key].(map[string]any); ok {
				if s := Text(m["content"]); s != "" {
					return s
				}
			}
		}
		return Text(c["text"])
	}
	if body["type"] == "response.output_text.delta" {
		s, _ := body["delta"].(string)
		return s
	}
	if body["type"] == "content_block_delta" {
		d, _ := body["delta"].(map[string]any)
		s, _ := d["text"].(string)
		return s
	}
	if body["type"] == "content_block_start" {
		return Text(body["content_block"])
	}
	if candidates, ok := body["candidates"].([]any); ok && len(candidates) > 0 {
		c, _ := candidates[0].(map[string]any)
		m, _ := c["content"].(map[string]any)
		return Text(m["parts"])
	}
	if s := Text(body["output_text"]); s != "" {
		return s
	}
	if s := Text(body["output"]); s != "" {
		return s
	}
	return Text(body["content"])
}

func Extract(job Job) (Record, bool) {
	var request map[string]any
	if common.Unmarshal(job.Request, &request) != nil {
		return Record{}, false
	}
	input := inputText(request)
	model, _ := request["model"].(string)
	var answer strings.Builder
	refs := newImageCollector()
	refs.walk("input", latestUserContent(request), 0)
	var response map[string]any
	if common.Unmarshal(job.Response, &response) == nil {
		answer.WriteString(outputText(response))
		refs.response(response)
	} else {
		var fallback string
		for line := range bytes.SplitSeq(job.Response, []byte("\n")) {
			line = bytes.TrimSpace(line)
			if !bytes.HasPrefix(line, []byte("data:")) {
				continue
			}
			var event map[string]any
			if common.Unmarshal(bytes.TrimSpace(line[5:]), &event) != nil {
				continue
			}
			refs.response(event)
			if event["type"] == "response.completed" {
				if v, ok := event["response"].(map[string]any); ok {
					fallback = outputText(v)
				}
				continue
			}
			answer.WriteString(outputText(event))
		}
		if answer.Len() == 0 {
			answer.WriteString(fallback)
		}
	}
	if (input == "" && !refs.hasSide("input")) || (answer.Len() == 0 && !refs.hasSide("output") && !(job.Partial && refs.hasSide("input"))) {
		return Record{}, false
	}
	refs.text("input", input)
	refs.text("output", answer.String())
	return Record{Time: job.At.UTC().Format(time.RFC3339Nano), UserID: job.UserID, Model: model, Input: input, Output: answer.String(), Partial: job.Partial, Images: refs.images}, true
}

// Prepare resolves bounded image attachments outside the request goroutine.
func Prepare(job Job) (Record, bool) {
	record, ok := Extract(job)
	if ok {
		archiveImages(&record)
	}
	return record, ok
}

func (r *Recorder) appendRecord(record Record) error {
	line, err := common.Marshal(record)
	for err == nil && len(line)+1 > segmentLimit && len(record.Images) > 0 {
		record.Images = record.Images[:len(record.Images)-1]
		line, err = common.Marshal(record)
	}
	if err != nil {
		return err
	}
	line = append(line, '\n')
	// Reserve space for directory entries, the lock, and filesystem rounding.
	available := r.budget - min(int64(8*1024*1024), r.budget/8)
	if int64(len(line)) > available || len(line) > segmentLimit {
		return errors.New("record exceeds budget")
	}
	lock, err := os.OpenFile(filepath.Join(r.directory, ".lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err = lockExclusive(lock); err != nil {
		return err
	}
	defer unlock(lock)
	entries, err := os.ReadDir(r.directory)
	if err != nil {
		return err
	}
	type segment struct {
		path            string
		size, allocated int64
	}
	var segments []segment
	var total int64
	for _, entry := range entries {
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 || !strings.HasSuffix(entry.Name(), ".jsonl") {
			continue
		}
		info, e := entry.Info()
		if e != nil {
			return e
		}
		allocated := allocatedBytes(info)
		segments = append(segments, segment{filepath.Join(r.directory, entry.Name()), info.Size(), allocated})
		total += allocated
	}
	sort.Slice(segments, func(i, j int) bool { return segments[i].path < segments[j].path })
	var existing int64
	for _, s := range segments {
		if s.path == r.current {
			existing = s.size
		}
	}
	if r.current == "" || existing == 0 || existing+int64(len(line)) > segmentLimit {
		r.current = filepath.Join(r.directory, fmt.Sprintf("%020d-%s.jsonl", time.Now().UnixNano(), r.instance))
		existing = 0
	}
	delta := ((existing+int64(len(line))+4095)/4096)*4096 - ((existing+4095)/4096)*4096
	for _, s := range segments {
		if total+delta <= available {
			break
		}
		if s.path == r.current {
			continue
		}
		if err = os.Remove(s.path); err != nil {
			return err
		}
		total -= s.allocated
	}
	if total+delta > available {
		return errors.New("budget unavailable")
	}
	f, err := os.OpenFile(r.current, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	n, writeErr := f.Write(line)
	if writeErr != nil || n != len(line) {
		_ = f.Truncate(existing)
		_ = f.Close()
		return errors.New("log write failed")
	}
	return f.Close()
}

// CaptureBuffer records a bounded prefix while preserving every byte sent to the client.
type CaptureBuffer struct {
	Data      []byte
	Truncated bool
}

func (b *CaptureBuffer) Add(p []byte) {
	remaining := CaptureLimit - len(b.Data)
	if len(p) > remaining {
		b.Truncated = true
		p = p[:remaining]
	}
	b.Data = append(b.Data, p...)
}

type RequestBody struct {
	io.ReadCloser
	Buffer *CaptureBuffer
}

func (b RequestBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.Buffer.Add(p[:n])
	return n, err
}
