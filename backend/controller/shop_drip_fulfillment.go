package controller

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func provisionDripShopOrder(ctx context.Context, id int) error {
	order, code, userName, err := model.ShopOrderForProvision(id)
	if err != nil {
		return err
	}
	var reply struct {
		OK             bool   `json:"ok"`
		SubscriptionID string `json:"subscriptionId"`
	}
	payload := map[string]any{
		"orderId": order.ID, "subject": strconv.Itoa(order.UserID),
		"displayName": userName, "code": code,
	}
	if order.DripGenerated {
		payload["quotaGb"] = order.DripQuotaGiB
		days, err := model.ShopOrderDurationDays(order)
		if err != nil {
			return err
		}
		if days > 0 {
			payload["durationDays"] = days
		}
	}
	err = dripShopCall(ctx, "/api/internal/shop/provision", "DRIP_SHOP_PROVISION_SECRET",
		"X-Drip-Shop-Provision-Secret", payload, &reply)
	if err != nil || !reply.OK {
		if err != nil {
			return err
		}
		return errShopRefundGateway
	}
	return model.MarkShopOrderProvisioned(order.ID, reply.SubscriptionID)
}

// The order itself is the durable retry queue; repeated requests are safe on
// the Drip side because the order ID and one-time voucher are both checked.
func StartDripShopProvisionWorker() func() {
	if !common.IsMasterNode || len(os.Getenv("DRIP_SHOP_PROVISION_SECRET")) < 32 || os.Getenv("DRIP_ACCOUNT_ORIGIN") == "" {
		return func() {}
	}
	stop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			orders, err := model.PendingDripShopOrders(25)
			if err == nil {
				for _, order := range orders {
					ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
					if err := provisionDripShopOrder(ctx, order.ID); err != nil && !errors.Is(err, model.ErrShopConflict) {
						if errors.Is(err, errShopVoucherUsed) {
							if markErr := model.MarkShopOrderProvisionReview(order.ID); markErr != nil {
								common.SysError(fmt.Sprintf("Drip shop order %d review marking failed: %v", order.ID, markErr))
							}
						}
						common.SysError(fmt.Sprintf("Drip shop order %d provision retry failed: %v", order.ID, err))
					}
					cancel()
				}
			}
			select {
			case <-stop:
				return
			case <-ticker.C:
			}
		}
	}()
	return func() { close(stop) }
}

func DripShopRefundQuote(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		shopError(c, model.ErrShopInvalid)
		return
	}
	order, hash, err := model.PrepareShopRefund(id)
	if err != nil {
		shopError(c, err)
		return
	}
	if order.Status == "refunded" {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "订单已退款"})
		return
	}
	quota, cents := int64(order.Quota), order.PriceCents
	if order.Status == "delivered" {
		quote, err := dripShopRefund(c.Request.Context(), order.ID, hash, order.DripGenerated, false)
		if err != nil {
			shopRefundGatewayError(c, err)
			return
		}
		quota, err = dripShopRefundAmount(quota, quote)
		if err == nil {
			cents, err = dripShopRefundAmount(cents, quote)
		}
		if err != nil {
			shopRefundGatewayError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"refundQuota": quota, "refundCents": cents, "priceCents": order.PriceCents,
	}})
}

func ProxyDripShopSubscription(c *gin.Context) {
	format, id := c.Param("format"), c.Param("id")
	if format != "clash" && format != "sub" && format != "json" || len(id) < 8 || len(id) > 128 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	for _, character := range id {
		if !(character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' || character == '-' || character == '_') {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
	}
	origin, err := url.Parse(os.Getenv("DRIP_ACCOUNT_ORIGIN"))
	if err != nil || origin == nil || origin.Scheme != "https" || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		c.AbortWithStatus(http.StatusBadGateway)
		return
	}
	origin.Path = "/api/subscription/" + format + "/" + id
	request, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, origin.String(), nil)
	if err != nil {
		c.AbortWithStatus(http.StatusBadGateway)
		return
	}
	request.Header.Set("Accept", "*/*")
	response, err := shopRefundHTTPClient.Do(request)
	if err != nil {
		c.AbortWithStatus(http.StatusBadGateway)
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		c.AbortWithStatus(response.StatusCode)
		return
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
	if err != nil || len(data) > 2*1024*1024 {
		c.AbortWithStatus(http.StatusBadGateway)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	if usage := response.Header.Get("Subscription-Userinfo"); len(usage) < 1024 {
		c.Header("Subscription-Userinfo", usage)
	}
	contentType := "text/plain; charset=utf-8"
	if format == "clash" {
		contentType = "text/yaml; charset=utf-8"
	} else if format == "json" {
		contentType = "application/json; charset=utf-8"
	}
	c.Data(http.StatusOK, contentType, data)
}
