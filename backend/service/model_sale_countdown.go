package service

import (
	"bytes"
	"fmt"
	"github.com/QuantumNous/new-api/model"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"sync"
	"time"
)

// One playback snapshot, never a fake looping countdown. Mail also contains
// the absolute deadline and a link to the continuously updating activity page.
const ModelSaleGIFFlipSeconds = 60

var saleGIFSlots = make(chan struct{}, 3)

type saleGIFEntry struct {
	Data []byte
	At   time.Time
}

var saleGIFCache = struct {
	sync.Mutex
	Values map[string]saleGIFEntry
}{Values: map[string]saleGIFEntry{}}

func ModelSaleCountdownTarget(sale model.ModelSale, now time.Time) (int64, string) {
	publication := model.ModelSalePublicationState(sale, now)
	if sale.AnnouncementManaged && publication != "published" && publication != "ended" {
		if publication == "scheduled" {
			return sale.AnnouncementAt, "PREVIEW / UNTIL PUBLICATION"
		}
		return sale.EndAt, "PREVIEW / NOT PUBLISHED"
	}
	if publication == "published" && (sale.Status == "draft" || sale.Status == "paused") {
		if sale.Config.CountdownMode == "start" || (sale.Config.CountdownMode == "auto" && now.Unix() < sale.StartAt) {
			return sale.StartAt, "ANNOUNCEMENT / UNTIL PLANNED START"
		}
		return sale.EndAt, "ANNOUNCEMENT / UNTIL PLANNED END"
	}
	if sale.Status != "active" && sale.Status != "scheduled" {
		if sale.Status == "draft" || sale.Status == "paused" {
			return sale.EndAt, "PREVIEW / NOT ENABLED"
		}
		return now.Unix(), "OFFER ENDED"
	}
	if now.Unix() >= sale.EndAt {
		return now.Unix(), "OFFER ENDED"
	}
	if sale.Config.CountdownMode == "start" {
		if now.Unix() >= sale.StartAt {
			return now.Unix(), "START TIME REACHED / VIEW LIVE"
		}
		return sale.StartAt, "UNTIL START"
	}
	if sale.Config.CountdownMode == "auto" && now.Unix() < sale.StartAt {
		return sale.StartAt, "UNTIL START"
	}
	return sale.EndAt, "UNTIL END"
}
func RenderModelSaleCountdownGIF(sale model.ModelSale, now time.Time) ([]byte, error) {
	target, label := ModelSaleCountdownTarget(sale, now)
	key := fmt.Sprintf("%s:%d:%d:%s:%d", sale.ID, sale.Revision, target, label, now.Unix()/5)
	saleGIFCache.Lock()
	if hit, ok := saleGIFCache.Values[key]; ok {
		saleGIFCache.Unlock()
		return hit.Data, nil
	}
	saleGIFCache.Unlock()
	animate := true
	select {
	case saleGIFSlots <- struct{}{}:
		defer func() { <-saleGIFSlots }()
	default:
		animate = false
	}
	remaining := max(int64(0), target-now.Unix())
	if remaining == 0 {
		animate = false
	}
	data, err := renderSaleFlip(remaining, label, animate)
	if err != nil {
		return nil, err
	}
	if animate {
		saleGIFCache.Lock()
		if len(saleGIFCache.Values) >= 24 {
			for old, value := range saleGIFCache.Values {
				if now.Sub(value.At) > 10*time.Second {
					delete(saleGIFCache.Values, old)
				}
			}
			if len(saleGIFCache.Values) >= 24 {
				saleGIFCache.Values = map[string]saleGIFEntry{}
			}
		}
		saleGIFCache.Values[key] = saleGIFEntry{data, now}
		saleGIFCache.Unlock()
	}
	return data, nil
}
func renderSaleFlip(remaining int64, label string, animate bool) ([]byte, error) {
	palette := color.Palette{color.RGBA{8, 17, 33, 255}, color.RGBA{22, 38, 63, 255}, color.RGBA{12, 25, 44, 255}, color.RGBA{52, 85, 119, 255}, color.RGBA{116, 201, 255, 255}, color.RGBA{238, 246, 255, 255}}
	for i := 0; i < 58; i++ {
		v := uint8(30 + i*3)
		palette = append(palette, color.RGBA{v, uint8(min(255, int(v)+7)), uint8(min(255, int(v)+15)), 255})
	}
	parsed, err := opentype.Parse(gobold.TTF)
	if err != nil {
		return nil, err
	}
	face, err := opentype.NewFace(parsed, &opentype.FaceOptions{Size: 43, DPI: 72, Hinting: font.HintingFull})
	if err != nil {
		return nil, err
	}
	defer face.Close()
	small, err := opentype.NewFace(parsed, &opentype.FaceOptions{Size: 11, DPI: 72, Hinting: font.HintingFull})
	if err != nil {
		return nil, err
	}
	defer small.Close()
	text := func(img draw.Image, face font.Face, x, y int, s string, c color.Color) {
		drawer := font.Drawer{Dst: img, Src: image.NewUniform(c), Face: face, Dot: fixed.P(x, y)}
		drawer.DrawString(s)
	}
	glyphs := map[byte]*image.Paletted{}
	for digit := byte('0'); digit <= '9'; digit++ {
		tile := image.NewPaletted(image.Rect(0, 0, 46, 64), palette)
		draw.Draw(tile, tile.Bounds(), image.NewUniform(palette[1]), image.Point{}, draw.Src)
		draw.Draw(tile, image.Rect(0, 32, 46, 64), image.NewUniform(palette[2]), image.Point{}, draw.Src)
		text(tile, face, 10, 48, string(digit), palette[5])
		draw.Draw(tile, image.Rect(0, 31, 46, 33), image.NewUniform(palette[0]), image.Point{}, draw.Src)
		glyphs[digit] = tile
	}
	digits := func(seconds int64) string {
		return fmt.Sprintf("%03d%02d%02d%02d", min(seconds/86400, 999), seconds/3600%24, seconds/60%60, seconds%60)
	}
	positions := []int{52, 102, 152, 224, 274, 346, 396, 468, 518}
	frame := func(old, new string, phase int) *image.Paletted {
		img := image.NewPaletted(image.Rect(0, 0, 620, 132), palette)
		text(img, small, 52, 17, label, palette[4])
		for i, x := range positions {
			dst := image.Rect(x, 29, x+46, 93)
			draw.Draw(img, dst, glyphs[old[i]], image.Point{}, draw.Src)
			if old[i] != new[i] && phase > 0 {
				// Old upper half folds to the hinge; new lower half opens downward.
				if phase == 1 {
					draw.Draw(img, image.Rect(x, 29, x+46, 61), glyphs[new[i]], image.Point{}, draw.Src)
					for y := 0; y < 16; y++ {
						for xx := 0; xx < 46; xx++ {
							img.SetColorIndex(x+xx, 45+y, glyphs[old[i]].ColorIndexAt(xx, y*2))
						}
					}
				} else if phase == 2 {
					draw.Draw(img, image.Rect(x, 29, x+46, 61), glyphs[new[i]], image.Point{}, draw.Src)
					for y := 0; y < 16; y++ {
						for xx := 0; xx < 46; xx++ {
							img.SetColorIndex(x+xx, 61+y, glyphs[new[i]].ColorIndexAt(xx, 32+y*2))
						}
					}
				} else {
					draw.Draw(img, dst, glyphs[new[i]], image.Point{}, draw.Src)
				}
			}
			draw.Draw(img, image.Rect(x, 60, x+46, 62), image.NewUniform(palette[0]), image.Point{}, draw.Src)
		}
		for i, s := range []string{"DAYS", "HOURS", "MINUTES", "SECONDS"} {
			text(img, small, []int{104, 244, 363, 484}[i], 112, s, palette[4])
		}
		text(img, small, 52, 128, "SEE ACTIVITY PAGE FOR LIVE STATUS", palette[3])
		return img
	}
	animation := &gif.GIF{LoopCount: -1}
	add := func(img *image.Paletted, delay int) {
		animation.Image = append(animation.Image, img)
		animation.Delay = append(animation.Delay, delay)
		animation.Disposal = append(animation.Disposal, gif.DisposalNone)
	}
	if !animate {
		add(frame(digits(remaining), digits(remaining), 0), 100)
	} else {
		count := int(min(int64(ModelSaleGIFFlipSeconds), remaining))
		for second := 0; second < count; second++ {
			old, new := digits(remaining-int64(second)), digits(remaining-int64(second)-1)
			add(frame(old, new, 0), 70)
			for phase := 1; phase <= 3; phase++ {
				add(frame(old, new, phase), 10)
			}
		}
		last := digits(max(int64(0), remaining-int64(count)))
		add(frame(last, last, 0), 100)
	}
	var out bytes.Buffer
	err = gif.EncodeAll(&out, animation)
	return out.Bytes(), err
}
