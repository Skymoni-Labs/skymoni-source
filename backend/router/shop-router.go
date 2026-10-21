package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
	"net/url"
)

func registerShopRoutes(apiRouter *gin.RouterGroup) {
	apiRouter.GET("/shop/images/:name", controller.GetShopImage)
	apiRouter.GET("/shop/public/products", middleware.DisableCache(), controller.ListPublicShopProducts)
	apiRouter.GET("/drip/sub/:format/:id", middleware.DisableCache(), controller.ProxyDripShopSubscription)
	route := apiRouter.Group("/shop", middleware.DisableCache(), middleware.UserAuth())
	route.Use(shopSameOrigin)
	route.GET("/products", controller.ListShopProducts)
	route.GET("/orders", controller.ListShopOrders)
	route.POST("/purchase", middleware.UserCriticalRateLimit("SHOP_PURCHASE"), controller.PurchaseShopProduct)
	admin := route.Group("/admin", middleware.RootAuth())
	admin.POST("/images", middleware.UserCriticalRateLimit("SHOP_IMAGE_UPLOAD"), controller.AdminUploadShopImage)
	admin.POST("/products", controller.AdminSaveShopProduct)
	admin.PUT("/products/:id", controller.AdminSaveShopProduct)
	admin.PUT("/products/:id/drip-quantity", controller.AdminSetDripSaleQuantity)
	admin.POST("/products/:id/sale", controller.AdminSetShopSale)
	admin.POST("/orders/:id/:action", controller.AdminSettleShopOrder)
	admin.GET("/orders/:id/refund-quote", controller.DripShopRefundQuote)
}

func shopSameOrigin(c *gin.Context) {
	if c.Request.Method != "GET" && c.GetHeader("Origin") != "" {
		origin, err := url.Parse(c.GetHeader("Origin"))
		if err != nil || origin.Host != c.Request.Host {
			c.AbortWithStatusJSON(403, gin.H{"success": false, "message": "请求来源无效"})
			return
		}
	}
	c.Next()
}
