package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
)

func TestTaskPluginChannelHasNoOrdinaryAPIType(t *testing.T) {
	apiType, ok := ChannelType2APIType(constant.ChannelTypeTaskPlugin)
	assert.Equal(t, -1, apiType)
	assert.False(t, ok)
}

func TestDevinGatewayUsesOpenAIEndpointsWithoutCompact(t *testing.T) {
	apiType, ok := ChannelType2APIType(constant.ChannelTypeDevinGateway)
	assert.True(t, ok)
	assert.Equal(t, constant.APITypeOpenAI, apiType)
	assert.Equal(t,
		[]constant.EndpointType{constant.EndpointTypeOpenAI, constant.EndpointTypeOpenAIResponse},
		GetEndpointTypesByChannelType(constant.ChannelTypeDevinGateway, "claude-sonnet-5-medium"),
	)
	assert.False(t, SupportsResponsesCompact(constant.ChannelTypeDevinGateway, apiType))
}
