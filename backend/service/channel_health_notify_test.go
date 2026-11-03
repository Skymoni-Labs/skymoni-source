package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestHealthNotificationSilencePreservesQuotaAlerts(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	old := common.OptionMap
	common.OptionMap = map[string]string{"SkymoniChannelStatusNotifyEnabled": "false"}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() { common.OptionMapRWMutex.Lock(); common.OptionMap = old; common.OptionMapRWMutex.Unlock() })
	require.True(t, channelStatusNotificationSuppressed(dto.NotifyTypeChannelUpdate+"_1_1"))
	require.True(t, channelStatusNotificationSuppressed(dto.NotifyTypeChannelTest))
	require.False(t, channelStatusNotificationSuppressed(dto.NotifyTypeQuotaExceed))
}
