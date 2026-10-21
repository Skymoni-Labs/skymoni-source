package types

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
)

const supplierVerificationFixture = `{"code":11128,"msg":"conversation id missing","requestId":"vendor-private-id","displayTips":{"zh":"请用官方版本重新发送。"},"actions":["EDIT_INPUT"]}`

func TestSupplierVerificationPublicErrorsPreserveInternalDetails(t *testing.T) {
	wrapped, _ := json.Marshal(map[string]any{"error": map[string]any{"message": supplierVerificationFixture, "type": "invalid_request_error"}})
	for _, raw := range []string{supplierVerificationFixture, string(wrapped), "上游渠道风控——请修改系统提示词；raw: " + supplierVerificationFixture} {
		t.Run(raw[:10], func(t *testing.T) {
			err := WithOpenAIError(OpenAIError{Message: raw, Type: "invalid_request_error", Code: "original_code", Metadata: json.RawMessage(`{"secret":"vendor-detail"}`)}, http.StatusBadRequest)
			err.RetryAfter = 123
			err.SetMessage(raw + " (request id: gateway-id-123)")
			before := err.Error()
			public := err.ToOpenAIError()
			if public.Type != "service_error" || public.Code != string(ErrorCodeModelServiceError) || public.Message != ModelServiceErrorMessage+" (request id: gateway-id-123)" || len(public.Metadata) != 0 {
				t.Fatalf("unexpected public error: %+v", public)
			}
			claude := err.ToClaudeError()
			if claude.Type != string(ErrorCodeModelServiceError) || claude.Message != public.Message {
				t.Fatalf("inconsistent Claude error: %+v", claude)
			}
			if err.Error() != before || err.GetErrorCode() != "original_code" || err.StatusCode != http.StatusBadRequest || err.RetryAfter != 123 {
				t.Fatal("public conversion changed routing or diagnostic data")
			}
		})
	}
}

func TestSupplierVerificationStrictMatching(t *testing.T) {
	for _, raw := range []string{
		`{"code":"11128","msg":"conversation id missing"}`,
		`{"error":{"code":11128,"message":"conversation id missing"}}`,
	} {
		if !IsUpstreamConversationVerificationBody(raw) {
			t.Errorf("did not recognize %s", raw)
		}
	}
	for _, raw := range []string{
		`{"code":11129,"msg":"conversation id missing"}`,
		`{"code":111280,"msg":"conversation id missing"}`,
		`{"code":11128,"msg":"different failure"}`,
		`{"message":"conversation id missing"}`,
		`{"msg":"unrelated","displayMsg":{"code":11128,"msg":"conversation id missing"}}`,
		`11128 conversation id missing`,
		`{"code":11128,`,
	} {
		if IsUpstreamConversationVerificationBody(raw) {
			t.Errorf("incorrectly recognized %s", raw)
		}
	}
	local := NewError(errors.New(supplierVerificationFixture), ErrorCodeInvalidRequest)
	if local.ToOpenAIError().Message == ModelServiceErrorMessage {
		t.Fatal("rewrote a local/client error")
	}
	ordinary := WithOpenAIError(OpenAIError{Message: "insufficient quota", Type: "quota_error", Code: "quota_exceeded"}, 429)
	if ordinary.ToOpenAIError().Message != "insufficient quota" || ordinary.ToOpenAIError().Code != "quota_exceeded" {
		t.Fatal("rewrote an unrelated upstream error")
	}
	bare := WithOpenAIError(OpenAIError{Message: "conversation id missing", Code: 11128}, 400)
	if bare.ToOpenAIError().Code != string(ErrorCodeModelServiceError) {
		t.Fatal("missed a typed supplier error")
	}
	bare.SetMessage(supplierVerificationFixture + " (request id: invalid<id)")
	if strings.Contains(bare.ToOpenAIError().Message, "invalid<id") {
		t.Fatal("unsafe request id leaked")
	}
}
