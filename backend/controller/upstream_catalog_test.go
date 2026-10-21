package controller

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"os"
	"testing"
)

func TestSyncCostKeepsFreeOutputAndPublishedTiers(t *testing.T) {
	quote := upstreamMonitorModel{BillingType: "token", RawPrice: upstreamMonitorPrice{InputPerMillion: monitorNumber(.042), OutputPerMillion: monitorNumber(0), CacheReadPerMillion: monitorNumber(.001)}, Tiers: []upstreamMonitorTier{{Label: "long"}}}
	cost := syncCostRecord(upstreamMonitorProvider{Provider: "typesafe"}, quote)
	require.Equal(t, 0.0, *cost.OutputUSDPerMillion)
	require.Nil(t, cost.ModelRatio)
	require.Equal(t, .001, *cost.CacheRead)
	require.Len(t, cost.Tiers, 1)
}

func TestUpstreamCatalogDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env)
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			vendor := model.Vendor{Name: "OpenAI", Icon: "OpenAI"}
			require.NoError(t, db.Create(&vendor).Error)
			provider := upstreamMonitorProvider{Provider: "yylx"}
			quote := upstreamMonitorModel{Group: "standard", BillingType: "token"}
			require.NoError(t, syncMissingModelMetadata("gpt-catalog-token", "gpt-catalog", provider, quote))
			var record model.Model
			require.NoError(t, db.Where("model_name = ?", "gpt-catalog-token").First(&record).Error)
			require.Equal(t, vendor.Id, record.VendorID)
			require.NotEmpty(t, record.Description)
			require.Equal(t, 0, record.Status, "upstream discovery must not publish models automatically")
			record.Status = 0
			record.Description = "Administrator description"
			record.Tags = ""
			require.NoError(t, record.Update())
			require.NoError(t, syncMissingModelMetadata(record.ModelName, "gpt-catalog", provider, quote))
			require.NoError(t, db.First(&record, record.Id).Error)
			require.Equal(t, 0, record.Status)
			require.Equal(t, "Administrator description", record.Description)
			require.NotEmpty(t, record.Tags)
			require.NoError(t, syncMissingModelMetadata(record.ModelName, "gpt-catalog", provider, quote))
			var count int64
			require.NoError(t, db.Model(&model.Model{}).Where("model_name = ?", record.ModelName).Count(&count).Error)
			require.Equal(t, int64(1), count)
			require.NoError(t, record.Delete())
			require.NoError(t, syncMissingModelMetadata(record.ModelName, "gpt-catalog", provider, quote))
			require.NoError(t, db.Model(&model.Model{}).Where("model_name = ?", record.ModelName).Count(&count).Error)
			require.Zero(t, count, "periodic sync must respect catalog deletion")
			require.NoError(t, db.Unscoped().Model(&model.Model{}).Where("model_name = ?", record.ModelName).Count(&count).Error)
			require.Equal(t, int64(1), count)
		})
	}
}
