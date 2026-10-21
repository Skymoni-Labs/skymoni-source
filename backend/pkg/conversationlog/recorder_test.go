package conversationlog

import (
	"bytes"
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestExtractTextOnly(t *testing.T) {
	for _, tc := range []struct{ name, request, response, input, output string }{
		{"chat", `{"model":"m","api_key":"secret","messages":[{"role":"system","content":"private system"},{"role":"user","content":"old"},{"role":"assistant","content":"history"},{"role":"user","content":[{"type":"text","text":"你好"},{"type":"image_url","image_url":{"url":"data:secret"}}]}]}`, `{"choices":[{"message":{"content":"您好"}}]}`, "你好", "您好"},
		{"sse", `{"model":"m","messages":[{"role":"user","content":"Q"}]}`, "data: {\"choices\":[{\"delta\":{\"content\":\"A\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"B\"}}]}\n\ndata: [DONE]\n", "Q", "AB"},
		{"responses", `{"model":"m","input":[{"role":"developer","content":"secret"},{"role":"user","content":[{"type":"input_text","text":"Q"},{"type":"input_image","image_url":"secret"}]}]}`, "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"A\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"A\"}]}]}}\n", "Q", "A"},
		{"claude", `{"model":"m","system":"secret","messages":[{"role":"user","content":"Q"}]}`, "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"A\"}}\n", "Q", "A"},
		{"gemini", `{"model":"m","contents":[{"role":"user","parts":[{"text":"Q"},{"inlineData":{"data":"secret"}}]}]}`, `{"candidates":[{"content":{"parts":[{"text":"A"}]}}]}`, "Q", "A"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r, ok := Extract(Job{At: time.Unix(0, 0), UserID: 7, Request: []byte(tc.request), Response: []byte(tc.response)})
			require.True(t, ok)
			require.Equal(t, tc.input, r.Input)
			require.Equal(t, tc.output, r.Output)
			b, err := common.Marshal(r)
			require.NoError(t, err)
			require.NotContains(t, string(b), "secret")
			require.NotContains(t, string(b), "history")
		})
	}
}

func TestRetentionAndBoundedCapture(t *testing.T) {
	dir := t.TempDir()
	old := filepath.Join(dir, "00000000000000000001-deadbeef.jsonl")
	require.NoError(t, os.WriteFile(old, bytes.Repeat([]byte("x"), 100*1024), 0600))
	r := &Recorder{directory: dir, budget: 128 * 1024, instance: "aabbccdd"}
	require.NoError(t, r.appendRecord(Record{Time: "now", Input: strings.Repeat("q", 32*1024), Output: "answer"}))
	_, err := os.Stat(old)
	require.True(t, os.IsNotExist(err), "oldest segment is evicted before appending")
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	var allocated int64
	for _, entry := range entries {
		info, err := entry.Info()
		require.NoError(t, err)
		allocated += allocatedBytes(info)
	}
	require.LessOrEqual(t, allocated, r.budget)
	buffer := &CaptureBuffer{}
	original := bytes.Repeat([]byte("z"), CaptureLimit+17)
	body := RequestBody{ReadCloser: io.NopCloser(bytes.NewReader(original)), Buffer: buffer}
	actual, err := io.ReadAll(body)
	require.NoError(t, err)
	require.Equal(t, original, actual)
	require.Len(t, buffer.Data, CaptureLimit)
	require.True(t, buffer.Truncated)
	queue := &Recorder{queue: make(chan Job, 1), slots: make(chan struct{}, 1)}
	require.True(t, queue.Acquire())
	require.False(t, queue.Acquire())
	queue.Submit(Job{})
	queue.Submit(Job{})
	require.Equal(t, uint64(2), queue.dropped.Load())
	queue.Release()
}
