package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerDripIdentityRoutes(api *gin.RouterGroup, bodyLimit gin.HandlerFunc) {
	authorized := api.Group("/drip", middleware.DisableCache(), middleware.UserAuth())
	authorized.POST("/authorize", middleware.SessionCookieOriginGuard(), shopSameOrigin,
		middleware.UserCriticalRateLimit("DRIP_AUTHORIZATION"), controller.StartDripAuthorization)
	api.POST("/drip/token", middleware.DisableCache(), middleware.CriticalRateLimit(), bodyLimit, controller.ExchangeDripAuthorization)
}
