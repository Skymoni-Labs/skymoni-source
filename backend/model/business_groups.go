package model

import "strings"

const OfficialGPTGroup = "moni-gpt-017"

// These standard token aliases have verified official-price 0.17 overrides.
// Unknown official prices, Pro and image models must never inherit this claim.
func BusinessGroupSupportsModel(group, name string) bool {
	if group != OfficialGPTGroup {
		return true
	}
	switch name {
	case "gpt-6-astra-token", "gpt-6.1-sol-token", "gpt-6-sol-token", "gpt-5.6-sol-token", "gpt-5.6-terra-token", "gpt-5.5-token":
		return true
	default:
		return false
	}
}

// Public catalog ownership is our billing product, never a routing provider.
func PublicModelOwner(name string) string {
	if strings.HasPrefix(name, "jev-") || strings.Contains(name, "-token") || strings.Contains(name, "-moni") {
		return "moni-token"
	}
	return "moni计费"
}
