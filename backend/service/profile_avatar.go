package service

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	"image/jpeg"
	_ "image/png"
	"strings"
)

// Canonicalize a small raster image; never store active formats or remote URLs.
func NormalizeProfileAvatar(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	if len(value) > 180000 {
		return "", errors.New("avatar exceeds size limit")
	}
	prefix, encoded, ok := strings.Cut(value, ",")
	if !ok || (prefix != "data:image/jpeg;base64" && prefix != "data:image/png;base64") {
		return "", errors.New("avatar must be PNG or JPEG")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", errors.New("invalid avatar encoding")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "png" && format != "jpeg") || config.Width < 1 || config.Height < 1 || config.Width > 512 || config.Height > 512 {
		return "", errors.New("avatar must be at most 512 x 512 pixels")
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return "", errors.New("invalid avatar image")
	}
	var out bytes.Buffer
	if err = jpeg.Encode(&out, img, &jpeg.Options{Quality: 85}); err != nil {
		return "", err
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(out.Bytes()), nil
}
