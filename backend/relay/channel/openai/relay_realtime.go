package openai

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func OpenaiRealtimeHandler(c *gin.Context, info *relaycommon.RelayInfo) (*types.NewAPIError, *dto.RealtimeUsage) {
	if info == nil || info.ClientWs == nil || info.TargetWs == nil {
		return types.NewError(fmt.Errorf("invalid websocket connection"), types.ErrorCodeBadResponse), nil
	}

	info.IsStream = true
	clientConn := info.ClientWs
	targetConn := info.TargetWs

	clientClosed := make(chan struct{})
	targetClosed := make(chan struct{})
	sendChan := make(chan []byte, 100)
	receiveChan := make(chan []byte, 100)
	errChan := make(chan error, 2)
	policyErrChan := make(chan *types.NewAPIError, 1)
	var readers sync.WaitGroup
	var usageMu sync.Mutex

	usage := &dto.RealtimeUsage{}
	localUsage := &dto.RealtimeUsage{}
	sumUsage := &dto.RealtimeUsage{}

	readers.Add(2)
	gopool.Go(func() {
		defer readers.Done()
		defer func() {
			if r := recover(); r != nil {
				errChan <- fmt.Errorf("panic in client reader: %v", r)
			}
		}()
		for frameIndex := 0; ; frameIndex++ {
			select {
			case <-c.Done():
				return
			default:
				_, message, err := clientConn.ReadMessage()
				if err != nil {
					if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
						errChan <- fmt.Errorf("error reading from client: %v", err)
					}
					close(clientClosed)
					return
				}
				// Audio append/commit can trigger server VAD without response.create.
				// Check every client frame before parsing, counting or forwarding it.
				frameRequestID := fmt.Sprintf("%s-rt-%d", c.GetString(common.RequestIdKey), frameIndex)
				if policyErr := checkRealtimeFrameAccess(c, info, message, frameRequestID); policyErr != nil {
					policyErrChan <- policyErr
					return
				}

				realtimeEvent := &dto.RealtimeEvent{}
				err = common.Unmarshal(message, realtimeEvent)
				if err != nil {
					errChan <- fmt.Errorf("error unmarshalling message: %v", err)
					return
				}

				err = func() error {
					usageMu.Lock()
					defer usageMu.Unlock()
					if realtimeEvent.Type == dto.RealtimeEventTypeSessionUpdate {
						if realtimeEvent.Session != nil {
							if realtimeEvent.Session.Tools != nil {
								info.RealtimeTools = realtimeEvent.Session.Tools
							}
						}
					}

					textToken, audioToken, err := service.CountTokenRealtime(info, *realtimeEvent, info.UpstreamModelName)
					if err != nil {
						return fmt.Errorf("error counting text token: %v", err)
					}
					logger.LogInfo(c, fmt.Sprintf("type: %s, textToken: %d, audioToken: %d", realtimeEvent.Type, textToken, audioToken))
					localUsage.TotalTokens += textToken + audioToken
					localUsage.InputTokens += textToken + audioToken
					localUsage.InputTokenDetails.TextTokens += textToken
					localUsage.InputTokenDetails.AudioTokens += audioToken
					return nil
				}()
				if err != nil {
					errChan <- err
					return
				}

				err = writeRealtimeFrame(targetConn, message)
				if err != nil {
					errChan <- fmt.Errorf("error writing to target: %v", err)
					return
				}

				select {
				case sendChan <- message:
				default:
				}
			}
		}
	})

	gopool.Go(func() {
		defer readers.Done()
		defer func() {
			if r := recover(); r != nil {
				errChan <- fmt.Errorf("panic in target reader: %v", r)
			}
		}()
		for {
			select {
			case <-c.Done():
				return
			default:
				_, message, err := targetConn.ReadMessage()
				if err != nil {
					if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
						errChan <- fmt.Errorf("error reading from target: %v", err)
					}
					close(targetClosed)
					return
				}
				realtimeEvent := &dto.RealtimeEvent{}
				err = common.Unmarshal(message, realtimeEvent)
				if err != nil {
					errChan <- fmt.Errorf("error unmarshalling message: %v", err)
					return
				}
				processErr := func() error {
					usageMu.Lock()
					defer usageMu.Unlock()
					info.SetFirstResponseTime()

					if realtimeEvent.Type == dto.RealtimeEventTypeResponseDone {
						realtimeUsage := realtimeEvent.Response.Usage
						if realtimeUsage != nil {
							usage.TotalTokens += realtimeUsage.TotalTokens
							usage.InputTokens += realtimeUsage.InputTokens
							usage.OutputTokens += realtimeUsage.OutputTokens
							usage.InputTokenDetails.AudioTokens += realtimeUsage.InputTokenDetails.AudioTokens
							usage.InputTokenDetails.CachedTokens += realtimeUsage.InputTokenDetails.CachedTokens
							usage.InputTokenDetails.TextTokens += realtimeUsage.InputTokenDetails.TextTokens
							usage.OutputTokenDetails.AudioTokens += realtimeUsage.OutputTokenDetails.AudioTokens
							usage.OutputTokenDetails.TextTokens += realtimeUsage.OutputTokenDetails.TextTokens
							pendingUsage := usage
							usage = &dto.RealtimeUsage{}
							localUsage = &dto.RealtimeUsage{}
							err := preConsumeUsage(c, info, pendingUsage, sumUsage)
							if err != nil {
								return fmt.Errorf("error consume usage: %v", err)
							}
							// 本次计费完成，清除
							usage = &dto.RealtimeUsage{}

							localUsage = &dto.RealtimeUsage{}
						} else {
							textToken, audioToken, err := service.CountTokenRealtime(info, *realtimeEvent, info.UpstreamModelName)
							if err != nil {
								return fmt.Errorf("error counting text token: %v", err)
							}
							logger.LogInfo(c, fmt.Sprintf("type: %s, textToken: %d, audioToken: %d", realtimeEvent.Type, textToken, audioToken))
							localUsage.TotalTokens += textToken + audioToken
							info.IsFirstRequest = false
							localUsage.InputTokens += textToken + audioToken
							localUsage.InputTokenDetails.TextTokens += textToken
							localUsage.InputTokenDetails.AudioTokens += audioToken
							pendingUsage := localUsage
							localUsage = &dto.RealtimeUsage{}
							err = preConsumeUsage(c, info, pendingUsage, sumUsage)
							if err != nil {
								return fmt.Errorf("error consume usage: %v", err)
							}
							// 本次计费完成，清除
							localUsage = &dto.RealtimeUsage{}
							// print now usage
						}
						logger.LogInfo(c, fmt.Sprintf("realtime streaming sumUsage: %v", sumUsage))
						logger.LogInfo(c, fmt.Sprintf("realtime streaming localUsage: %v", localUsage))
						logger.LogInfo(c, fmt.Sprintf("realtime streaming localUsage: %v", localUsage))

					} else if realtimeEvent.Type == dto.RealtimeEventTypeSessionUpdated || realtimeEvent.Type == dto.RealtimeEventTypeSessionCreated {
						realtimeSession := realtimeEvent.Session
						if realtimeSession != nil {
							// update audio format
							info.InputAudioFormat = common.GetStringIfEmpty(realtimeSession.InputAudioFormat, info.InputAudioFormat)
							info.OutputAudioFormat = common.GetStringIfEmpty(realtimeSession.OutputAudioFormat, info.OutputAudioFormat)
						}
					} else {
						textToken, audioToken, err := service.CountTokenRealtime(info, *realtimeEvent, info.UpstreamModelName)
						if err != nil {
							return fmt.Errorf("error counting text token: %v", err)
						}
						logger.LogInfo(c, fmt.Sprintf("type: %s, textToken: %d, audioToken: %d", realtimeEvent.Type, textToken, audioToken))
						localUsage.TotalTokens += textToken + audioToken
						localUsage.OutputTokens += textToken + audioToken
						localUsage.OutputTokenDetails.TextTokens += textToken
						localUsage.OutputTokenDetails.AudioTokens += audioToken
					}
					return nil
				}()
				if processErr != nil {
					errChan <- processErr
					return
				}

				err = writeRealtimeFrame(clientConn, message)
				if err != nil {
					errChan <- fmt.Errorf("error writing to client: %v", err)
					return
				}

				select {
				case receiveChan <- message:
				default:
				}
			}
		}
	})

	var policyErr *types.NewAPIError
	select {
	case policyErr = <-policyErrChan:
	case <-clientClosed:
	case <-targetClosed:
	case err := <-errChan:
		//return service.OpenAIErrorWrapper(err, "realtime_error", http.StatusInternalServerError), nil
		logger.LogError(c, "realtime error: "+err.Error())
	case <-c.Done():
	}
	if policyErr == nil {
		select {
		case policyErr = <-policyErrChan:
		default:
		}
	}
	// Stop readers before inspecting trailing usage. On a policy rejection the
	// client reader has already stopped, so retain the client socket until the
	// target writer exits and the single policy error can be written safely.
	_ = targetConn.Close()
	if policyErr == nil {
		_ = clientConn.Close()
	}
	readers.Wait()
	if policyErr != nil {
		writeRealtimePolicyError(c, clientConn, policyErr)
		_ = clientConn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "access policy changed"), time.Now().Add(time.Second))
		_ = clientConn.Close()
	}

	if usage.TotalTokens != 0 {
		_ = preConsumeUsage(c, info, usage, sumUsage)
	}

	if localUsage.TotalTokens != 0 {
		_ = preConsumeUsage(c, info, localUsage, sumUsage)
	}

	// check usage total tokens, if 0, use local usage

	// WssHelper settles this returned usage only on a nil error. A rejected
	// new frame has already received its wire error and contributes no tokens;
	// legal usage captured before it must still be settled exactly as before.
	return nil, sumUsage
}

// OriginModelName is the fixed logical/catalog/billing identity. The provider's
// mapped model need not have its own catalog entry and is never substituted
// into this publication check. Model switches require a fresh HTTP handshake.
func checkRealtimeFrameAccess(c *gin.Context, info *relaycommon.RelayInfo, message []byte, requestID string) *types.NewAPIError {
	uid := info.UserId
	if uid <= 0 {
		uid = c.GetInt("id")
	}
	if uid <= 0 {
		return types.NewErrorWithStatusCode(errors.New("账号认证无效，请重新连接"), types.ErrorCodeAccessDenied, http.StatusForbidden, types.ErrOptionWithSkipRetry())
	}
	decision, err := model.SecurityProtectionAccess(uid, c.ClientIP(), "account")
	if err == nil && decision != nil && !decision.Allowed {
		_ = model.RecordSecurityProtectionDenial(uid, c.ClientIP(), c.FullPath(), "account", decision, requestID)
		return types.NewErrorWithStatusCode(errors.New(decision.Message), types.ErrorCodeAccessDenied, http.StatusForbidden, types.ErrOptionWithSkipRetry())
	}
	// A protection-store error degrades only that additional layer. Publication
	// remains mandatory and fails closed; the original handshake auth is kept.
	checkPublished := func(name string) *types.NewAPIError {
		published, err := model.IsModelPublished(name)
		if err != nil {
			return types.NewErrorWithStatusCode(errors.New("模型开放状态暂不可验证，请稍后重试"), types.ErrorCodeGetChannelFailed, http.StatusServiceUnavailable, types.ErrOptionWithSkipRetry())
		}
		if !published {
			return types.NewErrorWithStatusCode(errors.New("模型未开放或已下架，请更新模型列表并切换到当前可用模型"), types.ErrorCodeModelUnavailable, http.StatusNotFound, types.ErrOptionWithSkipRetry())
		}
		return nil
	}
	if err := checkPublished(info.OriginModelName); err != nil {
		return err
	}
	var event struct {
		Model   json.RawMessage `json:"model"`
		Session *struct {
			Model json.RawMessage `json:"model"`
		} `json:"session"`
		Response *struct {
			Model json.RawMessage `json:"model"`
		} `json:"response"`
	}
	if err := common.Unmarshal(message, &event); err != nil {
		return types.NewErrorWithStatusCode(errors.New("Realtime事件格式无效"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	rawModels := []json.RawMessage{event.Model}
	if event.Session != nil {
		rawModels = append(rawModels, event.Session.Model)
	}
	if event.Response != nil {
		rawModels = append(rawModels, event.Response.Model)
	}
	models := []string{}
	for _, raw := range rawModels {
		if len(raw) > 0 {
			var candidate string
			if err := common.Unmarshal(raw, &candidate); err != nil || strings.TrimSpace(candidate) == "" {
				return types.NewErrorWithStatusCode(errors.New("Realtime模型名称不能为空"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
			}
			models = append(models, candidate)
			if candidate != info.OriginModelName {
				if err := checkPublished(candidate); err != nil {
					return err
				}
			}
		}
	}
	for _, candidate := range models {
		if candidate != info.OriginModelName {
			return types.NewErrorWithStatusCode(errors.New("已建立的Realtime连接不能切换模型，请更新模型列表并重新连接"), types.ErrorCodeAccessDenied, http.StatusForbidden, types.ErrOptionWithSkipRetry())
		}
	}
	return nil
}

// Each data writer owns its own deadline. A peer that stops reading must not
// hold shutdown/settlement forever; main writes the error only after it exits.
func writeRealtimeFrame(conn *websocket.Conn, message []byte) error {
	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, message)
}

func writeRealtimePolicyError(c *gin.Context, client *websocket.Conn, apiErr *types.NewAPIError) {
	payload := struct {
		Type    string            `json:"type"`
		EventID string            `json:"event_id"`
		Status  int               `json:"status"`
		Error   types.OpenAIError `json:"error"`
	}{Type: "error", EventID: helper.GetLocalRealtimeID(c), Status: apiErr.StatusCode, Error: apiErr.ToOpenAIError()}
	if body, err := common.Marshal(payload); err == nil {
		_ = client.SetWriteDeadline(time.Now().Add(time.Second))
		_ = client.WriteMessage(websocket.TextMessage, body)
	}
}

func preConsumeUsage(ctx *gin.Context, info *relaycommon.RelayInfo, usage *dto.RealtimeUsage, totalUsage *dto.RealtimeUsage) error {
	if usage == nil || totalUsage == nil {
		return fmt.Errorf("invalid usage pointer")
	}

	totalUsage.TotalTokens += usage.TotalTokens
	totalUsage.InputTokens += usage.InputTokens
	totalUsage.OutputTokens += usage.OutputTokens
	totalUsage.InputTokenDetails.CachedTokens += usage.InputTokenDetails.CachedTokens
	totalUsage.InputTokenDetails.TextTokens += usage.InputTokenDetails.TextTokens
	totalUsage.InputTokenDetails.AudioTokens += usage.InputTokenDetails.AudioTokens
	totalUsage.OutputTokenDetails.TextTokens += usage.OutputTokenDetails.TextTokens
	totalUsage.OutputTokenDetails.AudioTokens += usage.OutputTokenDetails.AudioTokens
	// clear usage
	err := service.PreWssConsumeQuota(ctx, info, usage)
	return err
}
