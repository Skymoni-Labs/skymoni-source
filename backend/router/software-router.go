package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerSoftwareRoutes(api *gin.RouterGroup) {
	api.GET("/software/public", middleware.DisableCache(), controller.PublicSoftwareCatalog)
	admin := api.Group("/software/admin", middleware.RootAuth(), middleware.DisableCache())
	admin.GET("/catalog", controller.AdminSoftwareCatalog)
	admin.GET("/files", controller.AdminSoftwareFiles)
	admin.PUT("/catalog", middleware.SessionCookieOriginGuard(), shopSameOrigin, controller.AdminSaveSoftwareCatalog)
	admin.POST("/files", middleware.SessionCookieOriginGuard(), shopSameOrigin, middleware.UserCriticalRateLimit("SOFTWARE_UPLOAD"), controller.AdminUploadSoftware)
	admin.DELETE("/files/:id", middleware.SessionCookieOriginGuard(), shopSameOrigin, controller.AdminDeleteSoftwareFile)
}
