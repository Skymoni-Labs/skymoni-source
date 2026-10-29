package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerAppAccountAPIs(api *gin.RouterGroup) {
	app := api.Group("/app-account", middleware.DisableCache(), middleware.AnonymousRequestBodyLimit())
	app.GET("/login/options", controller.AppNativeLoginOptions)
	app.POST("/login", middleware.LoginRateLimit(), middleware.TurnstileCheck(), controller.AppNativeLogin)
	app.POST("/login/verify", middleware.CriticalRateLimit(), controller.AppNativeVerifyLogin)
	app.POST("/authorize", middleware.AppAccountAuthorizationRateLimit(), controller.AppAccountAuthorize)
	app.POST("/token", middleware.AppAccountPollRateLimit(), controller.AppAccountToken)
	browser := app.Group("", middleware.UserAuth(), middleware.AppAccountBrowserSession)
	browser.GET("/authorization", controller.AppAccountAuthorization)
	browser.POST("/authorization", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("app-account-confirm"), controller.AppAccountDecide)
	native := app.Group("", middleware.AppAccountRequestRateLimit(), middleware.AppAccountAuth(false))
	native.GET("/me", controller.AppAccountMe)
	native.GET("/models", controller.AppAccountModels)
	native.GET("/beta-status", controller.AppAccountBetaStatus)
	native.DELETE("/session", controller.AppAccountLogout)
}
func registerAppAccountRelay(router *gin.Engine) {
	app := router.Group("/api/app-account", middleware.RouteTag("relay"), middleware.DisableCache(), middleware.SystemPerformanceCheck(), middleware.AppAccountRequestRateLimit(), middleware.AppAccountAuth(true), middleware.AppAccountFunding)
	app.POST("/chat/completions", middleware.AppAccountChatPolicy, middleware.ModelRequestRateLimit(), middleware.Distribute(), controller.AppBetaRelay)
	app.POST("/responses", middleware.AppAccountChatPolicy, middleware.ModelRequestRateLimit(), middleware.Distribute(), controller.AppBetaRelay)
	app.POST("/agent/chat/completions", middleware.AppAccountAgentChatPolicy, middleware.ModelRequestRateLimit(), middleware.Distribute(), controller.AppBetaRelay)
}
