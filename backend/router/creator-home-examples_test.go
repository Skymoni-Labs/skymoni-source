package router

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestCreatorHomeExamplesManagement(t *testing.T) {
	e, _ := setupCreatorHome(t, t.TempDir())
	state, err := service.CreatorHomeSnapshot(0, true)
	require.NoError(t, err)
	require.Len(t, state.Examples, 8)
	require.Empty(t, state.Cards)
	body := map[string]any{"revision": "initial", "hidden": true, "position": 99}
	require.Equal(t, 403, homeRequest(t, e, "PUT", "/admin/home/examples/horizon", homeTestCreator, body).Code)
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/admin/home/examples/horizon", homeTestAdmin, body).Code)
	state, err = service.CreatorHomeSnapshot(0, true)
	require.NoError(t, err)
	require.Equal(t, "horizon", state.Examples[7].ID)
	require.True(t, state.Examples[7].Hidden)
	require.NotEqual(t, "initial", state.Examples[7].Revision)
	require.NotEqual(t, 200, homeRequest(t, e, "PUT", "/admin/home/examples/horizon", homeTestAdmin, body).Code)
	require.NotEqual(t, 200, homeRequest(t, e, "PUT", "/admin/home/examples/unknown", homeTestAdmin, body).Code)
	require.NotEqual(t, 200, homeRequest(t, e, "PUT", "/admin/home/examples/notes", homeTestAdmin, map[string]any{"revision": "initial", "position": -1}).Code)
	response := homeRequest(t, e, "GET", "/home", "", nil)
	require.Equal(t, 200, response.Code)
	var public struct {
		Data struct {
			Examples []service.CreatorHomeExample `json:"examples"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &public))
	require.Len(t, public.Data.Examples, 8)
	require.True(t, public.Data.Examples[7].Hidden)
	// Saved catalog settings survive a fresh read and do not create wallet orders/cards.
	require.NoError(t, service.WithCreatorCatalog(false, func(c *service.CreatorCatalog) error { require.Len(t, c.HomeExamples, 8); return nil }))
	require.Empty(t, state.Cards)
	require.Empty(t, state.Orders)
}
