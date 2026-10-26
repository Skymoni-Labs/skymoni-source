package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerSecurityProtectionRoutes(api *gin.RouterGroup) {
	root := api.Group("/security-protection")
	root.Use(middleware.RootAuth(), middleware.DisableCache())
	root.GET("/config", controller.GetSecurityProtectionConfig)
	root.GET("/overview", controller.GetSecurityProtectionOverview)
	root.GET("/events", controller.GetSecurityProtectionEvents)
	root.GET("/bans", controller.GetSecurityProtectionBans)
	root.PUT("/config", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.UpdateSecurityProtectionConfig)
	root.POST("/bans", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.CreateSecurityProtectionBan)
	root.POST("/bans/:id/revoke", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.RevokeSecurityProtectionBan)
}
