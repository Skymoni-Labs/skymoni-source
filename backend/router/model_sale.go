package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerModelSaleRoutes(api *gin.RouterGroup) {
	api.GET("/model-sales/public", middleware.DisableCache(), controller.PublicModelSales)
	api.GET("/model-sales/public/:id", middleware.DisableCache(), controller.PublicModelSale)
	api.GET("/model-sales/public/:id/countdown.gif", middleware.DisableCache(), controller.ModelSaleCountdownGIF)
	root := api.Group("/model-sales", middleware.RootAuth(), middleware.DisableCache())
	root.GET("", controller.ListModelSales)
	root.GET("/:id/check", controller.CheckSavedModelSale)
	root.POST("/:id/mail-draft", middleware.SessionCookieOriginGuard(), controller.ModelSaleMailDraft)
	root.POST("/quotes", middleware.SessionCookieOriginGuard(), controller.ModelSaleQuotes)
	root.POST("/costs/refresh", middleware.SessionCookieOriginGuard(), controller.RefreshModelSaleCosts)
	root.POST("", middleware.SessionCookieOriginGuard(), controller.SaveModelSale)
	root.PUT("/:id", middleware.SessionCookieOriginGuard(), controller.SaveModelSale)
	root.POST("/:id/:action", middleware.SessionCookieOriginGuard(), controller.ChangeModelSale)
}
