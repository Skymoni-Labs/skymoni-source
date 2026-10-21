package service

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func avatarFixture(t *testing.T, width, height int) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	img.Set(0, 0, color.RGBA{R: 50, G: 120, B: 200, A: 255})
	var data bytes.Buffer
	require.NoError(t, png.Encode(&data, img))
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data.Bytes())
}

func TestProfileAvatarRejectsUnsafeOrInvalidImages(t *testing.T) {
	for _, value := range []string{
		"https://example.com/avatar.png",
		"data:image/svg+xml;base64,PHN2Zz4=",
		"data:image/png;base64,aGVsbG8=",
		"data:image/png;base64,invalid!",
		"data:image/jpeg;base64," + strings.Repeat("A", 180000),
		avatarFixture(t, 513, 10),
	} {
		_, err := NormalizeProfileAvatar(value)
		require.Error(t, err)
	}
}

func TestCreatorAvatarSavePersistsAndOldClientsPreserveIt(t *testing.T) {
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	profile := CreatorProfile{Name: "Creator", Handle: "creator-one"}
	require.NoError(t, ActivateCreator(42, profile, "other", CreatorTermsVersion, true))
	other := CreatorProfile{Name: "Other", Handle: "creator-two"}
	require.NoError(t, ActivateCreator(43, other, "other", CreatorTermsVersion, true))
	avatar := avatarFixture(t, 256, 256)
	profile.Avatar = &avatar
	require.NoError(t, SaveCreatorProfile(42, profile, nil, nil))
	var storedAvatar string
	require.NoError(t, WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		require.NotNil(t, c.Members[42].Profile.Avatar)
		assert.True(t, strings.HasPrefix(*c.Members[42].Profile.Avatar, "data:image/jpeg;base64,"))
		assert.Nil(t, c.Members[43].Profile.Avatar)
		storedAvatar = *c.Members[42].Profile.Avatar
		return nil
	}))
	profile.Avatar = &storedAvatar
	require.NoError(t, SaveCreatorProfile(42, profile, nil, nil))
	require.NoError(t, WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		assert.Equal(t, storedAvatar, *c.Members[42].Profile.Avatar, "Text and pin changes must not recompress the avatar")
		return nil
	}))
	profile.Avatar = nil
	profile.Bio = "Updated text from an older client"
	require.NoError(t, SaveCreatorProfile(42, profile, nil, nil))
	require.NoError(t, WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		require.NotNil(t, c.Members[42].Profile.Avatar)
		assert.NotEmpty(t, *c.Members[42].Profile.Avatar)
		assert.Equal(t, profile.Bio, c.Members[42].Profile.Bio)
		return nil
	}))
	empty := ""
	profile.Avatar = &empty
	require.NoError(t, SaveCreatorProfile(42, profile, nil, nil))
	require.NoError(t, WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		require.NotNil(t, c.Members[42].Profile.Avatar)
		assert.Empty(t, *c.Members[42].Profile.Avatar)
		return nil
	}))
}

func TestCreatorAvatarInvalidOrUnauthorizedSaveKeepsExistingProfile(t *testing.T) {
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	profile := CreatorProfile{Name: "Creator", Handle: "creator-one"}
	require.NoError(t, ActivateCreator(42, profile, "other", CreatorTermsVersion, true))
	assert.ErrorIs(t, SaveCreatorProfile(99, profile, nil, nil), ErrCreatorForbidden)
	invalid := "data:image/png;base64,aGVsbG8="
	profile.Avatar = &invalid
	assert.ErrorIs(t, SaveCreatorProfile(42, profile, nil, nil), ErrCreatorInvalid)
	require.NoError(t, WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		assert.Nil(t, c.Members[42].Profile.Avatar)
		return nil
	}))
}
