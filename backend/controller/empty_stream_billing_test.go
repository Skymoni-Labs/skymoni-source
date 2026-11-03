package controller

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEmptyChatStreamRefundsWalletAndToken(t *testing.T) {
	for _, test := range []struct {
		name      string
		cancelled bool
	}{
		{name: "empty EOF"},
		{name: "client cancelled", cancelled: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := newResponsesWSBillingTest(t, `tier("request", fixed(0.002))`, func(*websocket.Conn, *http.Request) {})
			fixture.httpUpstream = func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				w.WriteHeader(http.StatusOK)
				w.(http.Flusher).Flush()
				if test.cancelled {
					<-r.Context().Done()
				}
			}
			engine := gin.New()
			engine.POST("/v1/chat/completions", middleware.TokenAuth(), middleware.ModelRequestRateLimit(), middleware.Distribute(), func(c *gin.Context) {
				Relay(c, types.RelayFormatOpenAI)
			})
			gateway := httptest.NewServer(engine)
			defer gateway.Close()
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			request, err := http.NewRequestWithContext(ctx, http.MethodPost, gateway.URL+"/v1/chat/completions", strings.NewReader(`{"model":"ws-billing","messages":[{"role":"user","content":"hello"}],"stream":true}`))
			require.NoError(t, err)
			request.Header.Set("Authorization", "Bearer sk-"+fixture.token.Key)
			request.Header.Set("Content-Type", "application/json")
			response, err := http.DefaultClient.Do(request)
			if test.cancelled {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				body, readErr := io.ReadAll(response.Body)
				require.NoError(t, readErr)
				require.NoError(t, response.Body.Close())
				assert.Equal(t, http.StatusBadGateway, response.StatusCode)
				assert.Contains(t, string(body), `"empty_response"`)
				assert.NotContains(t, string(body), "[DONE]")
			}
			require.Eventually(t, func() bool {
				var user model.User
				var token model.Token
				if model.DB.First(&user, fixture.user.Id).Error != nil || model.DB.First(&token, fixture.token.Id).Error != nil {
					return false
				}
				return user.Quota == 100000 && user.UsedQuota == 0 && token.RemainQuota == 3000 && token.UsedQuota == 0
			}, 3*time.Second, 10*time.Millisecond)
			var consumeCount int64
			require.NoError(t, model.LOG_DB.Model(&model.Log{}).Where("token_id = ? AND type = ?", fixture.token.Id, model.LogTypeConsume).Count(&consumeCount).Error)
			assert.Zero(t, consumeCount)
		})
	}
}
