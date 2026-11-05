package controller

import (
	"context"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const modelHealthIntervalSeconds = 1800

func modelHealthInterval(state model.ChannelHealthState) int64 {
	if state.Status == "available" {
		return modelHealthIntervalSeconds
	}
	return 300
}

func modelHealthDue(state model.ChannelHealthState, now int64) bool {
	return !state.BudgetPaused && (state.LastAttemptAt == 0 || now-state.LastAttemptAt >= modelHealthInterval(state))
}

func publishedDeepSeekHealthModels() ([]string, error) {
	var metadata []model.Model
	if err := model.DB.Select("model_name").Where("status = ?", 1).Find(&metadata).Error; err != nil {
		return nil, err
	}
	names := make([]string, 0)
	gptModels, _ := model.RoutingModelGroupModels("015gpt")
	for _, item := range metadata {
		if !strings.Contains(strings.ToLower(item.ModelName), "deepseek") && !slices.Contains(gptModels, item.ModelName) {
			continue
		}
		published, err := model.IsModelPublished(item.ModelName)
		if err != nil {
			return nil, err
		}
		if published {
			names = append(names, item.ModelName)
		}
	}
	sort.Strings(names)
	return names, nil
}

func runModelHealthWorker() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		func() {
			defer func() {
				if recover() != nil {
					common.SysError("model health round failed")
				}
			}()
			runModelHealthRound()
		}()
	}
}

func runModelHealthRound() {
	var enabled bool
	if model.ReadChannelHealthJSON(model.ModelHealthEnabledKey, &enabled) != nil || !enabled {
		return
	}
	now := time.Now().Unix()
	if !model.ClaimModelHealthRound(now) {
		return
	}
	defer model.ReleaseModelHealthRound(now)
	names, err := publishedDeepSeekHealthModels()
	if err != nil {
		return
	}
	userID, err := resolveChannelTestUserID(nil)
	if err != nil {
		return
	}
	var pending sync.WaitGroup
	for _, name := range names {
		state := model.ReadModelHealthState(name)
		logs, err := model.RecentModelHealthLogs(name, max(now-modelHealthIntervalSeconds, state.LastAt))
		if err != nil {
			continue
		}
		observed := false
		for _, log := range logs {
			if success, counted := model.ChannelHealthLogOutcome(log); counted {
				point := model.ChannelHealthPoint{At: log.CreatedAt, Success: success, LatencyMs: int64(log.UseTime) * 1000, Source: "real", Count: 1}
				if !success {
					point.Failures = 1
				}
				state.LastAttemptAt = now
				advanceModelHealth(&state, point)
				_ = model.SaveModelHealthState(name, state)
				observed = true
				break
			}
		}
		if observed {
			continue
		}
		if !modelHealthDue(state, now) {
			continue
		}
		// Persist before spending quota. A restart cannot create a second probe
		// for the same model during this interval.
		state.LastAttemptAt = now
		if model.SaveModelHealthState(name, state) != nil {
			continue
		}
		pending.Add(1)
		go func() {
			defer pending.Done()
			defer func() {
				if recover() != nil {
					common.SysError("model health sample failed")
				}
			}()
			runModelHealthProbe(name, state, userID)
		}()
	}
	pending.Wait()
}

func runModelHealthProbe(name string, state model.ChannelHealthState, userID int) {
	published, err := model.IsModelPublished(name)
	if err != nil || !published {
		return
	}
	channel, err := model.RandomModelHealthChannel(name)
	if err != nil {
		return
	}
	if channel == nil {
		state.Status = "unavailable"
		state.Action = "暂无启用渠道"
		_ = model.SaveModelHealthState(name, state)
		return
	}
	var config model.ChannelHealthConfig
	if model.ReadChannelHealthJSON(model.ChannelHealthConfigKey, &config) != nil {
		return
	}
	limits := modelHealthProbeLimits(name, channel, config)
	limits.LogLabel = "模型状态检测"
	reserved, err := model.ReserveHealthProbe(time.Now().Unix())
	if err != nil || !reserved {
		state.Action = "主动检测预算暂不可用，继续复用真实请求，次日自动恢复日预算"
		_ = model.SaveModelHealthState(name, state)
		return
	}
	ctx, cancel := context.WithTimeout(context.WithValue(context.Background(), healthProbeContextKey{}, limits), 45*time.Second)
	defer cancel()
	started := time.Now()
	result := testChannel(ctx, channel, userID, name, "", false)
	point := model.ChannelHealthPoint{At: state.LastAttemptAt, Success: result.localErr == nil && result.newAPIError == nil, LatencyMs: time.Since(started).Milliseconds(), Source: "probe", Count: 1}
	if !point.Success {
		point.Failures = 1
		if result.context != nil {
			model.RecordErrorLog(result.context, userID, channel.Id, name, limits.LogLabel, "模型状态检测失败（上游费用待核对）", 0, int(point.LatencyMs/1000), false, result.context.GetString("group"), model.NewLogOther())
		}
	}
	advanceModelHealth(&state, point)
	if result.healthBudgetExceeded {
		state.BudgetPaused = true
		state.Status = "unknown"
		state.Action = "上游计量超出预算，已暂停付费检测"
	}
	if err := model.SaveModelHealthState(name, state); err != nil {
		common.SysError("model health state save failed")
	}
}

// Both health workers must use the approved limits for this exact upstream route.
func modelHealthProbeLimits(name string, channel *model.Channel, config model.ChannelHealthConfig) healthProbeLimits {
	limits := channelHealthProbeLimits(model.ChannelHealthPool{})
	signature := model.ChannelHealthSignature(channel)
	for _, pool := range config.Pools {
		if pool.Channels[channel.Id] != signature || !slices.Contains(channelHealthProbeModels(pool, *channel), name) {
			continue
		}
		poolLimits := channelHealthProbeLimits(pool)
		limits.MaxOutputTokens = max(limits.MaxOutputTokens, poolLimits.MaxOutputTokens)
		limits.OutputBudgetTokens = max(limits.OutputBudgetTokens, poolLimits.OutputBudgetTokens)
	}
	if strings.HasPrefix(name, "gpt-6") {
		limits.OutputBudgetTokens = max(limits.OutputBudgetTokens, 16)
	}
	return limits
}

func advanceModelHealth(state *model.ChannelHealthState, point model.ChannelHealthPoint) {
	state.LastAt = point.At
	state.Status = "available"
	if !point.Success {
		state.Status = "unavailable"
	}
	state.Action = "随机单渠道短对话抽样"
	if point.Source == "real" {
		state.Action = "近期真实请求参考"
	}
	state.History = append(state.History, point)
	if len(state.History) > 60 {
		state.History = state.History[len(state.History)-60:]
	}
}
