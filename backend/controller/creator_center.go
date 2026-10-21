package controller

import (
	"errors"
	"gorm.io/gorm"
	"io"
	"mime"
	"net/http"
	"os"
	"slices"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func creatorError(c *gin.Context, err error) {
	status, message := 500, "创作者中心操作失败，请重试"
	switch {
	case errors.Is(err, service.ErrCreatorApplicationsClosed):
		status, message = 403, err.Error()
	case errors.Is(err, service.ErrCreatorHomeStorage):
		status, message = 413, err.Error()
	case errors.Is(err, model.ErrCreatorHomeBalance):
		status, message = 402, err.Error()
	case errors.Is(err, model.ErrCreatorHomeConflict):
		status, message = 409, err.Error()
	case errors.Is(err, model.ErrCreatorHomeInvalid):
		status, message = 400, err.Error()
	case errors.Is(err, service.ErrCreatorForbidden):
		status, message = 403, "请先开通创作者身份，只能管理自己的内容"
	case errors.Is(err, service.ErrCreatorInvalid):
		status, message = 400, "请检查内容、链接、文件格式及必填项"
	case errors.Is(err, service.ErrCreatorConflict):
		status, message = 409, "内容已更新或文件仍被使用，请刷新后重试"
	case errors.Is(err, service.ErrSoftwareStorageFull):
		status, message = 413, "文件需为 20 MB 以内；个人附件空间 100 MB，站点空间不足时暂不可上传"
	case errors.Is(err, os.ErrNotExist):
		status, message = 404, "内容不存在或尚未公开"
	}
	c.JSON(status, gin.H{"success": false, "message": message})
}
func creatorDecode(c *gin.Context, target any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8*1024*1024)
	if err := common.DecodeJson(c.Request.Body, target); err != nil {
		creatorError(c, service.ErrCreatorInvalid)
		return false
	}
	return true
}
func PublicCreatorWorks(c *gin.Context) {
	works := []service.CreatorWork{}
	var showcase service.CreatorShowcase
	err := service.WithCreatorCatalog(false, func(data *service.CreatorCatalog) error {
		showcase = service.CreatorPublicShowcase(data)
		for _, w := range data.Works {
			if service.CreatorPublic(data, w) {
				w = service.CreatorWorkIdentity(data, w)
				w.Revision = ""
				w.ReviewNote = ""
				if c.Query("view") == "cards" {
					w = service.CreatorCard(w)
				}
				works = append(works, w)
			}
		}
		return nil
	})
	if err != nil {
		creatorError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": works, "showcase": showcase})
}
func PublicCreatorCover(c *gin.Context) {
	source, err := service.CreatorCoverSource(c.Param("id"), c.Query("v"))
	if err != nil {
		creatorError(c, err)
		return
	}
	etag := `"thumb-v1-` + c.Query("v") + `"`
	c.Header("Cache-Control", "public, max-age=0, must-revalidate")
	c.Header("ETag", etag)
	c.Header("X-Content-Type-Options", "nosniff")
	if c.GetHeader("If-None-Match") == etag {
		c.Status(http.StatusNotModified)
		return
	}
	image, err := service.CreatorCoverThumbnail(source)
	if err != nil {
		c.Header("Cache-Control", "no-store")
		creatorError(c, err)
		return
	}
	c.Data(http.StatusOK, "image/jpeg", image)
}
func PublicCreatorWork(c *gin.Context) {
	var work service.CreatorWork
	releases := []service.CreatorRelease{}
	err := service.WithCreatorCatalog(false, func(data *service.CreatorCatalog) error {
		for _, w := range data.Works {
			if w.ID == c.Param("id") && service.CreatorPublic(data, w) {
				work = service.CreatorWorkIdentity(data, w)
				work.Revision = ""
				work.ReviewNote = ""
				for _, r := range data.Releases {
					if r.ProjectID == w.ID && r.Status == "published" {
						r.Revision = ""
						r.ReviewNote = ""
						releases = append(releases, r)
					}
				}
				return nil
			}
		}
		return os.ErrNotExist
	})
	if err != nil {
		creatorError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"work": work, "releases": releases}})
}
func CreatorMe(c *gin.Context) {
	uid := c.GetInt("id")
	eligible, err := model.HasCreatorRecharge(uid)
	if err != nil {
		creatorError(c, err)
		return
	}
	mode := "member"
	if eligible {
		mode = "eligible"
	}
	var member service.CreatorMember
	works := []service.CreatorWork{}
	releases := []service.CreatorRelease{}
	files := []service.CreatorFile{}
	autoApproveWorks := false
	manuallyGranted := false
	err = service.WithCreatorCatalog(false, func(data *service.CreatorCatalog) error {
		autoApproveWorks = data.ReviewPolicy.AutoApproveWorks
		if m, ok := data.Members[uid]; ok {
			member = m
			manuallyGranted = m.GrantedAt > 0
			if manuallyGranted && !m.Suspended {
				mode = "eligible"
			}
			if service.CreatorActive(data, uid) {
				mode = "creator"
			}
		}
		if mode == "creator" {
			for _, w := range data.Works {
				if w.OwnerID == uid {
					works = append(works, service.CreatorWorkIdentity(data, w))
				}
			}
			for _, r := range data.Releases {
				if r.OwnerID == uid {
					releases = append(releases, r)
				}
			}
			for _, f := range data.Files {
				if f.OwnerID == uid {
					files = append(files, f)
				}
			}
		}
		return nil
	})
	if err != nil {
		creatorError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"mode": mode, "manuallyGranted": manuallyGranted, "suspended": member.Suspended, "member": member, "works": works, "releases": releases, "files": files, "termsVersion": service.CreatorTermsVersion, "autoApproveWorks": autoApproveWorks}})
}

func AdminCreatorReviewPolicy(c *gin.Context) {
	var body struct {
		AutoApproveWorks *bool  `json:"autoApproveWorks"`
		Revision         string `json:"revision"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if body.AutoApproveWorks == nil || body.Revision == "" {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	policy, err := service.SaveCreatorReviewPolicy(*body.AutoApproveWorks, body.Revision)
	if err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.review-policy", map[string]any{"auto_approve_works": policy.AutoApproveWorks})
	c.JSON(200, gin.H{"success": true, "data": policy})
}
func AdminGrantCreator(c *gin.Context) {
	uid, err := strconv.Atoi(c.Param("id"))
	if err != nil || uid <= 0 {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	target, err := model.GetUserById(uid, false)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		creatorError(c, os.ErrNotExist)
		return
	}
	if err != nil {
		creatorError(c, err)
		return
	}
	if target.Status != common.UserStatusEnabled {
		creatorError(c, service.ErrCreatorForbidden)
		return
	}
	status, changed, err := service.GrantCreator(uid, c.GetInt("id"))
	if err != nil {
		creatorError(c, err)
		return
	}
	if changed {
		recordManageAudit(c, "creator.admin.grant", map[string]any{"target_user_id": uid, "status": status})
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"status": status}})
}

type creatorUserListItem struct {
	*model.User
	CreatorStatus string `json:"creator_status"`
}

func creatorUserList(users []*model.User) ([]creatorUserListItem, error) {
	items := make([]creatorUserListItem, 0, len(users))
	err := service.WithCreatorCatalog(false, func(data *service.CreatorCatalog) error {
		for _, user := range users {
			items = append(items, creatorUserListItem{User: user, CreatorStatus: service.CreatorMemberStatus(data, user.Id)})
		}
		return nil
	})
	return items, err
}

func CreatorApply(c *gin.Context) {
	var body struct {
		Name         string `json:"name"`
		Bio          string `json:"bio"`
		Direction    string `json:"direction"`
		TermsVersion string `json:"termsVersion"`
		Accepted     bool   `json:"accepted"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if !body.Accepted {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	uid := c.GetInt("id")
	eligible, err := model.HasCreatorRecharge(uid)
	if err != nil {
		creatorError(c, err)
		return
	}
	profile := service.CreatorProfile{Name: body.Name, Bio: body.Bio, Handle: "creator-" + common.GetUUID()[:12]}
	if err = service.ActivateCreator(uid, profile, body.Direction, body.TermsVersion, eligible); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.activate", map[string]any{"terms": body.TermsVersion})
	CreatorMe(c)
}
func CreatorSaveProfile(c *gin.Context) {
	var body struct {
		Profile service.CreatorProfile `json:"profile"`
		Pinned  []string               `json:"pinned"`
		Saved   []string               `json:"saved"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if err := service.SaveCreatorProfile(c.GetInt("id"), body.Profile, body.Pinned, body.Saved); err != nil {
		creatorError(c, err)
		return
	}
	CreatorMe(c)
}
func CreatorSaveWork(c *gin.Context) {
	var work service.CreatorWork
	if !creatorDecode(c, &work) {
		return
	}
	if work.ID != c.Param("id") {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	work, err := service.SaveCreatorWork(c.GetInt("id"), work)
	if err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.project.save", map[string]any{"project_id": work.ID, "status": work.Status})
	c.JSON(200, gin.H{"success": true, "data": work})
}
func CreatorDeleteWork(c *gin.Context) {
	var body struct {
		Revision string `json:"revision"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if err := service.DeleteCreatorWork(c.GetInt("id"), c.Param("id"), body.Revision); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.project.delete", map[string]any{"project_id": c.Param("id")})
	c.JSON(200, gin.H{"success": true})
}
func CreatorSaveRelease(c *gin.Context) {
	var release service.CreatorRelease
	if !creatorDecode(c, &release) {
		return
	}
	if release.ID != c.Param("id") {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	release, err := service.SaveCreatorRelease(c.GetInt("id"), release)
	if err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.release.save", map[string]any{"release_id": release.ID, "status": release.Status})
	c.JSON(200, gin.H{"success": true, "data": release})
}
func CreatorUpload(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.CreatorUploadLimit+64*1024)
	reader, err := c.Request.MultipartReader()
	if err != nil {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	part, err := reader.NextPart()
	if err != nil || part.FormName() != "file" || part.FileName() == "" {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	defer part.Close()
	_, params, err := mime.ParseMediaType(part.Header.Get("Content-Disposition"))
	if err != nil {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	file, err := service.StoreCreatorFile(c.GetInt("id"), params["filename"], part)
	if err != nil {
		creatorError(c, err)
		return
	}
	if _, err = reader.NextPart(); err != io.EOF {
		_ = service.DeleteCreatorFile(c.GetInt("id"), file.ID)
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": file})
}
func CreatorDeleteFile(c *gin.Context) {
	if err := service.DeleteCreatorFile(c.GetInt("id"), c.Param("id")); err != nil {
		creatorError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true})
}
func CreatorDownload(c *gin.Context) {
	var file service.CreatorFile
	err := service.WithCreatorCatalog(false, func(data *service.CreatorCatalog) error {
		i := slices.IndexFunc(data.Files, func(f service.CreatorFile) bool { return f.ID == c.Param("id") })
		if i < 0 {
			return os.ErrNotExist
		}
		file = data.Files[i]
		if c.GetInt("role") >= common.RoleRootUser || (c.GetInt("id") == file.OwnerID && service.CreatorActive(data, file.OwnerID)) {
			return nil
		}
		for _, w := range data.Works {
			if !service.CreatorPublic(data, w) {
				continue
			}
			if w.Attachment != nil && w.Attachment.ID == file.ID && (w.Settings == nil || w.Settings.ShowFiles) {
				return nil
			}
			for _, r := range data.Releases {
				if r.ProjectID == w.ID && r.Status == "published" && r.Package != nil && r.Package.ID == file.ID {
					return nil
				}
			}
		}
		return os.ErrNotExist
	})
	if err != nil {
		creatorError(c, err)
		return
	}
	c.Header("Content-Type", "application/octet-stream")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "sandbox")
	c.Header("Cache-Control", "private, no-store")
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": file.Name}))
	c.File(service.CreatorFilePath(file.ID))
}
func AdminCreatorCatalog(c *gin.Context) {
	err := service.WithCreatorCatalog(false, func(data *service.CreatorCatalog) error {
		c.JSON(200, gin.H{"success": true, "data": data})
		return nil
	})
	if err != nil {
		creatorError(c, err)
	}
}
func AdminCreatorReview(c *gin.Context) {
	var body struct {
		Revision string `json:"revision"`
		Decision string `json:"decision"`
		Note     string `json:"note"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if err := service.ReviewCreatorContent(c.Param("kind"), c.Param("id"), body.Revision, body.Decision, body.Note); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.review", map[string]any{"kind": c.Param("kind"), "id": c.Param("id"), "decision": body.Decision})
	AdminCreatorCatalog(c)
}
