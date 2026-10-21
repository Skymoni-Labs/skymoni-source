package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSoftwareFeaturedConfiguration(t *testing.T) {
	t.Setenv("SOFTWARE_CENTER_DIR", t.TempDir())
	catalog, err := LoadSoftwareCatalog()
	require.NoError(t, err)
	require.Nil(t, catalog.Featured)
	catalog.Featured = &SoftwareFeaturedConfig{Carousel: []string{"cc-switch", "drip"}, Tiles: []string{"skymoni-mail", "cc-switch"}}
	require.NoError(t, SaveSoftwareCatalog(catalog))
	stored, err := LoadSoftwareCatalog()
	require.NoError(t, err)
	require.Equal(t, catalog.Featured, stored.Featured, "selection and order are independent of catalog sorting")
	for name, config := range map[string]*SoftwareFeaturedConfig{
		"unknown item":    {Carousel: []string{"missing"}, Tiles: []string{}},
		"duplicate item":  {Carousel: []string{"drip", "drip"}, Tiles: []string{}},
		"too many slides": {Carousel: []string{"drip", "skymoni-mail", "cherry-studio", "cc-switch", "drip", "cc-switch"}, Tiles: []string{}},
		"too many cards":  {Carousel: []string{}, Tiles: []string{"drip", "skymoni-mail", "cherry-studio", "cc-switch"}},
		"missing list":    {Carousel: nil, Tiles: []string{}},
	} {
		t.Run(name, func(t *testing.T) {
			invalid := stored
			invalid.Featured = config
			require.ErrorIs(t, SaveSoftwareCatalog(invalid), ErrSoftwareInvalid)
			current, err := LoadSoftwareCatalog()
			require.NoError(t, err)
			require.Equal(t, stored, current, "failed validation must preserve the catalog")
		})
	}
	stored.Featured = &SoftwareFeaturedConfig{Carousel: []string{}, Tiles: []string{}}
	require.NoError(t, SaveSoftwareCatalog(stored))
	hidden, err := LoadSoftwareCatalog()
	require.NoError(t, err)
	require.NotNil(t, hidden.Featured)
	require.Empty(t, hidden.Featured.Carousel)
	require.Empty(t, hidden.Featured.Tiles)
}
