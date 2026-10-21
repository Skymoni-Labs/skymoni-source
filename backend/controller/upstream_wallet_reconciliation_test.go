package controller

import (
 "encoding/json"
 "os"
 "path/filepath"
 "testing"
 "github.com/QuantumNous/new-api/model"
 "github.com/stretchr/testify/require"
)

func TestUpstreamWalletReconciledSupplierBills(t *testing.T) {
 root := os.Getenv("WALLET_COST_FIXTURES")
 if root == "" { t.Skip("external sanitized reconciliation fixtures") }
 raw, err := os.ReadFile(filepath.Join(root,"cost-plan.json")); require.NoError(t,err)
 var plan []struct { ChannelID int `json:"channel_id"`; Target string `json:"target"`; Aliases []string `json:"aliases"`; Quote UpstreamCost `json:"quote"` }
 require.NoError(t,json.Unmarshal(raw,&plan))
 for _, suffix := range []string{"45","55"} {
  name:="shep-usage.json";target:="claude-opus-4-5-20251101"
  if suffix=="55" {name="shep55-usage.json";target="claude-opus-5-5"}
  var bills []struct {Input int `json:"input_tokens"`; Output int `json:"output_tokens"`; Read float64 `json:"cache_read_tokens"`; Write float64 `json:"cache_creation_tokens"`; Actual float64 `json:"actual_cost"`}
  raw,err=os.ReadFile(filepath.Join(root,name));require.NoError(t,err);require.NoError(t,json.Unmarshal(raw,&bills))
  found:=false
  for _, p:= range plan { if p.Quote.Provider!="shep" || p.Target!=target {continue}; found=true
   for _,b:=range bills {
    log:=&model.Log{PromptTokens:b.Input,CompletionTokens:b.Output,ModelName:p.Aliases[0]}
    cost,reason:=calculateWalletCost(log,map[string]any{"usage_semantic":"anthropic","cache_tokens":b.Read,"cache_write_tokens":b.Write},p.Quote)
    require.Empty(t,reason);require.InDelta(t,b.Actual,cost,1e-9)
   }
  };require.True(t,found)
 }
 for _,p:=range plan {
  costs:=map[string][]UpstreamCost{p.Target:{p.Quote}}
  for _,alias:=range p.Aliases {costs[alias]=[]UpstreamCost{p.Quote}}
  names:=append([]string{p.Target},p.Aliases...)
  q,reason:=selectUpstreamWalletCost(costs,names,p.Quote.Provider,p.Target,p.ChannelID)
  require.Empty(t,reason);require.Equal(t,p.ChannelID,q.ChannelID)
  log:=&model.Log{PromptTokens:100,CompletionTokens:3,CreatedAt:1792190000,UseTime:1,ModelName:p.Aliases[0]}
  cost,reason:=calculateWalletCost(log,map[string]any{},q);require.Empty(t,reason);require.Greater(t,cost,0.0)
 }
}
