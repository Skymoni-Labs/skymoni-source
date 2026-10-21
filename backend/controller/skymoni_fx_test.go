package controller

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestParseECBReferenceFX(t *testing.T) {
	now := time.Date(2026, 9, 26, 4, 0, 0, 0, time.UTC)
	data := []byte(`<?xml version="1.0"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube><Cube time="2026-09-25"><Cube currency="USD" rate="1.1403"/><Cube currency="CNY" rate="7.6551"/></Cube></Cube></gesmes:Envelope>`)
	quote, err := parseECBReferenceFX(data, now)
	require.NoError(t, err)
	require.InDelta(t, 6.713233, quote.USDToCNY, 0.000001)
	require.Equal(t, "2026-09-25", quote.RateDate)
	require.Equal(t, referenceFXSource, quote.Source)

	_, err = parseECBReferenceFX([]byte(`<Cube><Cube><Cube time="2026-09-25"><Cube currency="USD" rate="1.1403"/></Cube></Cube></Cube>`), now)
	require.Error(t, err)
	_, err = parseECBReferenceFX([]byte(`<Cube><Cube><Cube time="2026-09-01"><Cube currency="USD" rate="1.1403"/><Cube currency="CNY" rate="7.6551"/></Cube></Cube></Cube>`), now)
	require.Error(t, err)
}
