package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestModelHealthRandomChannelUsesEnabledAbilityAndStatus(t *testing.T) {
	setupChannelStatusTest(t)
	for _, row := range []struct {
		id      int
		status  int
		enabled bool
	}{
		{1, 2, true}, {2, 1, false}, {3, 1, true},
	} {
		channel := Channel{Id: row.id, Status: row.status, Models: "sample-model", Key: "private"}
		require.NoError(t, DB.Create(&channel).Error)
		require.NoError(t, DB.Create(&Ability{ChannelId: row.id, Model: "sample-model", Group: "default", Enabled: row.enabled}).Error)
	}
	for range 10 {
		channel, err := RandomModelHealthChannel("sample-model")
		require.NoError(t, err)
		require.NotNil(t, channel)
		require.Equal(t, 3, channel.Id)
	}
	channel, err := RandomModelHealthChannel("absent-model")
	require.NoError(t, err)
	require.Nil(t, channel)
}

func TestModelHealthLeaseAndStateAreIndependentFromGroupSampling(t *testing.T) {
	require.NoError(t, DB.Where("key IN ?", []string{"SkymoniModelHealthLease", "SkymoniChannelHealthLease", "SkymoniModelHealthState:sample"}).Delete(&Option{}).Error)
	t.Cleanup(func() {
		DB.Where("key IN ?", []string{"SkymoniModelHealthLease", "SkymoniChannelHealthLease", "SkymoniModelHealthState:sample"}).Delete(&Option{})
	})
	require.True(t, ClaimModelHealthRound(1000))
	require.True(t, ClaimChannelHealthRound(1000))
	require.False(t, ClaimModelHealthRound(1001))
	ReleaseModelHealthRound(1001)
	require.False(t, ClaimModelHealthRound(1002))
	ReleaseModelHealthRound(1000)
	require.True(t, ClaimModelHealthRound(1003))
	ReleaseModelHealthRound(1003)
	ReleaseChannelHealthRound(1000)
	state := ChannelHealthState{LastAttemptAt: 1234, History: []ChannelHealthPoint{{At: 1234, Count: 1, Success: true}}}
	require.NoError(t, SaveModelHealthState("sample", state))
	require.Equal(t, state, ReadModelHealthState("sample"))
	_, count := ChannelHealthLogOutcome(Log{TokenName: "模型状态检测", Type: LogTypeConsume, CompletionTokens: 1})
	require.False(t, count)
}
