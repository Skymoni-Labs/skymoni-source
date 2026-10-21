package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type userModelGroupRequest struct {
	Name       string    `json:"name"`
	ModelNames *[]string `json:"model_names"`
}

type userModelGroupResponse struct {
	ID         int      `json:"id"`
	Name       string   `json:"name"`
	ModelNames []string `json:"model_names"`
}

// User model groups organize the catalog only. Their names and membership do
// not participate in channel selection, API key permissions, or billing.
func userVisibleModelNames(userID int) (map[string]struct{}, error) {
	userGroup, err := model.GetUserGroup(userID, false)
	if err != nil {
		return nil, err
	}
	pricing := filterPricingByUsableGroups(model.GetPricing(), service.GetUserUsableGroups(userGroup))
	visible := make(map[string]struct{}, len(pricing))
	for _, item := range pricing {
		visible[item.ModelName] = struct{}{}
	}
	return visible, nil
}

func bindUserModelGroupRequest(c *gin.Context, visible map[string]struct{}) (string, []string, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
	var request userModelGroupRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请求格式无效"})
		return "", nil, false
	}
	name := strings.TrimSpace(request.Name)
	if name == "" || utf8.RuneCountInString(name) > 50 || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "分组名称需为 1 到 50 个字符，且不能包含控制字符"})
		return "", nil, false
	}
	if request.ModelNames == nil || len(*request.ModelNames) > model.MaxUserModelGroupModels {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "每个分组最多包含 100 个模型"})
		return "", nil, false
	}
	seen := make(map[string]struct{}, len(*request.ModelNames))
	for _, modelName := range *request.ModelNames {
		if _, ok := visible[modelName]; !ok {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "分组包含不可见或已停用的模型"})
			return "", nil, false
		}
		if _, duplicate := seen[modelName]; duplicate {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "分组中不能重复添加同一模型"})
			return "", nil, false
		}
		seen[modelName] = struct{}{}
	}
	return name, *request.ModelNames, true
}

func userModelGroupJSON(group *model.UserModelGroup, visible map[string]struct{}) (userModelGroupResponse, error) {
	names, err := group.GetModelNames()
	if err != nil {
		return userModelGroupResponse{}, err
	}
	filtered := make([]string, 0, len(names))
	for _, name := range names {
		if _, ok := visible[name]; ok {
			filtered = append(filtered, name)
		}
	}
	return userModelGroupResponse{ID: group.Id, Name: group.Name, ModelNames: filtered}, nil
}

func GetUserModelGroups(c *gin.Context) {
	userID := c.GetInt("id")
	visible, err := userVisibleModelNames(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法读取可用模型"})
		return
	}
	groups, err := model.GetUserModelGroups(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法读取个人分组"})
		return
	}
	data := make([]userModelGroupResponse, 0, len(groups))
	for i := range groups {
		item, err := userModelGroupJSON(&groups[i], visible)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "个人分组数据无效"})
			return
		}
		data = append(data, item)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

func CreateUserModelGroup(c *gin.Context) {
	userID := c.GetInt("id")
	visible, err := userVisibleModelNames(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法读取可用模型"})
		return
	}
	name, names, ok := bindUserModelGroupRequest(c, visible)
	if !ok {
		return
	}
	group, err := model.CreateUserModelGroup(userID, name, names)
	if err != nil {
		writeUserModelGroupError(c, err)
		return
	}
	item, err := userModelGroupJSON(group, visible)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法读取新分组"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": item})
}

func UpdateUserModelGroup(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "分组 ID 无效"})
		return
	}
	userID := c.GetInt("id")
	visible, err := userVisibleModelNames(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法读取可用模型"})
		return
	}
	name, names, ok := bindUserModelGroupRequest(c, visible)
	if !ok {
		return
	}
	group, err := model.UpdateUserModelGroup(userID, id, name, names)
	if err != nil {
		writeUserModelGroupError(c, err)
		return
	}
	item, err := userModelGroupJSON(group, visible)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法读取更新后的分组"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": item})
}

func DeleteUserModelGroup(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "分组 ID 无效"})
		return
	}
	if err := model.DeleteUserModelGroup(c.GetInt("id"), id); err != nil {
		writeUserModelGroupError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func writeUserModelGroupError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrUserModelGroupNotFound):
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "分组不存在"})
	case errors.Is(err, model.ErrUserModelGroupExists):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "已有同名分组"})
	case errors.Is(err, model.ErrUserModelGroupLimit):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "个人分组最多 50 个"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "个人分组操作失败"})
	}
}
