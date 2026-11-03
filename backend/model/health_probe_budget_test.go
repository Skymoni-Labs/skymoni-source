package model

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestHealthProbeDailyBudgetConcurrentCapAndMidnightReset(t *testing.T) {
	now := time.Date(2026, 11, 3, 15, 59, 59, 0, time.UTC).Unix()
	key, reset := healthProbeBudgetDay(now)
	next, _ := healthProbeBudgetDay(reset)
	require.Equal(t, "SkymoniHealthProbeBudget:2026-11-03", key)
	require.Equal(t, "SkymoniHealthProbeBudget:2026-11-04", next)
	require.NoError(t, DB.Where("key IN ?", []string{key, next}).Delete(&Option{}).Error)
	t.Cleanup(func() { DB.Where("key IN ?", []string{key, next}).Delete(&Option{}) })
	require.NoError(t, DB.Create(&Option{Key: key, Value: "299"}).Error)
	var count atomic.Int32
	var pending sync.WaitGroup
	for range 20 {
		pending.Add(1)
		go func() {
			defer pending.Done()
			ok, err := ReserveHealthProbe(now)
			require.NoError(t, err)
			if ok {
				count.Add(1)
			}
		}()
	}
	pending.Wait()
	require.EqualValues(t, 1, count.Load())
	budget, err := ReadHealthProbeBudget(now)
	require.NoError(t, err)
	require.Equal(t, 300, budget.Used)
	ok, err := ReserveHealthProbe(reset)
	require.NoError(t, err)
	require.True(t, ok)
	budget, err = ReadHealthProbeBudget(reset)
	require.NoError(t, err)
	require.Equal(t, 1, budget.Used)
}
