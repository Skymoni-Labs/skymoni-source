package controller

import (
	"bytes"
	"context"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

var errShopVoucherUsed = errors.New("兑换码已兑换或无法核验，不能自动退额度；请人工处理")
var errShopRefundGateway = errors.New("兑换码核验服务暂不可用，未退回额度；请稍后重试")

var shopRefundHTTPClient = &http.Client{
	Timeout:       10 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

func revokeUnusedShopVoucher(ctx context.Context, codeHash string) error {
	secret := os.Getenv("DRIP_SHOP_REFUND_SECRET")
	origin, err := url.Parse(os.Getenv("DRIP_ACCOUNT_ORIGIN"))
	if len(secret) < 32 || err != nil || origin == nil || origin.Scheme != "https" || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" || len(codeHash) != 64 {
		return errShopRefundGateway
	}
	target := *origin
	target.Path = "/api/internal/shop/revoke-unused"
	body, _ := common.Marshal(map[string]string{"codeHash": codeHash})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, target.String(), bytes.NewReader(body))
	if err != nil {
		return errShopRefundGateway
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Drip-Shop-Refund-Secret", secret)
	response, err := shopRefundHTTPClient.Do(request)
	if err != nil {
		return errShopRefundGateway
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusConflict {
		return errShopVoucherUsed
	}
	if response.StatusCode != http.StatusOK {
		return errShopRefundGateway
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 2049))
	if err != nil || len(data) > 2048 {
		return errShopRefundGateway
	}
	var result struct {
		OK      bool `json:"ok"`
		Revoked bool `json:"revoked"`
	}
	if err := common.Unmarshal(data, &result); err != nil || !result.OK || !result.Revoked {
		return errShopRefundGateway
	}
	return nil
}

type dripShopQuote struct {
	FlowRemaining   int64 `json:"flowRemaining"`
	FlowTotal       int64 `json:"flowTotal"`
	TimeRemaining   int64 `json:"timeRemaining"`
	TimeTotal       int64 `json:"timeTotal"`
	AlreadyRefunded bool  `json:"alreadyRefunded"`
}

func dripShopCall(ctx context.Context, endpoint, secretName, header string, requestBody any, responseBody any) error {
	secret := os.Getenv(secretName)
	origin, err := url.Parse(os.Getenv("DRIP_ACCOUNT_ORIGIN"))
	if len(secret) < 32 || err != nil || origin == nil || origin.Scheme != "https" || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		return errShopRefundGateway
	}
	target := *origin
	target.Path = endpoint
	body, err := common.Marshal(requestBody)
	if err != nil {
		return errShopRefundGateway
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, target.String(), bytes.NewReader(body))
	if err != nil {
		return errShopRefundGateway
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(header, secret)
	response, err := shopRefundHTTPClient.Do(request)
	if err != nil {
		return errShopRefundGateway
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusConflict {
		return errShopVoucherUsed
	}
	if response.StatusCode != http.StatusOK {
		return errShopRefundGateway
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 4097))
	if err != nil || len(data) > 4096 {
		return errShopRefundGateway
	}
	if err := common.Unmarshal(data, responseBody); err != nil {
		return errShopRefundGateway
	}
	return nil
}

func dripShopRefund(ctx context.Context, orderID int, codeHash string, generated, commit bool) (dripShopQuote, error) {
	endpoint := "/api/internal/shop/refund-quote"
	if commit {
		endpoint = "/api/internal/shop/refund"
	}
	var response struct {
		OK bool `json:"ok"`
		dripShopQuote
	}
	err := dripShopCall(ctx, endpoint, "DRIP_SHOP_REFUND_SECRET", "X-Drip-Shop-Refund-Secret",
		map[string]any{"orderId": orderID, "codeHash": codeHash, "generated": generated}, &response)
	if err != nil {
		return dripShopQuote{}, err
	}
	quote := response.dripShopQuote
	if !response.OK || quote.FlowTotal <= 0 || quote.TimeTotal <= 0 || quote.FlowRemaining < 0 || quote.FlowRemaining > quote.FlowTotal || quote.TimeRemaining < 0 || quote.TimeRemaining > quote.TimeTotal {
		return dripShopQuote{}, errShopRefundGateway
	}
	return quote, nil
}

func dripShopRefundAmount(total int64, quote dripShopQuote) (int64, error) {
	if total < 0 || quote.FlowTotal <= 0 || quote.TimeTotal <= 0 || quote.FlowRemaining < 0 || quote.TimeRemaining < 0 || quote.FlowRemaining > quote.FlowTotal || quote.TimeRemaining > quote.TimeTotal {
		return 0, errShopRefundGateway
	}
	numerator := new(big.Int).SetInt64(total)
	numerator.Mul(numerator, big.NewInt(quote.FlowRemaining))
	numerator.Mul(numerator, big.NewInt(quote.TimeRemaining))
	denominator := new(big.Int).Mul(big.NewInt(quote.FlowTotal), big.NewInt(quote.TimeTotal))
	numerator.Div(numerator, denominator)
	if !numerator.IsInt64() {
		return 0, errShopRefundGateway
	}
	return numerator.Int64(), nil
}

func shopRefundGatewayError(c *gin.Context, err error) {
	status := http.StatusBadGateway
	if errors.Is(err, errShopVoucherUsed) {
		status = http.StatusConflict
	}
	c.JSON(status, gin.H{"success": false, "message": strings.TrimSpace(err.Error())})
}
