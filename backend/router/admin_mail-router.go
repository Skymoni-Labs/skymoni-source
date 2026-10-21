package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerAdminMailRoutes(apiRouter *gin.RouterGroup) {
	apiRouter.GET("/admin-mail-images/:name", controller.PublicAdminMailImage)
	route := apiRouter.Group("/admin-mail")
	route.Use(middleware.DisableCache(), middleware.RootAuth())
	route.GET("", controller.AdminListMail)
	route.GET("/:id", controller.AdminGetMail)
	route.GET("/:id/edit", controller.AdminGetMailDraftInput)
	route.GET("/:id/recipients", controller.AdminMailRecipients)
	route.POST("/images", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.AdminUploadMailImage)
	route.POST("/preview", middleware.SessionCookieOriginGuard(), controller.AdminPreviewMail)
	route.POST("", middleware.SessionCookieOriginGuard(), controller.AdminCreateMailDraft)
	route.PUT("/:id", middleware.SessionCookieOriginGuard(), controller.AdminUpdateMailDraft)
	route.POST("/:id/send", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.AdminQueueMail)
	route.POST("/:id/schedule", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.AdminScheduleMail)
	route.POST("/:id/cancel", middleware.SessionCookieOriginGuard(), controller.AdminCancelMail)
}
