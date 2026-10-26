package openai

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const realtimeSecurityUID = 48117
const realtimeSecurityModel = "realtime-catalog-visible"
const realtimeSecurityHidden = "realtime-catalog-hidden"

type realtimeSecurityResult struct {
	err   *types.NewAPIError
	usage *dto.RealtimeUsage
}
type realtimeSecurityFixture struct {
	db               *gorm.DB
	c                *gin.Context
	info             *relaycommon.RelayInfo
	client, upstream *websocket.Conn
	done             chan realtimeSecurityResult
}

func realtimeSecurityPair(t *testing.T) (*websocket.Conn, *websocket.Conn) {
	t.Helper()
	accepted := make(chan *websocket.Conn, 1)
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}
		accepted <- conn
		<-release
		_ = conn.Close()
	}))
	client, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	require.NoError(t, err)
	peer := <-accepted
	t.Cleanup(func() { _ = client.Close(); _ = peer.Close(); close(release); server.Close() })
	return client, peer
}

func setupRealtimeSecurity(t *testing.T, priced ...bool) *realtimeSecurityFixture {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "realtime-security.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sql, err := db.DB()
	require.NoError(t, err)
	sql.SetMaxOpenConns(1)
	prior, redis := model.DB, common.RedisEnabled
	model.DB = db
	common.RedisEnabled = false
	t.Cleanup(func() { model.DB = prior; common.RedisEnabled = redis; _ = sql.Close() })
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Model{}, &model.Token{}))
	require.NoError(t, model.InitSecurityProtection(db))
	require.NoError(t, db.Create(&model.User{Id: realtimeSecurityUID, Username: "realtime-synthetic", Password: "synthetic-unused", AffCode: "realtime-security", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Quota: 1000, CreatedAt: time.Now().Add(-30 * 24 * time.Hour).Unix()}).Error)
	for _, item := range []model.Model{{ModelName: realtimeSecurityModel, Status: 1}, {ModelName: realtimeSecurityHidden, Status: 0}, {ModelName: "realtime-other-published", Status: 1}} {
		require.NoError(t, db.Create(&item).Error)
	}
	require.NoError(t, db.Model(&model.Model{}).Where("model_name = ?", realtimeSecurityHidden).Update("status", 0).Error)
	client, clientServer := realtimeSecurityPair(t)
	upstream, upstreamServer := realtimeSecurityPair(t)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/realtime", nil)
	c.Request.RemoteAddr = "8.8.8.8:12000"
	c.Set("id", realtimeSecurityUID)
	c.Set(common.RequestIdKey, "realtime-security-frame")
	usePrice := true
	if len(priced) > 0 {
		usePrice = priced[0]
	}
	info := &relaycommon.RelayInfo{UserId: realtimeSecurityUID, TokenKey: "synthetic-nonexistent-token", OriginModelName: realtimeSecurityModel, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "provider-mapped-not-in-public-catalog"}, ClientWs: clientServer, TargetWs: upstreamServer, UsePrice: usePrice}
	f := &realtimeSecurityFixture{db: db, c: c, info: info, client: client, upstream: upstream, done: make(chan realtimeSecurityResult, 1)}
	go func() {
		err, usage := OpenaiRealtimeHandler(c, info)
		f.done <- realtimeSecurityResult{err, usage}
		close(f.done)
	}()
	t.Cleanup(func() {
		_ = client.Close()
		_ = upstream.Close()
		select {
		case <-f.done:
		case <-time.After(8 * time.Second):
			t.Error("realtime handler failed to stop")
		}
	})
	// Both peers are actual connected local WebSockets. An initial frame reaches
	// the established provider alias even though only its logical model is public.
	f.forward(t, `{"type":"response.create"}`)
	return f
}

func (f *realtimeSecurityFixture) forward(t *testing.T, frame string) {
	t.Helper()
	require.NoError(t, f.client.WriteMessage(websocket.TextMessage, []byte(frame)))
	require.NoError(t, f.upstream.SetReadDeadline(time.Now().Add(3*time.Second)))
	_, actual, err := f.upstream.ReadMessage()
	require.NoError(t, err)
	require.JSONEq(t, frame, string(actual))
	_ = f.upstream.SetReadDeadline(time.Time{})
}
func (f *realtimeSecurityFixture) ban(t *testing.T, subject, scope string) *model.SecurityProtectionBan {
	t.Helper()
	input := model.SecurityProtectionBanInput{SubjectType: subject, Scope: scope, DurationSeconds: 60, Reason: "synthetic realtime test"}
	if subject == "user" {
		input.UserID = realtimeSecurityUID
	} else {
		input.IP = "8.8.8.8"
	}
	ban, err := model.CreateSecurityProtectionBan(input, 99871, "9.9.9.9", "realtime-policy-change")
	require.NoError(t, err)
	return ban
}
func (f *realtimeSecurityFixture) wait(t *testing.T, timeout time.Duration) realtimeSecurityResult {
	t.Helper()
	select {
	case result := <-f.done:
		require.Nil(t, result.err, "captured legal usage must remain available to WssHelper settlement")
		require.NotNil(t, result.usage)
		return result
	case <-time.After(timeout):
		t.Fatal("realtime handler did not finish within its bounded shutdown")
		return realtimeSecurityResult{}
	}
}
func (f *realtimeSecurityFixture) reject(t *testing.T, frame, code string, status int, total int) {
	t.Helper()
	require.NoError(t, f.client.WriteMessage(websocket.TextMessage, []byte(frame)))
	require.NoError(t, f.client.SetReadDeadline(time.Now().Add(4*time.Second)))
	_, body, err := f.client.ReadMessage()
	require.NoError(t, err)
	var event struct {
		Type   string `json:"type"`
		Status int    `json:"status"`
		Error  struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(body, &event))
	require.Equal(t, "error", event.Type)
	require.Equal(t, status, event.Status)
	require.Equal(t, code, event.Error.Code)
	if code == "model_not_available" {
		require.Contains(t, event.Error.Message, "模型未开放或已下架")
	}
	result := f.wait(t, 5*time.Second)
	require.Equal(t, total, result.usage.TotalTokens)
	require.NoError(t, f.upstream.SetReadDeadline(time.Now().Add(time.Second)))
	_, _, err = f.upstream.ReadMessage()
	require.Error(t, err, "rejected client frame must never reach the already connected upstream")
}

func TestRealtimeSecurityEstablishedConnectionRejectsPolicyAndModelChanges(t *testing.T) {
	for _, name := range []string{"account ban", "ip ban audio append", "native disabled", "native deleted", "model hidden", "model metadata removed", "session hidden override", "response hidden override", "top-level hidden override", "other published override", "null model override", "revoked account then hidden override", "revoked account then model hidden", "ban before parsing"} {
		t.Run(name, func(t *testing.T) {
			f := setupRealtimeSecurity(t)
			frame := `{"type":"session.update","session":{"instructions":"Synthetic text must not be counted after rejection"}}`
			code := "access_denied"
			status := http.StatusForbidden
			switch name {
			case "account ban":
				f.ban(t, "user", "account")
			case "ip ban audio append":
				f.ban(t, "ip", "ip")
				frame = `{"type":"input_audio_buffer.append","audio":"invalid audio would fail counting if the policy guard did not run first"}`
			case "native disabled":
				require.NoError(t, f.db.Model(&model.User{}).Where("id = ?", realtimeSecurityUID).Update("status", common.UserStatusDisabled).Error)
			case "native deleted":
				require.NoError(t, f.db.Delete(&model.User{}, realtimeSecurityUID).Error)
			case "model hidden":
				require.NoError(t, f.db.Model(&model.Model{}).Where("model_name = ?", realtimeSecurityModel).Update("status", 0).Error)
				code = "model_not_available"
				status = http.StatusNotFound
			case "model metadata removed":
				require.NoError(t, f.db.Where("model_name = ?", realtimeSecurityModel).Delete(&model.Model{}).Error)
				code = "model_not_available"
				status = http.StatusNotFound
			case "session hidden override":
				frame = fmt.Sprintf(`{"type":"session.update","session":{"model":%q}}`, realtimeSecurityHidden)
				code = "model_not_available"
				status = http.StatusNotFound
			case "response hidden override":
				frame = fmt.Sprintf(`{"type":"response.create","response":{"model":%q}}`, realtimeSecurityHidden)
				code = "model_not_available"
				status = http.StatusNotFound
			case "top-level hidden override":
				frame = fmt.Sprintf(`{"type":"response.create","model":%q}`, realtimeSecurityHidden)
				code = "model_not_available"
				status = http.StatusNotFound
			case "other published override":
				frame = `{"type":"session.update","session":{"model":"realtime-other-published"}}`
			case "null model override":
				frame = `{"type":"session.update","session":{"model":null}}`
				code = "invalid_request"
				status = http.StatusBadRequest
			case "revoked account then hidden override", "revoked account then model hidden":
				ban := f.ban(t, "user", "account")
				_, err := model.RevokeSecurityProtectionBan(ban.ID, "synthetic revoke", 99871)
				require.NoError(t, err)
				code = "model_not_available"
				status = http.StatusNotFound
				if name == "revoked account then hidden override" {
					frame = fmt.Sprintf(`{"type":"session.update","session":{"model":%q}}`, realtimeSecurityHidden)
				} else {
					require.NoError(t, f.db.Model(&model.Model{}).Where("model_name = ?", realtimeSecurityModel).Update("status", 0).Error)
				}
			case "ban before parsing":
				f.ban(t, "user", "account")
				frame = `{malformed-json`
			}
			f.reject(t, frame, code, status, 0)
			var user model.User
			require.NoError(t, f.db.Unscoped().First(&user, realtimeSecurityUID).Error)
			require.Equal(t, 1000, user.Quota, "denied frame cannot incur a new fee")
			if strings.Contains(name, "ban") || strings.HasPrefix(name, "native") {
				var n int64
				require.NoError(t, f.db.Model(&model.SecurityProtectionEvent{}).Where("kind = ? AND decision = ?", "access_denied", "denied").Count(&n).Error)
				require.Positive(t, n, "confirmed account/IP/native rejection has metadata audit")
			}
		})
	}
}

func TestRealtimeSecurityCheckinOnlyAndLogicalEchoRemainAllowed(t *testing.T) {
	f := setupRealtimeSecurity(t)
	f.ban(t, "user", "checkin")
	f.forward(t, `{"type":"input_audio_buffer.commit"}`)
	f.forward(t, fmt.Sprintf(`{"type":"session.update","session":{"model":%q}}`, realtimeSecurityModel))
	_ = f.client.Close()
	result := f.wait(t, 3*time.Second)
	require.Zero(t, result.usage.TotalTokens)
}

func TestRealtimeSecurityPreservesPreviouslyAcceptedUsage(t *testing.T) {
	f := setupRealtimeSecurity(t)
	terminal := `{"type":"response.done","response":{"usage":{"total_tokens":5,"input_tokens":2,"output_tokens":3,"input_token_details":{"text_tokens":2},"output_token_details":{"text_tokens":3}}}}`
	require.NoError(t, f.upstream.WriteMessage(websocket.TextMessage, []byte(terminal)))
	require.NoError(t, f.client.SetReadDeadline(time.Now().Add(3*time.Second)))
	_, received, err := f.client.ReadMessage()
	require.NoError(t, err)
	require.JSONEq(t, terminal, string(received))
	f.ban(t, "user", "account")
	f.reject(t, `{"type":"session.update","session":{"instructions":"blocked new tokens"}}`, "access_denied", http.StatusForbidden, 5)
}

func TestRealtimeSecurityProtectionStorageFailureKeepsNativeAndPublicationGuards(t *testing.T) {
	for _, nativeDisabled := range []bool{false, true} {
		t.Run(fmt.Sprint(nativeDisabled), func(t *testing.T) {
			f := setupRealtimeSecurity(t)
			require.NoError(t, f.db.Migrator().DropTable(&model.SecurityProtectionPolicy{}))
			if nativeDisabled {
				require.NoError(t, f.db.Model(&model.User{}).Where("id = ?", realtimeSecurityUID).Update("status", common.UserStatusDisabled).Error)
				f.reject(t, `{"type":"response.create"}`, "access_denied", http.StatusForbidden, 0)
			} else {
				f.forward(t, `{"type":"input_audio_buffer.commit"}`)
				require.NoError(t, f.db.Model(&model.Model{}).Where("model_name = ?", realtimeSecurityModel).Update("status", 0).Error)
				f.reject(t, `{"type":"response.create"}`, "model_not_available", http.StatusNotFound, 0)
			}
		})
	}
}

func TestRealtimeSecuritySlowDownstreamCannotHoldSettlementForever(t *testing.T) {
	f := setupRealtimeSecurity(t)
	terminal := `{"type":"response.done","response":{"usage":{"total_tokens":5,"input_tokens":2,"output_tokens":3,"input_token_details":{"text_tokens":2},"output_token_details":{"text_tokens":3}}}}`
	require.NoError(t, f.upstream.WriteMessage(websocket.TextMessage, []byte(terminal)))
	_, _, err := f.client.ReadMessage()
	require.NoError(t, err)
	// The client now stops reading. A large valid target frame blocks its sole
	// data writer while a new client frame triggers a committed account ban.
	if conn, ok := f.client.UnderlyingConn().(*net.TCPConn); ok {
		require.NoError(t, conn.SetReadBuffer(1024))
	}
	sent := make(chan error, 1)
	go func() {
		sent <- f.upstream.WriteMessage(websocket.TextMessage, []byte(`{"type":"synthetic.large","padding":"`+strings.Repeat("x", 32<<20)+`"}`))
	}()
	select {
	case err := <-sent:
		require.NoError(t, err)
	case <-time.After(3 * time.Second):
		t.Fatal("synthetic target frame was not read")
	}
	time.Sleep(50 * time.Millisecond)
	f.ban(t, "user", "account")
	require.NoError(t, f.client.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.create"}`)))
	result := f.wait(t, 8*time.Second)
	require.Equal(t, 5, result.usage.TotalTokens, "accepted usage survives backpressure and policy shutdown")
}

func TestRealtimeSecurityPreconsumeFailureAggregatesUsageOnce(t *testing.T) {
	f := setupRealtimeSecurity(t, false) // Missing synthetic token makes preconsume fail before any charge.
	require.NoError(t, f.db.Callback().Query().Before("gorm:query").Register("synthetic-realtime-funding-failure", func(tx *gorm.DB) {
		if tx.Statement.Table == "users" && strings.Join(tx.Statement.Selects, ",") == "quota" {
			_ = tx.AddError(errors.New("synthetic funding database failure"))
		}
	}))
	terminal := `{"type":"response.done","response":{"usage":{"total_tokens":5,"input_tokens":2,"output_tokens":3,"input_token_details":{"text_tokens":2},"output_token_details":{"text_tokens":3}}}}`
	require.NoError(t, f.upstream.WriteMessage(websocket.TextMessage, []byte(terminal)))
	result := f.wait(t, 3*time.Second)
	require.Equal(t, 5, result.usage.TotalTokens, "failed preconsume must not aggregate the same response again in trailing settlement")
}
