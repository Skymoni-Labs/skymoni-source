package controller

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestUpstreamWalletAliasMetadataDoesNotConflict(t *testing.T) {
	base := UpstreamCost{Provider: "yylx", ChannelID: 1159, ChannelVersion: "same-route", SourceModel: "gemini-3.8-flash", Group: "Gemini", GroupRatio: walletFloat(.2), BillingType: "token", InputUSDPerMillion: walletFloat(.75), OutputUSDPerMillion: walletFloat(3.75), CacheRead: walletFloat(.075), Source: "old-source", ObservedAt: "2026-10-11T20:17:56Z", Note: "old observation"}
	refreshed := base
	refreshed.Source, refreshed.ObservedAt, refreshed.Note = "new-source", "2026-10-17T01:00:00Z", "new observation"
	costs := map[string][]UpstreamCost{"gemini-3.8-flash-token": {base}, "gemini-3.8-flash": {refreshed}}
	got, reason := selectUpstreamWalletCost(costs, []string{"gemini-3.8-flash-token", "gemini-3.8-flash"}, "yylx", "gemini-3.8-flash", 1159)
	require.Empty(t, reason)
	require.Equal(t, base.ChannelID, got.ChannelID)
	for _, field := range []string{"price", "group", "cache", "route"} {
		t.Run(field, func(t *testing.T) {
			changed := refreshed
			switch field {
			case "price":
				changed.OutputUSDPerMillion = walletFloat(7.5)
			case "group":
				changed.Group = "another supplier group"
			case "cache":
				changed.CacheRead = walletFloat(.15)
			case "route":
				changed.ChannelVersion = "different-route"
			}
			costs["gemini-3.8-flash"] = []UpstreamCost{changed}
			_, reason := selectUpstreamWalletCost(costs, []string{"gemini-3.8-flash-token", "gemini-3.8-flash"}, "yylx", "gemini-3.8-flash", 1159)
			require.NotEmpty(t, reason)
		})
	}
}
