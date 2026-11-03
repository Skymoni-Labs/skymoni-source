package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
)

func TestModelHealthIntervalAndBudgetPause(t *testing.T) {
	state := model.ChannelHealthState{LastAttemptAt: 1000, Status: "available"}
	require.False(t, modelHealthDue(state, 2799))
	require.True(t, modelHealthDue(state, 2800))
	state.Status = "unavailable"
	require.False(t, modelHealthDue(state, 1299))
	require.True(t, modelHealthDue(state, 1300))
	state.BudgetPaused = true
	require.False(t, modelHealthDue(state, 2000))
}

func TestGroupHealthAdaptiveBackoffAndSkippedBudget(t *testing.T) {
	pool := model.ChannelHealthPool{Auto: true}
	for failures, want := range []int64{1800, 300, 300, 900, 1800, 3600, 3600} {
		require.Equal(t, want, channelHealthInterval(pool, model.ChannelHealthState{Failures: failures}))
	}
	state := model.ChannelHealthState{}
	point, complete := collectChannelHealthSamples(&state, []model.Channel{{Id: 1}, {Id: 2}}, nil, 1000, nil, func(model.Channel) healthSample { return healthSample{skipped: true} })
	require.False(t, complete)
	require.Zero(t, point.Count)
	require.False(t, state.BudgetPaused)
	require.Zero(t, state.Failures)
	for i := range 61 {
		advanceModelHealth(&state, model.ChannelHealthPoint{At: int64(i + 1), Success: true, Count: 1, Source: "real"})
	}
	require.Len(t, state.History, 60)
	require.EqualValues(t, 2, state.History[0].At)
	require.Equal(t, "available", state.Status)
}

func TestModelHealthProbeUsesOneGreetingRequestAndNoFallback(t *testing.T) {
	fixture := newResponsesWSBillingTest(t, `tier("request", fixed(0.002))`, func(*websocket.Conn, *http.Request) {})
	require.NoError(t, model.DB.AutoMigrate(&model.Option{}))
	var calls atomic.Int32
	var fail atomic.Bool
	var completionTokens atomic.Int32
	completionTokens.Store(1)
	fixture.httpUpstream = func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, float64(1), body["max_tokens"])
		require.Equal(t, []any{map[string]any{"role": "user", "content": "hello"}}, body["messages"])
		if fail.Load() {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = fmt.Fprint(w, `{"error":{"message":"upstream unavailable"}}`)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"id":"health-test","object":"chat.completion","model":"gpt-4o","choices":[{"index":0,"message":{"role":"assistant","content":"Hi"},"finish_reason":"length"}],"usage":{"prompt_tokens":1,"completion_tokens":%d,"total_tokens":%d}}`, completionTokens.Load(), completionTokens.Load()+1)
	}
	state := model.ChannelHealthState{LastAttemptAt: time.Now().Unix()}
	runModelHealthProbe("ws-billing", state, fixture.user.Id)
	require.EqualValues(t, 1, calls.Load())
	saved := model.ReadModelHealthState("ws-billing")
	require.Equal(t, "available", saved.Status)
	require.Len(t, saved.History, 1)
	require.Equal(t, 1, saved.History[0].Count)
	require.False(t, saved.BudgetPaused)
	fail.Store(true)
	saved.LastAttemptAt += 180
	runModelHealthProbe("ws-billing", saved, fixture.user.Id)
	require.EqualValues(t, 2, calls.Load())
	saved = model.ReadModelHealthState("ws-billing")
	require.Equal(t, "unavailable", saved.Status)
	require.Len(t, saved.History, 2)
	require.Equal(t, 1, saved.History[1].Failures)
	fail.Store(false)
	completionTokens.Store(9)
	saved.LastAttemptAt += 180
	runModelHealthProbe("ws-billing", saved, fixture.user.Id)
	require.EqualValues(t, 3, calls.Load())
	saved = model.ReadModelHealthState("ws-billing")
	require.True(t, saved.BudgetPaused)
	require.Equal(t, "unknown", saved.Status)
	require.NoError(t, model.DB.Model(&model.Model{}).Where("model_name = ?", "ws-billing").Update("status", 0).Error)
	runModelHealthProbe("ws-billing", saved, fixture.user.Id)
	require.EqualValues(t, 3, calls.Load(), "unpublished models must not spend probe quota")
}
