package types

import (
	"encoding/json"
	"fmt"
	"strings"
)

const ErrorCodeModelServiceError ErrorCode = "model_service_error"

const ModelServiceErrorMessage = "模型服务暂时异常，本次请求未能完成。请稍后重试，或切换其他模型。若持续出现，请联系客服并提供请求编号。"

// IsUpstreamConversationVerificationBody recognizes the supplier's structured
// 11128 error, including OpenAI wrappers and legacy explanatory prefixes.
// Both the exact code and message must match; a bare mention is insufficient.
func IsUpstreamConversationVerificationBody(raw string) bool {
	return conversationVerificationJSON(raw, 0)
}

func conversationVerificationJSON(raw string, depth int) bool {
	if depth > 6 || len(raw) > 64*1024 {
		return false
	}
	for attempts := 0; attempts < 16; attempts++ {
		start := strings.IndexByte(raw, '{')
		if start < 0 {
			return false
		}
		raw = raw[start:]
		decoder := json.NewDecoder(strings.NewReader(raw))
		decoder.UseNumber()
		var value map[string]any
		if decoder.Decode(&value) == nil {
			return conversationVerificationObject(value, depth+1)
		}
		raw = raw[1:]
	}
	return false
}

func conversationVerificationObject(value map[string]any, depth int) bool {
	if depth > 6 {
		return false
	}
	if fmt.Sprint(value["code"]) == "11128" {
		for _, key := range []string{"msg", "message"} {
			if message, ok := value[key].(string); ok && strings.EqualFold(strings.TrimSpace(message), "conversation id missing") {
				return true
			}
		}
	}
	for _, key := range []string{"error", "message", "detail", "raw"} {
		switch nested := value[key].(type) {
		case map[string]any:
			if conversationVerificationObject(nested, depth+1) {
				return true
			}
		case string:
			if conversationVerificationJSON(nested, depth+1) {
				return true
			}
		}
	}
	return false
}

func (e *NewAPIError) IsUpstreamConversationVerificationFailure() bool {
	if e == nil || (e.errorType != ErrorTypeOpenAIError && e.errorType != ErrorTypeClaudeError && e.errorType != ErrorTypeUpstreamError) {
		return false
	}
	if IsUpstreamConversationVerificationBody(e.Error()) {
		return true
	}
	var message string
	switch upstream := e.RelayError.(type) {
	case OpenAIError:
		message = upstream.Message
	case ClaudeError:
		message = upstream.Message
	}
	if string(e.errorCode) == "11128" && strings.EqualFold(strings.TrimSpace(message), "conversation id missing") {
		return true
	}
	return IsUpstreamConversationVerificationBody(message)
}

// publicUpstreamServiceMessage leaves Err, status and retry metadata untouched.
// Only the gateway's safe request-id suffix is carried into the public message.
func (e *NewAPIError) publicUpstreamServiceMessage() string {
	message := ModelServiceErrorMessage
	raw := e.Error()
	const marker = " (request id: "
	start := strings.LastIndex(raw, marker)
	if start < 0 || !strings.HasSuffix(raw, ")") {
		return message
	}
	id := raw[start+len(marker) : len(raw)-1]
	if len(id) == 0 || len(id) > 128 {
		return message
	}
	for _, character := range id {
		if !(character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' || character == '-' || character == '_') {
			return message
		}
	}
	return message + raw[start:]
}
