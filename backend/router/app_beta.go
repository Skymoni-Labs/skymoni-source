package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerAppBetaAPIs(api *gin.RouterGroup) {
	self := api.Group("/creators/app-beta", middleware.DisableCache(), middleware.UserAuth(), controller.AppBetaBrowserSession)
	self.GET("", controller.GetAppBetaSelf)
	self.POST("/apply", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.ApplyAppBeta)
	self.POST("/pair", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("app-beta-pair"), controller.PairAppBeta)
	self.DELETE("/devices/:device", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.RevokeAppBetaDevice)
	admin := api.Group("/user/app-beta", middleware.DisableCache(), middleware.AdminAuth(), controller.AppBetaBrowserSession)
	admin.GET("", controller.AdminListAppBeta)
	admin.GET("/:id", controller.AdminGetAppBeta)
	admin.POST("/:id", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.AdminReviewAppBeta)
	device := api.Group("/app-beta", middleware.DisableCache(), middleware.AnonymousRequestBodyLimit())
	device.POST("/challenge", middleware.AppBetaEnrollmentRateLimit(), controller.AppBetaChallenge)
	device.POST("/enroll", middleware.AppBetaEnrollmentRateLimit(), controller.AppBetaEnroll)
	device.GET("/device", middleware.AppBetaRequestRateLimit(), middleware.AppBetaDeviceAuth(false), controller.AppBetaDeviceStatus)
}
func registerAppBetaRelay(router *gin.Engine) {
	router.POST("/api/app-beta/chat/completions", middleware.RouteTag("relay"), middleware.DisableCache(), middleware.SystemPerformanceCheck(), middleware.AppBetaRequestRateLimit(), middleware.AppBetaDeviceAuth(true), middleware.AppBetaChatPolicy, middleware.ModelRequestRateLimit(), middleware.Distribute(), controller.AppBetaRelay)
	router.POST("/api/app-beta/responses", middleware.RouteTag("relay"), middleware.DisableCache(), middleware.SystemPerformanceCheck(), middleware.AppBetaRequestRateLimit(), middleware.AppBetaDeviceAuth(true), middleware.AppBetaChatPolicy, middleware.ModelRequestRateLimit(), middleware.Distribute(), controller.AppBetaRelay)
}
