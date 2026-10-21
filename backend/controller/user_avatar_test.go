package controller

import (
	"bytes"
	"encoding/base64"
	"github.com/stretchr/testify/require"
	"image"
	"image/png"
	"strings"
	"testing"
)

func TestNormalizeUserAvatar(t *testing.T) {
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 64, 64))))
	result, err := normalizeUserAvatar("data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()))
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(result, "data:image/jpeg;base64,"))
	empty, err := normalizeUserAvatar("")
	require.NoError(t, err)
	require.Empty(t, empty)
	for _, value := range []string{"https://example.com/a.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,YmFk", strings.Repeat("a", 180001)} {
		_, err = normalizeUserAvatar(value)
		require.Error(t, err)
	}
	buf.Reset()
	require.NoError(t, png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 513, 1))))
	_, err = normalizeUserAvatar("data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()))
	require.Error(t, err)
}
