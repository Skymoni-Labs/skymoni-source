package controller

import (
	"os"
	"strconv"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func PublicCreatorProfile(c *gin.Context) {
	uid, err := strconv.Atoi(c.Param("id"))
	if err != nil || uid <= 0 {
		creatorError(c, os.ErrNotExist)
		return
	}
	data, err := service.GetPublicCreatorProfile(uid)
	if err != nil {
		creatorError(c, err)
		return
	}
	if c.Query("view") == "cards" {
		for i := range data.Works {
			data.Works[i] = service.CreatorCard(data.Works[i])
		}
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}
