package common

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"regexp"
)

const AdminMailImageMaxBytes = 5 * 1024 * 1024
const AdminMailImageURLPrefix = "https://skymoni.com/api/admin-mail-images/"

var AdminMailImageName = regexp.MustCompile(`^[a-f0-9]{64}\.(png|jpg|gif)$`)

func adminMailImageDir() string {
	if root := os.Getenv("ADMIN_MAIL_IMAGE_DIR"); root != "" {
		return root
	}
	return "/data/admin-mail-images"
}

func SaveAdminMailImage(data []byte) (string, error) {
	if len(data) == 0 || len(data) > AdminMailImageMaxBytes {
		return "", fmt.Errorf("图片大小须在 5 MiB 以内")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	extensions := map[string]string{"png": "png", "jpeg": "jpg", "gif": "gif"}
	ext := extensions[format]
	if err != nil || ext == "" || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 16000000 {
		return "", fmt.Errorf("请选择有效的 PNG、JPEG 或 GIF 图片，像素总数不超过 1600 万")
	}
	name := fmt.Sprintf("%x.%s", sha256.Sum256(data), ext)
	if err := os.MkdirAll(adminMailImageDir(), 0700); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(adminMailImageDir(), ".upload-")
	if err != nil {
		return "", err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err != nil {
		f.Close()
		return "", err
	}
	if err = f.Close(); err != nil {
		return "", err
	}
	if err = os.Rename(f.Name(), filepath.Join(adminMailImageDir(), name)); err != nil {
		return "", err
	}
	return name, nil
}

func ReadAdminMailImage(name string) ([]byte, string, error) {
	if !AdminMailImageName.MatchString(name) {
		return nil, "", os.ErrNotExist
	}
	data, err := os.ReadFile(filepath.Join(adminMailImageDir(), name))
	if err != nil {
		return nil, "", err
	}
	if len(data) > AdminMailImageMaxBytes {
		return nil, "", fmt.Errorf("image exceeds size limit")
	}
	ext := filepath.Ext(name)
	mime := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif"}[ext]
	return data, mime, nil
}
