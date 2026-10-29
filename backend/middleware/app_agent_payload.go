package middleware

import (
	"bytes"
	"encoding/json"
	"errors"
	"regexp"
)

// Development-only contract for the candidate authenticated agent route.
// The worktree must not be deployed until routing, billing, publication and
// streaming have been tested together.
type appAgentFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters,omitempty"`
	Arguments   string          `json:"arguments,omitempty"`
}

type appAgentTool struct {
	Type     string           `json:"type"`
	Function appAgentFunction `json:"function"`
}

type appAgentCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Function appAgentFunction `json:"function"`
}

type appAgentMessage struct {
	Role       string          `json:"role"`
	Content    json.RawMessage `json:"content"`
	ToolCalls  []appAgentCall  `json:"tool_calls,omitempty"`
	ToolCallID string          `json:"tool_call_id,omitempty"`
}

type appAgentPayload struct {
	Model     string            `json:"model"`
	Messages  []appAgentMessage `json:"messages"`
	Tools     []appAgentTool    `json:"tools,omitempty"`
	Stream    bool              `json:"stream"`
	MaxTokens int               `json:"max_tokens"`
}

var appAgentName = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
var appAgentCallID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)
var errAppAgentPayload = errors.New("invalid agent request")

func appAgentObject(raw []byte) bool {
	var object map[string]json.RawMessage
	return json.Unmarshal(raw, &object) == nil && object != nil
}

// Parse into a closed wire type so fields such as group, billing, endpoint,
// and arbitrary upstream options can never survive reserialization. Route and
// published-model checks are the responsibility of the authenticated caller.
func parseAppAgentPayload(data []byte) (appAgentPayload, error) {
	var p appAgentPayload
	if len(data) == 0 || len(data) > 256<<10 || json.Unmarshal(data, &p) != nil ||
		p.Model == "" || len(p.Model) > 200 || p.MaxTokens < 1 || p.MaxTokens > 4096 ||
		len(p.Messages) == 0 || len(p.Messages) > 128 || len(p.Tools) > 64 {
		return p, errAppAgentPayload
	}
	toolNames := make(map[string]bool)
	for _, tool := range p.Tools {
		f := tool.Function
		if tool.Type != "function" || !appAgentName.MatchString(f.Name) || toolNames[f.Name] ||
			len(f.Description) > 8192 || !appAgentObject(f.Parameters) || f.Arguments != "" {
			return p, errAppAgentPayload
		}
		toolNames[f.Name] = true
	}
	pending := make(map[string]bool)
	seen := make(map[string]bool)
	for _, m := range p.Messages {
		if m.Role != "system" && m.Role != "user" && m.Role != "assistant" && m.Role != "tool" {
			return p, errAppAgentPayload
		}
		if m.Role != "assistant" && len(m.ToolCalls) != 0 || m.Role != "tool" && m.ToolCallID != "" {
			return p, errAppAgentPayload
		}
		if len(pending) != 0 && m.Role != "tool" {
			return p, errAppAgentPayload
		}
		var text string
		if json.Unmarshal(m.Content, &text) != nil || bytes.Equal(bytes.TrimSpace(m.Content), []byte("null")) {
			if m.Role != "assistant" || len(m.ToolCalls) == 0 || !bytes.Equal(bytes.TrimSpace(m.Content), []byte("null")) {
				return p, errAppAgentPayload
			}
		}
		if m.Role == "tool" {
			if !pending[m.ToolCallID] {
				return p, errAppAgentPayload
			}
			delete(pending, m.ToolCallID)
		}
		if len(m.ToolCalls) > 16 {
			return p, errAppAgentPayload
		}
		for _, call := range m.ToolCalls {
			f := call.Function
			if !appAgentCallID.MatchString(call.ID) || seen[call.ID] || call.Type != "function" ||
				!appAgentName.MatchString(f.Name) || !appAgentObject([]byte(f.Arguments)) ||
				f.Description != "" || len(f.Parameters) != 0 {
				return p, errAppAgentPayload
			}
			seen[call.ID] = true
			pending[call.ID] = true
		}
	}
	if len(pending) != 0 {
		return p, errAppAgentPayload
	}
	return p, nil
}
