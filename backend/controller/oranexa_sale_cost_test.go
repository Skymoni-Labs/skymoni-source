package controller

import (
	"encoding/json"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestOranexaCostRecordBindsGroupAndModelSchedule(t *testing.T) {
	var group oranexaSaleGroup
	require.NoError(t, json.Unmarshal([]byte(`{"id":31,"name":"low","rate_multiplier":0.06,"models":[{"name":"deepseek-v4.1-flash","pricing":{"billing_mode":"token","input_price":0.000001,"output_price":0.000004,"cache_read_price":0.00000002,"cache_write_price":0,"cache_write_1h_price":0,"intervals":[]},"time_pricing":{"timezone":"Asia/Shanghai","weekdays_only":true,"periods":[{"start_time":"09:00","end_time":"12:00","multiplier":2},{"start_time":"14:00","end_time":"18:00","multiplier":2}]}}]}`), &group))
	binding := oranexaSaleBinding{ChannelID: 12, SourceModel: "deepseek-v4.1-flash", ChannelVersion: "verified", GroupID: 31}
	record, err := oranexaCostRecord(binding, group, group.Models[0], "2026-10-12T00:00:00Z")
	require.NoError(t, err)
	require.Equal(t, .06, *record.GroupRatio)
	require.Equal(t, 1., *record.InputUSDPerMillion)
	require.Equal(t, .02, *record.CacheRead)
	require.True(t, record.TimePricing.WeekdaysOnly)
	binding.GroupID = 29
	_, err = oranexaCostRecord(binding, group, group.Models[0], "now")
	require.Error(t, err)
	binding.GroupID = 31
	group.Models[0].TimePricing.Periods[0].Start = "08:00"
	_, err = oranexaCostRecord(binding, group, group.Models[0], "now")
	require.Error(t, err)
}
