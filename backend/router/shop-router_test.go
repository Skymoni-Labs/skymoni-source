package router

import (
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPublicShopRouteKeepsAccountOperationsAuthenticated(t *testing.T) {
	r := gin.New()
	registerShopRoutes(r.Group("/api"))
	for _, test := range []struct{ method, path string }{
		{"GET", "/api/shop/products?admin=1"},
		{"GET", "/api/shop/orders"},
		{"POST", "/api/shop/purchase"},
		{"POST", "/api/shop/admin/products"},
		{"PUT", "/api/shop/admin/products/3/drip-quantity"},
	} {
		t.Run(test.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			r.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
			assert.Equal(t, http.StatusUnauthorized, response.Code)
		})
	}
}

func TestShopOriginRejectsCrossSiteWrites(t *testing.T) {
	for _, test := range []struct {
		origin string
		status int
	}{{"https://skymoni.com", 200}, {"", 200}, {"https://other.example", 403}, {"null", 403}, {"https://skymoni.com.other.example", 403}} {
		t.Run(test.origin, func(t *testing.T) {
			r := gin.New()
			r.Use(shopSameOrigin)
			r.POST("/purchase", func(c *gin.Context) { c.Status(200) })
			req := httptest.NewRequest(http.MethodPost, "https://skymoni.com/purchase", nil)
			if test.origin != "" {
				req.Header.Set("Origin", test.origin)
			}
			response := httptest.NewRecorder()
			r.ServeHTTP(response, req)
			assert.Equal(t, test.status, response.Code)
		})
	}
}
