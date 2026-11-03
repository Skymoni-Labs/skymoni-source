package controller

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestMinimalHealthProbeCapsOverriddenRequest(t *testing.T) {
	raw, err := minimalHealthProbeBody([]byte(`{"max_tokens":100000,"max_completion_tokens":99999,"stream":true,"messages":[{"role":"user","content":"expensive"}]}`))
	require.NoError(t, err)
	var body map[string]any
	require.NoError(t, json.Unmarshal(raw, &body))
	require.Equal(t, float64(8), body["max_tokens"])
	require.Equal(t, false, body["stream"])
	require.NotContains(t, body, "max_completion_tokens")
	require.Contains(t, string(raw), "Reply 1.")
}

func TestHealthHysteresisAndBoundedHistory(t *testing.T) {
	var state model.ChannelHealthState
	for i := 0; i < 2; i++ {
		advanceChannelHealth(&state, model.ChannelHealthPoint{At: int64(i + 1), Count: 1, Failures: 1})
	}
	require.Equal(t, 2, state.Failures)
	for i := 0; i < 3; i++ {
		advanceChannelHealth(&state, model.ChannelHealthPoint{At: int64(i + 3), Success: true, Count: 1})
	}
	require.Equal(t, 3, state.Successes)
	require.Zero(t, state.Failures)
	for i := 0; i < 100; i++ {
		advanceChannelHealth(&state, model.ChannelHealthPoint{At: int64(i + 6), Count: 2, Failures: 1})
	}
	require.Len(t, state.History, 60)
	require.Equal(t, "degraded", state.Status)
}
