package controller

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCreatorHomepageCombinesOnlyPublicEnabledCardsAndKeepsLegacyPlacements(t *testing.T) {
	identity := setupCreatorGitHubController(t)
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		c.Works = []service.CreatorWork{
			{ID: "visible", OwnerID: identity.UserID, Title: "Real project", Status: "published", Cover: "https://example.org/cover.jpg"},
			{ID: "draft", OwnerID: identity.UserID, Status: "draft"},
			{ID: "disabled", OwnerID: identity.UserID, Status: "published"},
			{ID: "private", OwnerID: identity.UserID, Status: "published", Settings: &service.CreatorSettings{Listed: false}},
		}
		c.HomeShowcase = &service.CreatorHomeShowcase{AutoAddWorks: true, Works: []service.CreatorHomeWorkSelection{{WorkID: "disabled", Enabled: false}}}
		return nil
	}))
	_, err := model.GetCreatorHomeConfig(model.DB)
	require.NoError(t, err)
	router := gin.New()
	router.GET("/api/creators/home", PublicCreatorHome)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/creators/home?view=cards", nil))
	require.Equal(t, 200, response.Code)
	var result struct {
		Data struct {
			Works  []service.CreatorWork
			Source string
		}
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.Len(t, result.Data.Works, 1)
	require.Equal(t, "visible", result.Data.Works[0].ID)
	require.Equal(t, "creator-center", result.Data.Source)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/creators/home", nil))
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.Empty(t, result.Data.Works, "legacy home must remain the separate paid placement list")
	require.NoError(t, model.DB.Model(&model.CreatorHomeConfig{}).Where("id = ?", 1).Update("gallery_enabled", false).Error)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/creators/home?view=cards", nil))
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.Empty(t, result.Data.Works)
}

func TestCreatorCoverThumbnailAndConditionalRequestRespectCurrentVisibility(t *testing.T) {
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	var data bytes.Buffer
	require.NoError(t, png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 1200, 600))))
	cover := "data:image/png;base64," + base64.StdEncoding.EncodeToString(data.Bytes())
	w := service.CreatorWork{ID: "project", OwnerID: 7, Status: "published", Cover: cover}
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		c.Members[7] = service.CreatorMember{UserID: 7, AcceptedAt: 1}
		c.Works = []service.CreatorWork{w}
		return nil
	}))
	route := gin.New()
	route.GET("/api/creators/public/:id/cover", PublicCreatorCover)
	address := service.CreatorCard(w).Cover
	response := httptest.NewRecorder()
	route.ServeHTTP(response, httptest.NewRequest("GET", address, nil))
	require.Equal(t, 200, response.Code)
	require.Equal(t, "image/jpeg", response.Header().Get("Content-Type"))
	require.Equal(t, "nosniff", response.Header().Get("X-Content-Type-Options"))
	cfg, _, err := image.DecodeConfig(bytes.NewReader(response.Body.Bytes()))
	require.NoError(t, err)
	require.Equal(t, 800, cfg.Width)
	require.Equal(t, 400, cfg.Height)
	etag := response.Header().Get("ETag")
	request := httptest.NewRequest("GET", address, nil)
	request.Header.Set("If-None-Match", etag)
	response = httptest.NewRecorder()
	route.ServeHTTP(response, request)
	require.Equal(t, 304, response.Code)
	for _, change := range []string{"draft", "unlisted", "suspended", "deleted", "replaced"} {
		t.Run(change, func(t *testing.T) {
			require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
				c.Members[7] = service.CreatorMember{UserID: 7, AcceptedAt: 1, Suspended: change == "suspended"}
				changed := w
				if change == "draft" {
					changed.Status = "draft"
				}
				if change == "unlisted" {
					changed.Settings = &service.CreatorSettings{Listed: false}
				}
				if change == "replaced" {
					changed.Cover = cover + "changed"
				}
				c.Works = []service.CreatorWork{changed}
				if change == "deleted" {
					c.Works = nil
				}
				return nil
			}))
			request := httptest.NewRequest("GET", address, nil)
			request.Header.Set("If-None-Match", etag)
			response := httptest.NewRecorder()
			route.ServeHTTP(response, request)
			require.Equal(t, 404, response.Code, "a conditional request must not bypass withdrawal")
		})
	}
}

func TestCreatorCoverRejectsMalformedAndMislabelledImage(t *testing.T) {
	var data bytes.Buffer
	require.NoError(t, png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 10, 10))))
	for _, value := range []string{"data:image/png;base64,invalid", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(data.Bytes())} {
		_, err := service.CreatorCoverThumbnail(value)
		require.Error(t, err)
	}
}

func TestCreatorCardsExcludeDetailMediaWithoutChangingLegacyResponse(t *testing.T) {
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	cover := "data:image/png;base64," + strings.Repeat("A", 200000)
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		c.Members[7] = service.CreatorMember{UserID: 7, AcceptedAt: 1}
		c.Works = []service.CreatorWork{{ID: "real-work", OwnerID: 7, Title: "Real project", Status: "published", Cover: cover, Images: []string{cover}, Description: "Full detail", Blocks: []service.CreatorBlock{{Text: "README"}}}}
		return nil
	}))
	router := gin.New()
	router.GET("/api/creators/public", PublicCreatorWorks)
	cards := httptest.NewRecorder()
	router.ServeHTTP(cards, httptest.NewRequest("GET", "/api/creators/public?view=cards", nil))
	require.Equal(t, 200, cards.Code)
	require.Less(t, cards.Body.Len(), 5000, "cards must not download embedded detail media")
	var response struct{ Data []service.CreatorWork }
	require.NoError(t, common.Unmarshal(cards.Body.Bytes(), &response))
	require.Len(t, response.Data, 1)
	require.Equal(t, "Real project", response.Data[0].Title)
	require.Contains(t, response.Data[0].Cover, "/api/creators/public/real-work/cover?v=")
	require.Empty(t, response.Data[0].Images)
	require.Empty(t, response.Data[0].Blocks)
	require.Empty(t, response.Data[0].Description)
	legacy := httptest.NewRecorder()
	router.ServeHTTP(legacy, httptest.NewRequest("GET", "/api/creators/public", nil))
	require.NoError(t, common.Unmarshal(legacy.Body.Bytes(), &response))
	require.Equal(t, cover, response.Data[0].Cover)
	require.Equal(t, "Full detail", response.Data[0].Description)
	require.Len(t, response.Data[0].Images, 1)
}
