package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// Upstream cost is admin-only reference metadata. It never participates in
// downstream settlement and missing values must not be inferred from sale prices.
type UpstreamCost struct {
	TimePricing    *model.ModelSaleCostTimePricing `json:"time_pricing,omitempty"`
	ChannelID      int                             `json:"channel_id,omitempty"`
	ChannelVersion string                          `json:"channel_version,omitempty"`
	SourceModel    string                          `json:"source_model,omitempty"`
	BillingType    string                          `json:"billing_type,omitempty"`
	Note           string                          `json:"note,omitempty"`
	CacheRead      *float64                        `json:"cache_read_per_million,omitempty"`
	CacheWrite     *float64                        `json:"cache_write_per_million,omitempty"`
	CacheWrite1h   *float64                        `json:"cache_write_1h_per_million,omitempty"`
	Tiers          []upstreamMonitorTier           `json:"tiers,omitempty"`

	Provider            string   `json:"provider"`
	Source              string   `json:"source"`
	ObservedAt          string   `json:"observed_at"`
	Group               string   `json:"group"`
	GroupRatio          *float64 `json:"group_ratio"`
	ModelRatio          *float64 `json:"model_ratio"`
	CompletionRatio     *float64 `json:"completion_ratio"`
	RequestUSD          *float64 `json:"request_usd"`
	InputUSDPerMillion  *float64 `json:"input_usd_per_million"`
	OutputUSDPerMillion *float64 `json:"output_usd_per_million"`
}

func GetUpstreamCosts(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap["SkymoniUpstreamCosts"]
	common.OptionMapRWMutex.RUnlock()
	costs := map[string][]UpstreamCost{}
	if raw != "" {
		if err := common.Unmarshal([]byte(raw), &costs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Upstream cost metadata is invalid"})
			return
		}
	}
	if costs == nil {
		costs = map[string][]UpstreamCost{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": costs})
}
