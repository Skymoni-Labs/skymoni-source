package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerBenefitRoutes(apiRouter *gin.RouterGroup) {
	route := apiRouter.Group("/benefits")
	route.Use(middleware.DisableCache(), middleware.UserAuth())
	route.GET("/warehouse", controller.ListBenefitWarehouse)
	route.GET("/warehouse/:id", controller.GetBenefitWarehouseDetail)
	route.POST("/redeem", middleware.UserCriticalRateLimit("BENEFIT_REDEEM"), controller.RedeemBenefit)
	route.POST("/popup/:id/redeem", middleware.UserCriticalRateLimit("BENEFIT_REDEEM"), controller.RedeemBenefit)
	admin := route.Group("/admin")
	admin.Use(middleware.RootAuth())
	admin.GET("", controller.AdminListBenefits)
	admin.POST("", controller.AdminSaveBenefit)
	admin.GET("/inventory", controller.AdminListBenefitInventory)
	admin.GET("/inventory/:id", controller.AdminGetBenefitInventory)
	admin.PUT("/inventory/:id", controller.AdminEditBenefitInventory)
	admin.POST("/inventory/actions", controller.AdminManageBenefitInventory)
	admin.GET("/codes", controller.AdminListBenefitCodes)
	admin.POST("/codes", controller.AdminGenerateBenefitCodes)
	admin.POST("/codes/:id/state", controller.AdminSetBenefitCodeState)
	admin.GET("/:id", controller.AdminGetBenefit)
	admin.PUT("/:id", controller.AdminSaveBenefit)
	admin.POST("/:id/state", controller.AdminSetBenefitState)
	admin.POST("/:id/inventory", controller.AdminImportBenefitInventory)
}
