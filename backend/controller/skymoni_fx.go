package controller

import (
	"context"
	"encoding/xml"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const referenceFXOption = "SkymoniReferenceFX"
const referenceFXSource = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"

type referenceFXQuote struct {
	USDToCNY float64   `json:"usd_to_cny"`
	RateDate string    `json:"rate_date"`
	Checked  time.Time `json:"checked_at"`
	Source   string    `json:"source"`
}

var referenceFXAttempt struct {
	sync.Mutex
	at time.Time
}

func currentReferenceFX() (referenceFXQuote, bool) {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[referenceFXOption]
	common.OptionMapRWMutex.RUnlock()
	var quote referenceFXQuote
	if raw == "" || common.UnmarshalJsonStr(raw, &quote) != nil ||
		!syncFinite(quote.USDToCNY) || quote.USDToCNY < 4 || quote.USDToCNY > 10 ||
		quote.Source != referenceFXSource {
		return referenceFXQuote{}, false
	}
	date, err := time.Parse("2006-01-02", quote.RateDate)
	if err != nil || date.After(time.Now().UTC()) || time.Since(date) > 10*24*time.Hour {
		return referenceFXQuote{}, false
	}
	return quote, true
}

func parseECBReferenceFX(data []byte, now time.Time) (referenceFXQuote, error) {
	var payload struct {
		Days []struct {
			Date  string `xml:"time,attr"`
			Rates []struct {
				Currency string  `xml:"currency,attr"`
				Rate     float64 `xml:"rate,attr"`
			} `xml:"Cube"`
		} `xml:"Cube>Cube"`
	}
	if err := xml.Unmarshal(data, &payload); err != nil || len(payload.Days) != 1 {
		return referenceFXQuote{}, errors.New("invalid ECB reference rate response")
	}
	day := payload.Days[0]
	date, err := time.Parse("2006-01-02", day.Date)
	if err != nil || date.After(now.UTC()) || now.UTC().Sub(date) > 10*24*time.Hour {
		return referenceFXQuote{}, errors.New("ECB reference rate date is invalid or stale")
	}
	var usd, cny float64
	for _, rate := range day.Rates {
		switch rate.Currency {
		case "USD":
			usd = rate.Rate
		case "CNY":
			cny = rate.Rate
		}
	}
	value := cny / usd
	if usd <= 0 || cny <= 0 || math.IsNaN(value) || math.IsInf(value, 0) || value < 4 || value > 10 {
		return referenceFXQuote{}, errors.New("invalid USD/CNY reference rate")
	}
	return referenceFXQuote{USDToCNY: value, RateDate: day.Date, Checked: now.UTC(), Source: referenceFXSource}, nil
}

// The scheduled upstream monitor owns this refresh; the attempt guard avoids
// repeated external requests while keeping the last valid quote on failures.
func refreshReferenceFX(ctx context.Context, now time.Time, client *http.Client) (referenceFXQuote, error) {
	previous, hasPrevious := currentReferenceFX()
	localNow := now.In(time.FixedZone("CST", 8*3600))
	if hasPrevious && previous.Checked.In(localNow.Location()).Format("2006-01-02") == localNow.Format("2006-01-02") {
		return previous, nil
	}
	referenceFXAttempt.Lock()
	defer referenceFXAttempt.Unlock()
	if !referenceFXAttempt.at.IsZero() && now.Sub(referenceFXAttempt.at) < 6*time.Hour {
		if hasPrevious {
			return previous, nil
		}
		return referenceFXQuote{}, errors.New("reference FX refresh is cooling down")
	}
	referenceFXAttempt.at = now
	requestCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, referenceFXSource, nil)
	if err != nil {
		return referenceFXQuote{}, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return referenceFXQuote{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return referenceFXQuote{}, errors.New("ECB reference rate request failed: HTTP " + strconv.Itoa(resp.StatusCode))
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 128*1024+1))
	if err != nil || len(data) > 128*1024 {
		return referenceFXQuote{}, errors.New("ECB reference rate response too large or unreadable")
	}
	quote, err := parseECBReferenceFX(data, now)
	if err != nil {
		return referenceFXQuote{}, err
	}
	encoded, err := common.Marshal(quote)
	if err != nil {
		return referenceFXQuote{}, err
	}
	if err := model.UpdateOption(referenceFXOption, string(encoded)); err != nil {
		return referenceFXQuote{}, err
	}
	return quote, nil
}
