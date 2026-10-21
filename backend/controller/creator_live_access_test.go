package controller

import (
	"context"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestCreatorLiveAccess(t *testing.T) {
	user, identity := setupSecurityEnrollmentTest(t)
	communityTestSchema(t)
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	profile := service.CreatorProfile{Name: "Creator", Handle: "creator-live"}
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		c.Members[user.Id] = service.CreatorMember{UserID: user.Id, AcceptedAt: 1, Profile: profile}
		return nil
	}))
	first, err := service.WaitCreatorAccess(context.Background(), user.Id, "", time.Second)
	require.NoError(t, err)
	require.Equal(t, "active", first.Status)
	result := make(chan service.CreatorAccessState, 2)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		state, err := service.WaitCreatorAccess(ctx, user.Id, "active", 10*time.Second)
		if err == nil {
			result <- state
		}
	}()
	_, err = service.SetCreatorSuspended(user.Id, user.Id, true, "active")
	require.NoError(t, err)
	select {
	case state := <-result:
		require.True(t, state.Suspended)
	case <-time.After(time.Second):
		t.Fatal("live ban did not wake existing logged-in watcher")
	}
	// A token/session issued before suspension remains a normal site login,
	// while every creator write continues to check the committed catalog.
	_, _, err = service.ValidateLoginSession(identity)
	require.NoError(t, err)
	require.ErrorIs(t, service.SaveCreatorProfile(user.Id, profile, nil, nil), service.ErrCreatorForbidden)
	_, err = service.StoreCreatorFile(user.Id, "old-client.txt", nil)
	require.ErrorIs(t, err, service.ErrCreatorForbidden)
	go func() {
		state, err := service.WaitCreatorAccess(ctx, user.Id, "suspended", 10*time.Second)
		if err == nil {
			result <- state
		}
	}()
	_, err = service.SetCreatorSuspended(user.Id, user.Id, false, "suspended")
	require.NoError(t, err)
	select {
	case state := <-result:
		require.False(t, state.Suspended)
		require.Equal(t, "active", state.Status)
	case <-time.After(time.Second):
		t.Fatal("unban did not wake watcher")
	}
	require.NoError(t, service.SaveCreatorProfile(user.Id, profile, nil, nil))
	canceled, stop := context.WithCancel(context.Background())
	stop()
	_, err = service.WaitCreatorAccess(canceled, user.Id, "active", time.Second)
	require.ErrorIs(t, err, context.Canceled)
	state, err := service.WaitCreatorAccess(context.Background(), user.Id, "active", time.Millisecond)
	require.NoError(t, err)
	require.False(t, state.Suspended)
}
