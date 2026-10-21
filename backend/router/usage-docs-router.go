package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerUsageDocsRoutes(api *gin.RouterGroup) {
	docs := api.Group("/docs", middleware.DisableCache())
	docs.GET("/public", controller.PublicDocsIndex)
	docs.GET("/public/:id", controller.PublicDocsPage)
	docs.GET("/images/:id", middleware.TryUserAuth(), controller.DocsImage)
	admin := docs.Group("/admin", middleware.RootAuth())
	admin.GET("", controller.AdminDocsCatalog)
	admin.PUT("/:id", middleware.SessionCookieOriginGuard(), shopSameOrigin, controller.AdminSaveDocs)
	admin.POST("/images", middleware.SessionCookieOriginGuard(), shopSameOrigin, middleware.UserCriticalRateLimit("DOCS_UPLOAD"), controller.AdminUploadDocsImage)
}
