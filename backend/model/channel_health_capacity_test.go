package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestChannelHealthLargerRoundRetainsLeaseUntilOwnedRelease(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Option{}))
	require.NoError(t, DB.Where("key = ?", "SkymoniChannelHealthLease").Delete(&Option{}).Error)
	t.Cleanup(func() { DB.Where("key = ?", "SkymoniChannelHealthLease").Delete(&Option{}) })
	require.True(t, ClaimChannelHealthRound(1000, 32))
	require.False(t, ClaimChannelHealthRound(2801, 32), "the old fixed lease must not expire during a larger round")
	ReleaseChannelHealthRound(1000, 16)
	require.False(t, ClaimChannelHealthRound(2802, 32), "a different lease duration cannot release this claim")
	ReleaseChannelHealthRound(1000, 32)
	require.True(t, ClaimChannelHealthRound(2803, 32))
	ReleaseChannelHealthRound(2803, 32)
}
