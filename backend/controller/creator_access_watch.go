package controller

import (
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"time"
)

func CreatorWatchAccess(c *gin.Context) {
	state, err := service.WaitCreatorAccess(c.Request.Context(), c.GetInt("id"), c.Query("status"), 25*time.Second)
	if c.Request.Context().Err() != nil {
		return
	}
	if err != nil {
		creatorError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": state})
}
