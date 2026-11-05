package controller

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestMinimalHealthProbeCapsOverriddenRequest(t *testing.T) {
	raw, err := minimalHealthProbeBody([]byte(`{"max_tokens":100000,"max_completion_tokens":99999,"stream":true,"messages":[{"role":"user","content":"expensive"}]}`), 8)
	require.NoError(t, err)
	var body map[string]any
	require.NoError(t, json.Unmarshal(raw, &body))
	require.Equal(t, float64(8), body["max_tokens"])
	require.Equal(t, false, body["stream"])
	require.NotContains(t, body, "max_completion_tokens")
	require.Equal(t, []any{map[string]any{"role": "user", "content": "reply ok"}}, body["messages"])
}

func TestHealthHysteresisAndBoundedHistory(t *testing.T) {
	state := model.ChannelHealthState{Successes: 17, Failures: 2, BudgetPaused: true}
	// Historical single-key streaks must not carry into the new policy.
	require.True(t, resetChannelHealthPolicy(&state))
	require.Zero(t, state.Failures)
	require.Zero(t, state.Successes)
	require.True(t, state.BudgetPaused)
	for i := 0; i < 2; i++ {
		advanceChannelHealth(&state, model.ChannelHealthPoint{At: int64(i + 1), Count: 2, Failures: 2})
		_, apply := channelHealthTransition(state)
		require.False(t, apply)
	}
	require.Equal(t, 2, state.Failures)
	advanceChannelHealth(&state, model.ChannelHealthPoint{At: 3, Count: 2, Failures: 1})
	enable, apply := channelHealthTransition(state)
	require.True(t, enable) // Exactly half succeeds: immediate enable.
	require.True(t, apply)
	require.Zero(t, state.Failures)
	require.Equal(t, "degraded", state.Status)
	require.True(t, state.History[len(state.History)-1].Success)
	for i := 0; i < 3; i++ {
		advanceChannelHealth(&state, model.ChannelHealthPoint{At: int64(i + 4), Count: 2, Failures: 2})
	}
	enable, apply = channelHealthTransition(state)
	require.False(t, enable)
	require.True(t, apply)
	require.Equal(t, 3, state.Failures)
	require.False(t, advanceChannelHealth(&state, model.ChannelHealthPoint{At: 99}))
	require.Equal(t, 3, state.Failures)
	for i := 0; i < 100; i++ {
		advanceChannelHealth(&state, model.ChannelHealthPoint{At: int64(i + 7), Count: 2, Failures: 1})
	}
	require.Len(t, state.History, 60)
	require.Equal(t, "degraded", state.Status)
}

func TestHealthSamplesUseDistinctKeysAndPreferRealTraffic(t *testing.T) {
	channels := []model.Channel{{Id: 1}, {Id: 2}, {Id: 3}}
	logs := []model.Log{
		{ChannelId: 1, Type: model.LogTypeConsume, CompletionTokens: 3, UseTime: 2},
		{ChannelId: 1, Type: model.LogTypeError}, // Older duplicate does not vote again.
		{ChannelId: 2, Type: model.LogTypeError},
	}
	var state model.ChannelHealthState
	point, complete := collectChannelHealthSamples(&state, channels, logs, 1000, nil, func(model.Channel) healthSample {
		t.Fatal("two real keys should require no paid probes")
		return healthSample{}
	})
	require.True(t, complete)
	require.Equal(t, 2, point.Count)
	require.Equal(t, 1, point.Failures)
	require.Equal(t, "real", point.Source)
	require.Equal(t, int64(1000), point.LatencyMs)
	require.Equal(t, 2, state.Cursor)
	var probed []int
	point, complete = collectChannelHealthSamples(&state, channels, logs[:2], 1300, nil, func(ch model.Channel) healthSample {
		probed = append(probed, ch.Id)
		return healthSample{success: true, latency: 3000}
	})
	require.True(t, complete)
	require.Equal(t, []int{2}, probed)
	require.Equal(t, "mixed", point.Source)
	require.Equal(t, 2, point.Count)
	require.Zero(t, point.Failures)
}

func TestHealthProbeRotationAndBudgetIncompleteRound(t *testing.T) {
	channels := []model.Channel{{Id: 1}, {Id: 2}, {Id: 3}}
	state := model.ChannelHealthState{Cursor: 2}
	var probed []int
	point, complete := collectChannelHealthSamples(&state, channels, nil, 1000, nil, func(ch model.Channel) healthSample {
		probed = append(probed, ch.Id)
		return healthSample{success: true}
	})
	require.True(t, complete)
	require.Equal(t, []int{3, 1}, probed)
	require.Equal(t, "probe", point.Source)
	point, complete = collectChannelHealthSamples(&state, channels, nil, 1300, nil, func(ch model.Channel) healthSample {
		return healthSample{success: true, overBudget: true}
	})
	require.False(t, complete) // One of the required two is never a full round.
	require.Equal(t, 1, point.Count)
	require.True(t, state.BudgetPaused)
	require.Empty(t, state.History)
	_, complete = collectChannelHealthSamples(&state, channels, nil, 1600, nil, func(model.Channel) healthSample {
		t.Fatal("budget pause must prevent further paid probes")
		return healthSample{}
	})
	require.False(t, complete)
	// Paused paid probes can still recover using two distinct real requests.
	logs := []model.Log{{ChannelId: 1, Type: model.LogTypeConsume, CompletionTokens: 1}, {ChannelId: 2, Type: model.LogTypeError}}
	point, complete = collectChannelHealthSamples(&state, channels, logs, 1900, nil, nil)
	require.True(t, complete)
	require.True(t, advanceChannelHealth(&state, point))
	enable, apply := channelHealthTransition(state)
	require.True(t, enable)
	require.True(t, apply)
}

func TestHealthProbeUsageBudget(t *testing.T) {
	require.False(t, healthProbeUsageOverBudget(14, 8, 8))
	require.True(t, healthProbeUsageOverBudget(845, 514, 8))
	require.True(t, healthProbeUsageOverBudget(14, 9, 8))
}

func TestHealthPoolProbeLimitsAndMinimalRequest(t *testing.T) {
	defaults := channelHealthProbeLimits(model.ChannelHealthPool{})
	require.Equal(t, healthProbeLimits{MaxOutputTokens: 1, OutputBudgetTokens: 8}, defaults)
	require.Equal(t, defaults, channelHealthProbeLimits(model.ChannelHealthPool{ProbeMaxOutputTokens: 1000, ProbeOutputBudgetTokens: 1000}))
	limits := channelHealthProbeLimits(model.ChannelHealthPool{ProbeMaxOutputTokens: 1, ProbeOutputBudgetTokens: 16})
	raw, err := minimalHealthProbeBody([]byte(`{"max_tokens":10000,"stream":true}`), limits.MaxOutputTokens)
	require.NoError(t, err)
	var body map[string]any
	require.NoError(t, json.Unmarshal(raw, &body))
	require.Equal(t, float64(1), body["max_tokens"])
	require.False(t, healthProbeUsageOverBudget(35, 11, limits.OutputBudgetTokens))
	require.True(t, healthProbeUsageOverBudget(35, 17, limits.OutputBudgetTokens))
	require.True(t, healthProbeUsageOverBudget(129, 1, limits.OutputBudgetTokens))
}

func TestReasoningHealthProbeHasRoomForVisibleReply(t *testing.T) {
	for _, budget := range []int{0, 8, 64, 1000} {
		limits := channelHealthProbeLimits(model.ChannelHealthPool{ProbeMaxOutputTokens: 64, ProbeOutputBudgetTokens: budget})
		require.Equal(t, healthProbeLimits{MaxOutputTokens: 64, OutputBudgetTokens: 64}, limits)
		raw, err := minimalHealthProbeBody([]byte(`{"model":"deepseek-v4.1-flash","max_tokens":1,"messages":[{"role":"user","content":"hello"}]}`), limits.MaxOutputTokens)
		require.NoError(t, err)
		var body map[string]any
		require.NoError(t, json.Unmarshal(raw, &body))
		require.Equal(t, float64(64), body["max_tokens"])
		require.Equal(t, []any{map[string]any{"role": "user", "content": "reply ok"}}, body["messages"])
		require.False(t, healthProbeUsageOverBudget(31, 64, limits.OutputBudgetTokens))
		require.True(t, healthProbeUsageOverBudget(31, 65, limits.OutputBudgetTokens))
	}
	require.Equal(t, healthProbeLimits{MaxOutputTokens: 1, OutputBudgetTokens: 8}, channelHealthProbeLimits(model.ChannelHealthPool{ProbeMaxOutputTokens: 65, ProbeOutputBudgetTokens: 65}))
}

func TestModelHealthUsesLimitsForExactUpstreamRoute(t *testing.T) {
	mapping := `{"low":"deepseek-v4.1-flash","pro":"deepseek-v4-pro"}`
	channel := &model.Channel{Id: 349, Key: "test-key", Models: "low,pro", ModelMapping: &mapping}
	pool := model.ChannelHealthPool{UpstreamModel: "deepseek-v4.1-flash", ProbeMaxOutputTokens: 64, ProbeOutputBudgetTokens: 64, Channels: map[int]string{349: model.ChannelHealthSignature(channel)}}
	config := model.ChannelHealthConfig{Pools: []model.ChannelHealthPool{pool}}
	require.Equal(t, healthProbeLimits{MaxOutputTokens: 64, OutputBudgetTokens: 64}, modelHealthProbeLimits("low", channel, config))
	defaults := healthProbeLimits{MaxOutputTokens: 1, OutputBudgetTokens: 8}
	require.Equal(t, defaults, modelHealthProbeLimits("pro", channel, config))
	channel.Key = "changed-key"
	require.Equal(t, defaults, modelHealthProbeLimits("low", channel, config))
	channel.Id = 350
	require.Equal(t, defaults, modelHealthProbeLimits("low", channel, config))
}

func TestGPTHealthProbeUsesSupportedCapsAndBoundedUsage(t *testing.T) {
	limits := channelHealthProbeLimits(model.ChannelHealthPool{ProbeOutputBudgetTokens: 16})
	require.True(t, healthProbeUsageOverBudget(22424, 13, limits.OutputBudgetTokens))
	for _, name := range []string{"gpt-6-astra", "gpt-6.1-sol"} {
		raw, err := minimalHealthProbeBody([]byte(`{"model":"`+name+`","max_tokens":1000,"thinking":{"type":"enabled"},"reasoning_effort":"high"}`), 1)
		require.NoError(t, err)
		var body map[string]any
		require.NoError(t, json.Unmarshal(raw, &body))
		require.Equal(t, float64(1), body["max_completion_tokens"])
		require.Equal(t, "low", body["reasoning_effort"])
		require.NotContains(t, body, "max_tokens")
		require.NotContains(t, body, "thinking")
	}
}

func TestHealthRealLogsStayWithinTheirUpstreamModel(t *testing.T) {
	mapping := `{"astra":"gpt-6-astra","astra-legacy":"gpt-6-astra","sol":"gpt-6.1-sol"}`
	channels := []model.Channel{{Id: 1, Models: "astra,astra-legacy,sol", ModelMapping: &mapping}}
	logs := []model.Log{{Id: 1, ChannelId: 1, ModelName: "sol"}, {Id: 2, ChannelId: 1, ModelName: "astra"}, {Id: 3, ChannelId: 1, ModelName: "astra-legacy"}}
	filtered := channelHealthModelLogs(model.ChannelHealthPool{UpstreamModel: "gpt-6-astra"}, channels, logs)
	require.Len(t, filtered, 2)
	require.Equal(t, 2, filtered[0].Id)
	require.Equal(t, 3, filtered[1].Id)
}

func TestGPTRealTrafficOnlyNeverAddsPaidSamples(t *testing.T) {
	state := model.ChannelHealthState{BudgetPaused: true, PauseReason: "owner_real_traffic_only"}
	require.True(t, resetChannelHealthPolicy(&state))
	require.True(t, state.BudgetPaused)
	require.Equal(t, "owner_real_traffic_only", state.PauseReason)
	channels := []model.Channel{{Id: 1}, {Id: 2}}
	probe := func(model.Channel) healthSample { t.Fatal("owner paused paid probing"); return healthSample{} }
	_, complete := collectChannelHealthSamples(&state, channels, nil, 1000, nil, probe)
	require.False(t, complete)
	logs := []model.Log{{ChannelId: 1, Type: model.LogTypeConsume, CompletionTokens: 1}, {ChannelId: 2, Type: model.LogTypeConsume, CompletionTokens: 1}}
	point, complete := collectChannelHealthSamples(&state, channels, logs, 1300, nil, probe)
	require.True(t, complete)
	require.True(t, advanceChannelHealth(&state, point))
	require.True(t, state.BudgetPaused)
	require.False(t, modelHealthDue(state, 10000))
}

func TestHealthSharedPoolSamplesDifferentAccounts(t *testing.T) {
	channels := []model.Channel{{Id: 1}, {Id: 2}, {Id: 3}, {Id: 4}}
	accounts := map[int]string{1: "first", 2: "first", 3: "second", 4: "second"}
	logs := []model.Log{{ChannelId: 1, Type: model.LogTypeConsume, CompletionTokens: 1}, {ChannelId: 2, Type: model.LogTypeError}}
	var state model.ChannelHealthState
	var probed []int
	point, complete := collectChannelHealthSamples(&state, channels, logs, 1000, accounts, func(channel model.Channel) healthSample {
		probed = append(probed, channel.Id)
		return healthSample{success: true}
	})
	require.True(t, complete)
	require.Equal(t, []int{3}, probed)
	require.Equal(t, 2, point.Count)
	require.Zero(t, point.Failures)
	require.Equal(t, "mixed", point.Source)
	probed = nil
	_, complete = collectChannelHealthSamples(&state, channels, nil, 1300, accounts, func(channel model.Channel) healthSample {
		probed = append(probed, channel.Id)
		return healthSample{success: true}
	})
	require.True(t, complete)
	require.Equal(t, []int{4, 1}, probed)
}

func TestHealthProbeUsesEachChannelsPublishedAlias(t *testing.T) {
	pool := model.ChannelHealthPool{UpstreamModel: "deepseek-v4.1-flash"}
	mapping := `{"deepseek-v4.1-flash-low":"deepseek-v4.1-flash","deepseek-v4-pro":"deepseek-v4-pro"}`
	require.Equal(t, "deepseek-v4.1-flash-low", channelHealthProbeModel(pool, model.Channel{Models: "deepseek-v4-pro,deepseek-v4.1-flash-low", ModelMapping: &mapping}))
	require.Equal(t, "deepseek-v4.1-flash", channelHealthProbeModel(pool, model.Channel{Models: "deepseek-v4.1-flash"}))
	require.Empty(t, channelHealthProbeModel(pool, model.Channel{Models: "deepseek-v4-pro"}))
}
