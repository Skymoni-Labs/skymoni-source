package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetRoutingModelGroups(c *gin.Context) {
	catalog, err := model.GetRoutingModelGroupCatalog()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, catalog)
}

func SaveRoutingModelGroup(c *gin.Context) {
	var change model.RoutingModelGroupChange
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20), &change); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "模型分组请求无效"})
		return
	}
	if err := model.SaveRoutingModelGroup(change); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, model.ErrRoutingModelGroupConflict) {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}
	model.InitChannelCache()
	recordManageAudit(c, "model_group."+change.Mode, map[string]any{"name": change.Name, "models": change.Models})
	common.ApiSuccess(c, nil)
}
