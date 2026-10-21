package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerPopupNoticeRoutes(apiRouter *gin.RouterGroup) {
	route := apiRouter.Group("/popup-notices")
	route.Use(middleware.DisableCache())
	route.GET("/guest", controller.GetGuestPopupNotices)
	route.GET("/self", middleware.UserAuth(), controller.GetSelfPopupNotices)
	route.GET("/history", middleware.UserAuth(), controller.GetSelfPopupNoticeHistory)
	route.GET("/history/:id", middleware.UserAuth(), controller.GetSelfPopupNoticeHistoryDetail)
	route.POST("/:id/read", middleware.UserAuth(), controller.ReadPopupNotice)
	admin := route.Group("/admin")
	admin.Use(middleware.RootAuth())
	templates := admin.Group("/templates", shopSameOrigin)
	templates.GET("", controller.AdminListPopupTemplates)
	templates.POST("", controller.AdminSavePopupTemplate)
	templates.PUT("/:id", controller.AdminSavePopupTemplate)
	templates.DELETE("/:id", controller.AdminDeletePopupTemplate)
	admin.GET("", controller.AdminListPopupNotices)
	admin.POST("", controller.AdminCreatePopupNotice)
	admin.GET("/:id", controller.AdminGetPopupNotice)
	admin.PUT("/:id", controller.AdminUpdatePopupNotice)
	admin.DELETE("/:id", controller.AdminDeletePopupNotice)
	admin.POST("/:id/state", controller.AdminSetPopupNoticeState)
}
