package model

// IsModelPublished uses the same metadata precedence as the public catalog.
// Read the policy at request time so hiding/deleting a model immediately stops
// new requests on every node, independently of channel and pricing caches.
func IsModelPublished(name string) (bool, error) {
	var records []Model
	if err := DB.Select("id", "model_name", "status", "name_rule").Find(&records).Error; err != nil {
		return false, err
	}
	metadata := resolveModelMetadata(records, []string{name})[name]
	return metadata != nil && metadata.Status == 1, nil
}
