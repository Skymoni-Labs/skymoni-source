package middleware

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAppAgentPayloadRetainsToolLoopAndDropsOverrides(t *testing.T) {
	data := `{"model":"published-model","stream":true,"max_tokens":512,"group":"admin","funding":"beta","endpoint":"https://example.invalid","messages":[{"role":"user","content":"create a file"},{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"write_file","arguments":"{\"path\":\"a.txt\"}"}}]},{"role":"tool","tool_call_id":"call_1","content":"saved"}],"tools":[{"type":"function","function":{"name":"write_file","description":"write a file","parameters":{"type":"object","properties":{"path":{"type":"string"}}}}}]}`
	p, err := parseAppAgentPayload([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	result, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	if err = json.Unmarshal(result, &body); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"group", "funding", "endpoint"} {
		if _, exists := body[key]; exists {
			t.Fatalf("override survived: %s", key)
		}
	}
	messages := body["messages"].([]any)
	call := messages[1].(map[string]any)["tool_calls"].([]any)[0].(map[string]any)
	if call["id"] != "call_1" || messages[2].(map[string]any)["tool_call_id"] != "call_1" || len(body["tools"].([]any)) != 1 {
		t.Fatal("tool loop was lost")
	}
}

func TestAppAgentPayloadRejectsMalformedAndIncompleteToolLoops(t *testing.T) {
	valid := `{"model":"m","max_tokens":10,"messages":[{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"run","arguments":"{}"}}]},{"role":"tool","tool_call_id":"call_1","content":"ok"}]}`
	cases := map[string]string{
		"orphan result":   strings.Replace(valid, `"tool_call_id":"call_1"`, `"tool_call_id":"other"`, 1),
		"unanswered call": strings.Replace(valid, `,{"role":"tool","tool_call_id":"call_1","content":"ok"}`, ``, 1),
		"bad arguments":   strings.Replace(valid, `"arguments":"{}"`, `"arguments":"[]"`, 1),
		"bad role":        strings.Replace(valid, `"role":"tool"`, `"role":"admin"`, 1),
		"external tool":   strings.Replace(valid, `"type":"function"`, `"type":"web_search"`, 1),
		"too many bytes":  strings.Repeat("x", 256<<10+1),
		"zero output":     strings.Replace(valid, `"max_tokens":10`, `"max_tokens":0`, 1),
	}
	if _, err := parseAppAgentPayload([]byte(valid)); err != nil {
		t.Fatalf("valid request: %v", err)
	}
	for name, input := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := parseAppAgentPayload([]byte(input)); err == nil {
				t.Fatal("invalid request accepted")
			}
		})
	}
}
