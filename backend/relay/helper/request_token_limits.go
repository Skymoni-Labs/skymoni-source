package helper

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// ModelRequestTokenLimits is optional administrator configuration. It controls
// admission and the final provider body without rewriting any channel settings.
type ModelRequestTokenLimits struct {
	MaxInputTokens  int  `json:"max_input_tokens"`
	MaxOutputTokens uint `json:"max_output_tokens"`
}

func RequestTokenLimits(modelName string) (ModelRequestTokenLimits, error) {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap["ModelRequestTokenLimits"]
	common.OptionMapRWMutex.RUnlock()
	if raw == "" {
		return ModelRequestTokenLimits{}, nil
	}
	var entries map[string]ModelRequestTokenLimits
	if err := common.UnmarshalJsonStr(raw, &entries); err != nil {
		return ModelRequestTokenLimits{}, fmt.Errorf("invalid model request limits")
	}
	limits, ok := entries[modelName]
	if !ok {
		limits = entries[ratio_setting.RoutingMatchModelName(modelName)]
	}
	if limits.MaxInputTokens < 0 || limits.MaxOutputTokens > maxTokensLimit {
		return ModelRequestTokenLimits{}, fmt.Errorf("invalid model request limits")
	}
	return limits, nil
}

func ValidateLimitedRequest(info *relaycommon.RelayInfo, limits ModelRequestTokenLimits) error {
	if limits.MaxInputTokens == 0 && limits.MaxOutputTokens == 0 {
		return nil
	}
	switch request := info.Request.(type) {
	case *dto.GeneralOpenAIRequest:
		if request.N != nil && *request.N > 1 {
			return fmt.Errorf("this request-priced model supports only one completion per request (n=1)")
		}
	case *dto.GeminiChatRequest:
		if len(request.Requests) > 0 || request.GenerationConfig.CandidateCount != nil && *request.GenerationConfig.CandidateCount > 1 {
			return fmt.Errorf("this request-priced model supports only one completion per request")
		}
		if request.CachedContent != "" {
			return fmt.Errorf("send the complete input instead of cachedContent so the input limit can be checked")
		}
	case *dto.OpenAIResponsesRequest:
		if request.PreviousResponseID != "" || len(request.Conversation) > 0 && string(request.Conversation) != "null" {
			return fmt.Errorf("send the complete input instead of a stored response/conversation so the input limit can be checked")
		}
	case *dto.ClaudeRequest:
	default:
		return fmt.Errorf("this request-priced model supports chat generation only")
	}
	return nil
}

// LimitUpstreamOutput runs after protocol conversion, channel overrides and
// passthrough selection, including every retry. Missing limits receive a safe
// default; smaller explicit limits remain intact. Other models retain the reader.
func LimitUpstreamOutput(info *relaycommon.RelayInfo, target string, body io.Reader) (io.Reader, error) {
	limits, err := RequestTokenLimits(info.GetOriginModelName())
	if err != nil {
		return nil, err
	}
	if limits.MaxOutputTokens == 0 {
		return body, nil
	}
	data, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}
	if !gjson.ValidBytes(data) || !gjson.ParseBytes(data).IsObject() {
		return nil, fmt.Errorf("model output limits require a JSON request")
	}
	for _, path := range []string{"previous_response_id", "conversation", "cachedContent", "cached_content", "requests"} {
		value := gjson.GetBytes(data, path)
		if value.Exists() && value.Type != gjson.Null && value.Raw != `""` && value.Raw != "[]" {
			return nil, fmt.Errorf("send a complete single request so the input limit can be checked")
		}
	}
	paths := []string{"max_tokens", "max_completion_tokens", "max_output_tokens", "generationConfig.maxOutputTokens", "generationConfig.max_output_tokens", "generation_config.max_output_tokens", "generation_config.maxOutputTokens", "parameters.max_tokens", "parameters.max_output_tokens"}
	var required string
	switch {
	case strings.Contains(target, ":generateContent"), strings.Contains(target, ":streamGenerateContent"):
		required = "generationConfig.maxOutputTokens"
	case strings.Contains(target, "/responses"):
		required = "max_output_tokens"
	case strings.Contains(target, "/chat/completions"), strings.Contains(target, "/completions"), strings.Contains(target, "/messages"):
		required = "max_tokens"
		if gjson.GetBytes(data, "max_completion_tokens").Exists() {
			required = "max_completion_tokens"
		}
	default:
		return nil, fmt.Errorf("unsupported upstream endpoint for model output limits")
	}
	for _, path := range paths {
		value := gjson.GetBytes(data, path)
		if !value.Exists() && path != required {
			continue
		}
		if !value.Exists() || value.Type != gjson.Number || value.Float() <= 0 || value.Float() > float64(limits.MaxOutputTokens) {
			data, err = sjson.SetBytes(data, path, limits.MaxOutputTokens)
			if err != nil {
				return nil, err
			}
		}
	}
	for _, path := range []string{"n", "generationConfig.candidateCount", "generationConfig.candidate_count", "generation_config.candidate_count", "generation_config.candidateCount"} {
		if gjson.GetBytes(data, path).Exists() {
			data, err = sjson.SetBytes(data, path, 1)
			if err != nil {
				return nil, err
			}
		}
	}
	return bytes.NewReader(data), nil
}

func RequestLimitError(err error) *types.NewAPIError {
	return types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithStatusCode(http.StatusBadRequest), types.ErrOptionWithSkipRetry())
}
