package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"slices"
	"strings"
)

type AppBetaModelRoute struct {
	Group    string
	Protocol string
}

// Reuse the published relay catalog and the account's existing group access.
// '*' tracks catalog changes; explicit IDs may still be used for a limited rollout.
func AppBetaModelRoutes(userGroup string) map[string]AppBetaModelRoute {
	return appChatModelRoutes(userGroup, AppBetaModels())
}

// Ordinary account login follows the published catalog independently of beta
// rollout settings and retains the account's original group permissions.
func AppAccountModelRoutes(userGroup string) map[string]AppBetaModelRoute {
	return appChatModelRoutes(userGroup, []string{"*"})
}

func appChatModelRoutes(userGroup string, allowed []string) map[string]AppBetaModelRoute {
	usable := GetUserUsableGroups(userGroup)
	groups := make([]string, 0, len(usable))
	for group := range usable {
		if group != "auto" && group != userGroup {
			groups = append(groups, group)
		}
	}
	slices.Sort(groups)
	if userGroup != "" {
		groups = append([]string{userGroup}, groups...)
	}
	routes := appBetaRoutes(model.GetPricing(), groups, allowed)
	published := GetGroupsEnabledModels(groups)
	for name := range routes {
		if !slices.Contains(published, name) {
			delete(routes, name)
		}
	}
	return routes
}

func appBetaRoutes(catalog []model.Pricing, groups, allowed []string) map[string]AppBetaModelRoute {
	routes := map[string]AppBetaModelRoute{}
	all := slices.Contains(allowed, "*")
	for _, entry := range catalog {
		if !all && !slices.Contains(allowed, entry.ModelName) {
			continue
		}
		if common.IsImageGenerationModel(entry.ModelName) {
			continue
		}
		nonChat := false
		for _, kind := range []constant.EndpointType{constant.EndpointTypeEmbeddings, constant.EndpointTypeJinaRerank, constant.EndpointTypeOpenAIVideo} {
			if slices.Contains(entry.SupportedEndpointTypes, kind) {
				nonChat = true
			}
		}
		// Legacy generic OpenAI channels may not declare embedding/audio endpoints.
		name := strings.ToLower(entry.ModelName)
		for _, marker := range []string{"embedding", "embed-", "rerank", "whisper", "-tts", "tts-", "-transcribe", "-realtime", "suno", "sora"} {
			if strings.Contains(name, marker) {
				nonChat = true
			}
		}
		if nonChat {
			continue
		}
		protocol := ""
		if slices.Contains(entry.SupportedEndpointTypes, constant.EndpointTypeOpenAI) {
			protocol = "chat"
		} else if slices.Contains(entry.SupportedEndpointTypes, constant.EndpointTypeOpenAIResponse) {
			protocol = "responses"
		}
		if protocol == "" {
			continue
		}
		for _, group := range groups {
			if slices.Contains(entry.EnableGroup, group) {
				routes[entry.ModelName] = AppBetaModelRoute{Group: group, Protocol: protocol}
				break
			}
		}
	}
	return routes
}
