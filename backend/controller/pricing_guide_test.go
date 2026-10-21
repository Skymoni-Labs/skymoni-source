package controller

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPricingGuideConfigValidation(t *testing.T) {
	for _, tc := range []struct {
		name, value string
		valid       bool
	}{
		{"default", "", true},
		{"custom text and visibility", `{"conversionTitle":"换算","conversionContent":"按 {{creditPrice}} 换算","showConversion":true,"showSuffix":false}`, true},
		{"malformed JSON", `{`, false},
		{"array", `[]`, false},
		{"null", `null`, false},
		{"invalid visibility", `{"showSuffix":"false"}`, false},
		{"unknown field", `{"secret":"must not become public"}`, false},
		{"oversized title", `{"suffixTitle":"` + strings.Repeat("a", 121) + `"}`, false},
		{"oversized content", `{"suffixContent":"` + strings.Repeat("a", 8001) + `"}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := validatePricingGuideConfig(tc.value)
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}

func TestPricingGroupLabelsValidation(t *testing.T) {
	for _, tc := range []struct {
		name, value string
		valid       bool
	}{
		{"defaults", "", true},
		{"empty overrides", `{}`, true},
		{"custom and Unicode names", `{"moni-gpt-017":"GPT 优选","typesafe":"Jev","custom.group":"新分组"}`, true},
		{"blank restores default", `{"default":""}`, true},
		{"malformed", `{`, false},
		{"array", `[]`, false},
		{"null", `null`, false},
		{"null label", `{"default":null}`, false},
		{"numeric label", `{"default":1}`, false},
		{"invalid identifier", `{"__proto__":"Name"}`, false},
		{"blank identifier", `{" ":"Name"}`, false},
		{"oversized name", `{"default":"` + strings.Repeat("名", 81) + `"}`, false},
		{"multiline name", `{"default":"first\nsecond"}`, false},
		{"oversized payload", strings.Repeat(" ", 131073) + `{}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := validatePricingGroupLabels(tc.value)
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}

func TestPricingVisibleGroupsValidation(t *testing.T) {
	existing := map[string]float64{"default": 1, "vip": 2, "moni-gpt-premium": 1, "auto": 1}
	for _, tc := range []struct {
		name, value string
		valid       bool
	}{
		{"legacy default", "", true},
		{"nothing selected", `[]`, true},
		{"existing groups", `["vip","moni-gpt-premium"]`, true},
		{"unknown group", `["invented"]`, false},
		{"duplicate", `["vip","vip"]`, false},
		{"automatic group", `["auto"]`, false},
		{"null", `null`, false},
		{"object", `{}`, false},
		{"null group", `[null]`, false},
		{"malformed", `[`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := validatePricingVisibleGroups(tc.value, existing)
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}
