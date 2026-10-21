package middleware

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/conversationlog"
	"github.com/gin-gonic/gin"
	"os"
	"strconv"
	"strings"
	"time"
)

type conversationWriter struct {
	gin.ResponseWriter
	buffer *conversationlog.CaptureBuffer
}

func (w *conversationWriter) Write(p []byte) (int, error) {
	n, err := w.ResponseWriter.Write(p)
	w.buffer.Add(p[:n])
	return n, err
}
func (w *conversationWriter) WriteString(p string) (int, error) {
	n, err := w.ResponseWriter.WriteString(p)
	w.buffer.Add([]byte(p[:n]))
	return n, err
}

func ConversationLog() gin.HandlerFunc {
	directory := os.Getenv("CONVERSATION_LOG_DIR")
	if directory == "" {
		return func(c *gin.Context) { c.Next() }
	}
	budget := int64(500000000)
	if n, err := strconv.ParseInt(os.Getenv("CONVERSATION_LOG_MAX_BYTES"), 10, 64); err == nil && n > 0 && n <= budget {
		budget = n
	}
	recorder, err := conversationlog.Open(directory, budget)
	if err != nil {
		common.SysLog("conversation recorder unavailable; relay remains enabled")
		return func(c *gin.Context) { c.Next() }
	}
	common.SysLog("conversation recorder enabled: text and bounded private images, asynchronous queue, 500 MB maximum")
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		eligible := path == "/v1/chat/completions" || path == "/v1/messages" || path == "/v1/responses" || path == "/v1/completions" || path == "/pg/chat/completions" || ((strings.HasPrefix(path, "/v1beta/models/") || strings.HasPrefix(path, "/v1/models/")) && (strings.HasSuffix(path, ":generateContent") || strings.HasSuffix(path, ":streamGenerateContent")))
		if c.Request.Method != "POST" || !eligible || c.Request.Body == nil || c.Request.ContentLength > conversationlog.CaptureLimit || !recorder.Acquire() {
			c.Next()
			return
		}
		defer recorder.Release()
		at := time.Now()
		input := &conversationlog.CaptureBuffer{}
		output := &conversationlog.CaptureBuffer{}
		body := c.Request.Body
		writer := c.Writer
		c.Request.Body = conversationlog.RequestBody{ReadCloser: body, Buffer: input}
		c.Writer = &conversationWriter{ResponseWriter: writer, buffer: output}
		defer func() { c.Request.Body = body; c.Writer = writer }()
		c.Next()
		userID := c.GetInt("id")
		if userID <= 0 || writer.Status() < 200 || writer.Status() >= 300 || input.Truncated || len(input.Data) == 0 || len(output.Data) == 0 || writer.Header().Get("Content-Encoding") != "" {
			return
		}
		recorder.Submit(conversationlog.Job{At: at, UserID: userID, Request: input.Data, Response: output.Data, Partial: output.Truncated || c.Request.Context().Err() != nil})
	}
}
