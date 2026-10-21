package controller

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

func validatePricingGuideConfig(value string) error {
	if value == "" {
		return nil
	}
	var fields map[string]any
	if len(value) > 70000 || common.UnmarshalJsonStr(value, &fields) != nil || fields == nil {
		return errors.New("Invalid model square guide settings")
	}
	for key, value := range fields {
		switch key {
		case "showConversion", "showSuffix":
			if _, ok := value.(bool); !ok {
				return errors.New("Guide visibility must be a boolean")
			}
		case "conversionTitle", "suffixTitle", "conversionContent", "suffixContent":
			text, ok := value.(string)
			limit := 8000
			if key == "conversionTitle" || key == "suffixTitle" {
				limit = 120
			}
			if !ok || utf8.RuneCountInString(text) > limit {
				return errors.New("Guide text exceeds the allowed length")
			}
		default:
			return errors.New("Unknown model square guide setting")
		}
	}
	return nil
}

// Display names never replace group identifiers used for access or billing.
func validatePricingGroupLabels(value string) error {
	if value == "" {
		return nil
	}
	var labels map[string]any
	if len(value) > 131072 || common.UnmarshalJsonStr(value, &labels) != nil || labels == nil || len(labels) > 256 {
		return errors.New("Invalid model square group names")
	}
	for group, value := range labels {
		label, ok := value.(string)
		if !ok || strings.TrimSpace(group) == "" || utf8.RuneCountInString(group) > 128 || utf8.RuneCountInString(label) > 80 || strings.ContainsFunc(group, unicode.IsControl) || strings.ContainsFunc(label, unicode.IsControl) {
			return errors.New("Group names must be single-line text of at most 80 characters")
		}
		if group == "__proto__" || group == "constructor" || group == "prototype" {
			return errors.New("Invalid model square group identifier")
		}
	}
	return nil
}

func validatePricingVisibleGroups(value string, existing map[string]float64) error {
	if value == "" {
		return nil
	}
	var groups []string
	if len(value) > 131072 || common.UnmarshalJsonStr(value, &groups) != nil || groups == nil || len(groups) > 256 {
		return errors.New("Invalid model square group selection")
	}
	seen := make(map[string]bool, len(groups))
	for _, group := range groups {
		if _, ok := existing[group]; !ok || group == "auto" || group == "" || seen[group] {
			return errors.New("Select existing groups for the model square")
		}
		seen[group] = true
	}
	return nil
}
