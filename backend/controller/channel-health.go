package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/gin-gonic/gin"
)

type healthProbeContextKey struct{}

func minimalHealthProbeBody(raw []byte) ([]byte, error) {
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, err
	}
	body["max_tokens"] = 8
	body["stream"] = false
	body["messages"] = []map[string]string{{"role": "user", "content": "Reply 1."}}
	body["thinking"] = map[string]string{"type": "disabled"}
	delete(body, "max_completion_tokens")
	delete(body, "stream_options")
	return json.Marshal(body)
}

// The worker only runs on the master. There is no email/report integration.
func InitChannelHealth() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		time.Sleep(30 * time.Second)
		for {
			func() {
				defer func() {
					if recover() != nil {
						common.SysError("sample channel health round failed")
					}
				}()
				runChannelHealthRound()
			}()
			time.Sleep(30 * time.Second)
		}
	}()
}

func runChannelHealthRound() {
	var config model.ChannelHealthConfig
	if model.ReadChannelHealthJSON(model.ChannelHealthConfigKey, &config) != nil || !config.Enabled || len(config.Pools) == 0 || len(config.Pools) > 16 {
		return
	}
	now := time.Now().Unix()
	if !model.ClaimChannelHealthRound(now) {
		return
	}
	defer model.ReleaseChannelHealthRound(now)
	userID, err := resolveChannelTestUserID(nil)
	if err != nil {
		return
	}
	for _, pool := range config.Pools {
		state := model.ReadChannelHealthState(pool.ID)
		if now-state.LastAt < 300 {
			continue
		}
		channels, err := model.ValidChannelHealthChannels(pool)
		if err != nil {
			continue
		}
		if len(channels) != len(pool.Channels) || len(channels) == 0 {
			state.Status = "unknown"
			state.Action = "配置已变化，暂停检测与自动启停"
			state.LastAt = now
			_ = model.SaveChannelHealthState(pool.ID, state)
			continue
		}
		published, err := model.IsModelPublished(pool.Model)
		if err != nil || !published {
			state.Status = "unknown"
			state.Action = "模型未发布，暂停付费检测与恢复"
			state.LastAt = now
			_ = model.SaveChannelHealthState(pool.ID, state)
			continue
		}
		point := model.ChannelHealthPoint{At: now, Source: "real"}
		ids := make([]int, 0, len(channels))
		for _, c := range channels {
			ids = append(ids, c.Id)
		}
		logs, err := model.RecentChannelHealthLogs(ids, now-300)
		if err != nil {
			continue
		} // A storage failure must not disable upstreams.
		var latency int64
		for _, log := range logs {
			ok, count := model.ChannelHealthLogOutcome(log)
			if !count {
				continue
			}
			point.Count++
			if !ok {
				point.Failures++
			}
			latency += int64(log.UseTime) * 1000
		}
		if point.Count > 0 {
			point.Success = point.Failures == 0
			point.LatencyMs = latency / int64(point.Count)
		} else {
			channel := channels[state.Cursor%len(channels)]
			state.Cursor = (state.Cursor + 1) % len(channels)
			ctx, cancel := context.WithTimeout(context.WithValue(context.Background(), healthProbeContextKey{}, true), 45*time.Second)
			started := time.Now()
			result := testChannel(ctx, &channel, userID, pool.Model, "", false)
			cancel()
			point.Source = "probe"
			point.Count = 1
			point.LatencyMs = time.Since(started).Milliseconds()
			point.Success = result.localErr == nil && result.newAPIError == nil
			if !point.Success {
				point.Failures = 1
				// Unknown upstream charges remain pending in the normal wallet ledger.
				if result.context != nil {
					model.RecordErrorLog(result.context, userID, channel.Id, pool.Model, "线路抽样检测", "线路抽样检测失败（上游费用待核对）", 0, int(point.LatencyMs/1000), false, result.context.GetString("group"), model.NewLogOther())
				}
			}
		}
		advanceChannelHealth(&state, point)
		state.Action = "仅抽样观察"
		if pool.Auto {
			enable := state.Successes >= 3
			if enable || state.Failures >= 2 {
				n, err := model.ApplyChannelHealth(pool, enable)
				if err != nil {
					state.Action = "自动启停未完成，将重试"
				} else if n == 0 {
					state.Action = "已完成分组判断，维持当前渠道状态（保留人工关闭）"
				} else if enable {
					state.Action = "连续三轮通过，恢复为备用（本轮变更 " + strconv.Itoa(n) + " 条）"
				} else {
					state.Action = "连续两轮失败，已关闭该组（本轮变更 " + strconv.Itoa(n) + " 条）"
				}
			} else {
				state.Action = "等待连续两轮失败 / 三轮成功"
			}
		}
		if err := model.SaveChannelHealthState(pool.ID, state); err != nil {
			common.SysError("sample channel health state save failed")
		}
	}
}

func advanceChannelHealth(state *model.ChannelHealthState, point model.ChannelHealthPoint) {
	state.LastAt = point.At
	if point.Success {
		state.Successes++
		state.Failures = 0
		state.Status = "available"
	} else {
		state.Successes = 0
		state.Failures++
		state.Status = "unavailable"
		if point.Failures < point.Count {
			state.Status = "degraded"
		}
	}
	state.History = append(state.History, point)
	if len(state.History) > 60 {
		state.History = state.History[len(state.History)-60:]
	}
}

func GetUpstreamChannelHealth(c *gin.Context) {
	var config model.ChannelHealthConfig
	_ = model.ReadChannelHealthJSON(model.ChannelHealthConfigKey, &config)
	rows := make([]gin.H, 0, len(config.Pools))
	for _, p := range config.Pools {
		channels, err := model.ValidChannelHealthChannels(p)
		if err != nil {
			c.JSON(500, gin.H{"success": false, "message": "读取渠道状态失败"})
			return
		}
		enabled := 0
		for _, ch := range channels {
			if ch.Status == 1 {
				enabled++
			}
		}
		state := model.ReadChannelHealthState(p.ID)
		if time.Now().Unix()-state.LastAt > 900 {
			state.Status = "unknown"
		}
		rows = append(rows, gin.H{"id": p.ID, "provider": p.Provider, "account": p.Account, "upstream_model": p.UpstreamModel, "upstream_group": p.UpstreamGroup, "multiplier": p.Multiplier, "auto": p.Auto, "channels": len(p.Channels), "matched": len(channels), "enabled": enabled, "state": state})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"enabled": config.Enabled, "interval_seconds": 300, "max_output_tokens": 8, "pools": rows, "server_time": time.Now().Unix()}})
}

func GetDeepSeekChannelHealth(c *gin.Context) {
	// Only published logical names reach the user response. No upstream pool DTO
	// is reused here, so account/group/credential information cannot leak.
	var metadata []model.Model
	if err := model.DB.Select("model_name").Where("status = ?", 1).Find(&metadata).Error; err != nil {
		c.JSON(500, gin.H{"success": false})
		return
	}
	names := map[string]bool{}
	for _, m := range metadata {
		if strings.Contains(strings.ToLower(m.ModelName), "deepseek") {
			names[m.ModelName] = true
		}
	}
	var config model.ChannelHealthConfig
	_ = model.ReadChannelHealthJSON(model.ChannelHealthConfigKey, &config)
	rows := make([]gin.H, 0, len(names))
	now := time.Now().Unix()
	for name := range names {
		published, err := model.IsModelPublished(name)
		if err != nil || !published {
			continue
		}
		metrics, err := perfmetrics.Query(perfmetrics.QueryParams{Model: name, Hours: 24})
		if err != nil {
			c.JSON(500, gin.H{"success": false, "message": "读取模型状态失败"})
			return
		}
		status := "unknown"
		last := int64(0)
		// Metric buckets may be hourly; their start timestamp is not the time
		// of the last request. Use bounded recent observations for freshness.
		var recent []model.Log
		if err := model.LOG_DB.Select("created_at", "type", "content", "other", "completion_tokens", "token_name").Where("model_name = ? AND created_at > ? AND type IN ?", name, now-900, []int{model.LogTypeConsume, model.LogTypeError}).Order("id DESC").Limit(30).Find(&recent).Error; err != nil {
			c.JSON(500, gin.H{"success": false})
			return
		}
		good, bad := false, false
		for _, log := range recent {
			ok, count := model.ChannelHealthLogOutcome(log)
			if !count {
				continue
			}
			if log.CreatedAt > last {
				last = log.CreatedAt
			}
			if ok {
				good = true
			} else {
				bad = true
			}
		}
		if good {
			status = "available"
		}
		if bad {
			status = "unavailable"
			if good {
				status = "degraded"
			}
		}
		probes := make([]model.ChannelHealthPoint, 0)
		if last == 0 {
			good, bad := false, false
			for _, p := range config.Pools {
				channels, err := model.ValidChannelHealthChannels(p)
				if err != nil {
					continue
				}
				active := false
				for _, ch := range channels {
					for _, alias := range ch.GetModels() {
						if alias == name && ch.Status == 1 {
							active = true
						}
					}
				}
				if !active {
					continue
				}
				s := model.ReadChannelHealthState(p.ID)
				if now-s.LastAt > 900 || len(s.History) == 0 {
					continue
				}
				point := s.History[len(s.History)-1]
				probes = append(probes, point)
				if point.At > last {
					last = point.At
				}
				if point.Success {
					good = true
				} else {
					bad = true
				}
			}
			if good {
				status = "available"
			}
			if bad {
				status = "unavailable"
				if good {
					status = "degraded"
				}
			}
		}
		var routes int64
		if err := model.DB.Model(&model.Ability{}).Where("model = ? AND enabled = ?", name, true).Count(&routes).Error; err != nil {
			c.JSON(500, gin.H{"success": false})
			return
		}
		if routes == 0 {
			status = "unavailable"
		}
		rows = append(rows, gin.H{"model": name, "status": status, "last_at": last, "metrics": gin.H{"summary": metrics.Summary, "series": metrics.Series}, "samples": probes})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i]["model"].(string) < rows[j]["model"].(string) })
	c.JSON(200, gin.H{"success": true, "data": gin.H{"models": rows, "server_time": now, "refresh_seconds": 60}})
}
