package controller

import (
	"net/http"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

func BatchMergeChannelGroup(c *gin.Context) {
	var request struct {
		IDs   []int  `json:"ids"`
		Group string `json:"group"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请求格式无效"})
		return
	}
	request.Group = strings.TrimSpace(request.Group)
	if _, managed := model.RoutingModelGroupModels(request.Group); managed {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "这是独立模型分组，请在模型管理中选择模型归组"})
		return
	}
	if len(request.IDs) == 0 || len(request.IDs) > 500 || request.Group == "auto" ||
		request.Group == "" || strings.Contains(request.Group, ",") || !ratio_setting.ContainsGroupRatio(request.Group) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请选择已创建的目标分组，每次最多处理 500 个渠道"})
		return
	}
	slices.Sort(request.IDs)
	request.IDs = slices.Compact(request.IDs)
	if request.IDs[0] <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "渠道编号无效"})
		return
	}
	changed, err := model.MergeChannelGroup(request.IDs, request.Group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if changed > 0 {
		model.InitChannelCache()
		recordManageAudit(c, "channel.batch_merge_group", map[string]any{
			"ids": request.IDs, "group": request.Group, "updated": changed,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"updated": changed, "unchanged": len(request.IDs) - changed,
	}})
}
