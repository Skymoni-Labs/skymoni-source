package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"net/url"
	"os"
	"strings"

	"golang.org/x/image/draw"
)

// CreatorCard keeps list responses independent of full screenshots and README content.
// This is a copy; the editable project and the legacy detail API retain their media.
func CreatorCard(w CreatorWork) CreatorWork {
	w.Description, w.Revision, w.ReviewNote = "", "", ""
	w.Images, w.Blocks, w.Attachment = []string{}, []CreatorBlock{}, nil
	if strings.HasPrefix(w.Cover, "data:") {
		w.Cover = fmt.Sprintf("/api/creators/public/%s/cover?v=%x", url.PathEscape(w.ID), sha256.Sum256([]byte(w.Cover)))
	}
	return w
}

// Resolve the current public work before serving media, including conditional requests.
// Old URLs cannot expose withdrawn works or a previous image revision.
func CreatorCoverSource(id, version string) (string, error) {
	var source string
	err := WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		for _, w := range c.Works {
			if w.ID == id && CreatorPublic(c, w) && strings.HasPrefix(w.Cover, "data:") && fmt.Sprintf("%x", sha256.Sum256([]byte(w.Cover))) == version {
				source = w.Cover
				return nil
			}
		}
		return os.ErrNotExist
	})
	return source, err
}

func CreatorCoverThumbnail(value string) ([]byte, error) {
	if len(value) > 400000 {
		return nil, ErrCreatorInvalid
	}
	label, encoded, ok := strings.Cut(value, ",")
	if !ok {
		return nil, ErrCreatorInvalid
	}
	format := strings.TrimSuffix(strings.TrimPrefix(label, "data:image/"), ";base64")
	if label != "data:image/"+format+";base64" || (format != "png" && format != "jpeg" && format != "webp") {
		return nil, ErrCreatorInvalid
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, ErrCreatorInvalid
	}
	cfg, actual, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || actual != format || cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > 8192 || cfg.Height > 8192 || int64(cfg.Width)*int64(cfg.Height) > 16000000 {
		return nil, ErrCreatorInvalid
	}
	source, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, ErrCreatorInvalid
	}
	width, height := cfg.Width, cfg.Height
	if longest := max(width, height); longest > 800 {
		width, height = max(1, width*800/longest), max(1, height*800/longest)
	}
	target := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(target, target.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.CatmullRom.Scale(target, target.Bounds(), source, source.Bounds(), draw.Over, nil)
	var out bytes.Buffer
	if err = jpeg.Encode(&out, target, &jpeg.Options{Quality: 84}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
