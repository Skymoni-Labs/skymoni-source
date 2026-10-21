package model

import "sort"

// GetMissingModels returns model names that are referenced in the system
func GetMissingModels() ([]string, error) {
	// 1. 获取所有已启用模型（去重）
	// Admin metadata synchronization must see unpublished channel models too.
	// Public model lists already apply catalog visibility and cannot be used
	// to discover records that have not yet been published.
	configured, err := GetConfiguredModelChannels()
	if err != nil {
		return nil, err
	}
	models := make([]string, 0, len(configured))
	for name := range configured {
		models = append(models, name)
	}
	sort.Strings(models)
	if len(models) == 0 {
		return []string{}, nil
	}

	// 2. 查询已有的元数据模型名
	var existing []string
	if err := DB.Model(&Model{}).Where("model_name IN ?", models).Pluck("model_name", &existing).Error; err != nil {
		return nil, err
	}

	existingSet := make(map[string]struct{}, len(existing))
	for _, e := range existing {
		existingSet[e] = struct{}{}
	}

	// 3. 收集缺失模型
	var missing []string
	for _, name := range models {
		if _, ok := existingSet[name]; !ok {
			missing = append(missing, name)
		}
	}
	return missing, nil
}
