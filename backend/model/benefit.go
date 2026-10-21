package model

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var (
	ErrBenefitUnavailable = errors.New("资源或卡密不可用、已过期、次数用尽或不属于当前账号")
	ErrBenefitClaimed     = errors.New("当前账号已兑换过这张资源卡密，请在我的仓库查看")
	ErrBenefitStock       = errors.New("资源库存不足，请联系管理员")
	ErrBenefitKey         = errors.New("资源加密配置不可用，请联系管理员")
)

type BenefitField struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Kind  string `json:"kind"`
	Value string `json:"value"`
}

type BenefitConfig struct {
	ID                 string         `json:"id"`
	Name               string         `json:"name"`
	Summary            string         `json:"summary"`
	Category           string         `json:"category"`
	Tone               string         `json:"tone"`
	Format             string         `json:"format"`
	Instructions       string         `json:"instructions"`
	Fields             []BenefitField `json:"fields"`
	StockMode          string         `json:"stockMode"`
	ValidityDays       int            `json:"validityDays"`
	Enabled            bool           `json:"enabled"`
	AvailableInventory *int64         `json:"availableInventory,omitempty"`
}

type Benefit struct {
	ID        int    `gorm:"primaryKey"`
	Name      string `gorm:"type:varchar(80);not null"`
	Enabled   bool   `gorm:"not null"`
	StockMode string `gorm:"type:varchar(16);not null"`
	Encrypted string `gorm:"type:text;not null" json:"-"`
	Revision  int64  `gorm:"not null;default:1"`
	CreatedAt int64  `gorm:"not null"`
	UpdatedAt int64  `gorm:"not null"`
}

type BenefitInventory struct {
	ID        int    `gorm:"primaryKey"`
	BenefitID int    `gorm:"not null;index:idx_benefit_stock,priority:1"`
	Claimed   bool   `gorm:"not null;index:idx_benefit_stock,priority:2"`
	Encrypted string `gorm:"type:text;not null" json:"-"`
	CreatedAt int64  `gorm:"not null"`
	Disabled  bool   `gorm:"not null;default:false"`
	Removed   bool   `gorm:"not null;default:false"`
	Revision  int64  `gorm:"not null;default:1"`
	UpdatedAt int64  `gorm:"not null;default:0"`
}

type BenefitCode struct {
	ID           int    `json:"id" gorm:"primaryKey"`
	BenefitID    int    `json:"benefit_id" gorm:"not null;index"`
	Hash         string `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:idx_benefit_code_hash"`
	Encrypted    string `json:"-" gorm:"type:text;not null"`
	Mode         string `json:"mode" gorm:"type:varchar(16);not null"`
	Limit        int    `json:"limit" gorm:"not null"`
	Claimed      int    `json:"claimed" gorm:"not null"`
	TargetUserID int    `json:"target_user_id" gorm:"not null;default:0"`
	ExpiresAt    int64  `json:"expires_at" gorm:"not null"`
	Enabled      bool   `json:"enabled" gorm:"not null"`
	CreatedAt    int64  `json:"created_at" gorm:"not null"`
}

type BenefitReceipt struct {
	ID          int    `gorm:"primaryKey"`
	UserID      int    `gorm:"not null;uniqueIndex:idx_benefit_claim,priority:1;index:idx_benefit_owner,priority:1"`
	CodeID      int    `gorm:"not null;uniqueIndex:idx_benefit_claim,priority:2"`
	BenefitID   int    `gorm:"not null;index"`
	InventoryID int    `gorm:"not null"`
	Name        string `gorm:"type:varchar(80);not null"`
	Summary     string `gorm:"type:varchar(200);not null"`
	Category    string `gorm:"type:varchar(16);not null"`
	Tone        string `gorm:"type:varchar(16);not null"`
	Encrypted   string `gorm:"type:text;not null" json:"-"`
	ReceivedAt  int64  `gorm:"not null;index:idx_benefit_owner,priority:2"`
	ExpiresAt   int64  `gorm:"not null"`
}

// The independent key lives outside the database. GCM authenticates both the
// ciphertext and its purpose, preventing substitution between record types.
func benefitCipher() (cipher.AEAD, error) {
	key, err := base64.StdEncoding.DecodeString(os.Getenv("BENEFITS_ENCRYPTION_KEY"))
	if err != nil || len(key) != 32 {
		return nil, ErrBenefitKey
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, ErrBenefitKey
	}
	return cipher.NewGCM(block)
}

func encryptBenefit(value any, purpose string) (string, error) {
	aead, err := benefitCipher()
	if err != nil {
		return "", err
	}
	plain, err := common.Marshal(value)
	if err != nil {
		return "", err
	}
	if len(plain) > 42000 {
		return "", errors.New("资源内容过大")
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(aead.Seal(nonce, nonce, plain, []byte(purpose))), nil
}

func decryptBenefit(encrypted, purpose string, value any) error {
	aead, err := benefitCipher()
	if err != nil {
		return err
	}
	data, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil || len(data) < aead.NonceSize() {
		return ErrBenefitKey
	}
	plain, err := aead.Open(nil, data[:aead.NonceSize()], data[aead.NonceSize():], []byte(purpose))
	if err != nil {
		return ErrBenefitKey
	}
	return common.Unmarshal(plain, value)
}

func validateBenefitFields(fields []BenefitField, allowEmpty bool) error {
	if len(fields) < 1 || len(fields) > 20 {
		return errors.New("请配置 1–20 个资源字段")
	}
	seen := map[string]bool{}
	for _, f := range fields {
		if f.ID == "" || len(f.ID) > 80 || seen[f.ID] || strings.TrimSpace(f.Label) == "" || utf8.RuneCountInString(f.Label) > 80 || len(f.Value) > 4096 || !utf8.ValidString(f.Value) {
			return errors.New("资源字段无效、重复或过长")
		}
		seen[f.ID] = true
		if !slices.Contains([]string{"text", "secret", "link"}, f.Kind) {
			return errors.New("资源字段类型无效")
		}
		if !allowEmpty && strings.TrimSpace(f.Value) == "" {
			return errors.New("每个库存字段都需要填写内容")
		}
		if f.Kind == "link" && f.Value != "" {
			u, err := url.Parse(f.Value)
			if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
				return errors.New("网址字段必须是有效的 http 或 https 地址")
			}
		}
	}
	return nil
}

func ValidateBenefit(config *BenefitConfig) error {
	config.Name = strings.TrimSpace(config.Name)
	if config.Name == "" || utf8.RuneCountInString(config.Name) > 80 || utf8.RuneCountInString(config.Summary) > 200 || len(config.Instructions) > 12000 || !utf8.ValidString(config.Instructions) {
		return errors.New("资源名称、说明无效或过长")
	}
	if !slices.Contains([]string{"account", "license", "resource", "custom"}, config.Category) || !slices.Contains([]string{"violet", "sky", "amber"}, config.Tone) || !slices.Contains([]string{"markdown", "html"}, config.Format) || !slices.Contains([]string{"shared", "individual"}, config.StockMode) || config.ValidityDays < 0 || config.ValidityDays > 3650 {
		return errors.New("资源配置无效")
	}
	return validateBenefitFields(config.Fields, config.StockMode == "individual")
}

func GetBenefitConfig(id int) (BenefitConfig, error) {
	var row Benefit
	var config BenefitConfig
	if err := DB.First(&row, id).Error; err != nil {
		return config, err
	}
	if err := decryptBenefit(row.Encrypted, "config", &config); err != nil {
		return config, err
	}
	config.ID = strconv.Itoa(row.ID)
	config.Enabled = row.Enabled
	return config, nil
}

func SaveBenefit(id int, config BenefitConfig) (BenefitConfig, error) {
	if err := ValidateBenefit(&config); err != nil {
		return config, err
	}
	err := DB.Transaction(func(tx *gorm.DB) error { return saveBenefitTx(tx, id, &config) })
	return config, err
}

func saveBenefitTx(tx *gorm.DB, id int, value *BenefitConfig) error {
	config := *value
	defer func() { *value = config }()

	var row Benefit
	if id > 0 {
		if err := lockForUpdate(tx).First(&row, id).Error; err != nil {
			return err
		}
		if tx.Migrator().HasTable(&ShopOrder{}) {
			var pending int64
			if err := tx.Model(&ShopOrder{}).Where("benefit_id = ? AND status = ?", id, "pending").Count(&pending).Error; err != nil {
				return err
			}
			if pending > 0 {
				return errors.New("有待交付订单时不能更改资源，请先交付或退款")
			}
		}
		var previous BenefitConfig
		if err := decryptBenefit(row.Encrypted, "config", &previous); err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&BenefitInventory{}).Where("benefit_id = ? AND claimed = ?", id, false).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			compatible := previous.StockMode == config.StockMode && len(previous.Fields) == len(config.Fields)
			for i := range previous.Fields {
				if i >= len(config.Fields) || previous.Fields[i].ID != config.Fields[i].ID || previous.Fields[i].Kind != config.Fields[i].Kind {
					compatible = false
					break
				}
			}
			if !compatible {
				return errors.New("有未发放库存时不能更改字段结构或库存模式，请新建资源")
			}
		}
	}
	config.ID = strconv.Itoa(id)
	encrypted, err := encryptBenefit(config, "config")
	if err != nil {
		return err
	}
	now := time.Now().Unix()
	if id == 0 {
		row = Benefit{Name: config.Name, Enabled: config.Enabled, StockMode: config.StockMode, Encrypted: encrypted, Revision: 1, CreatedAt: now, UpdatedAt: now}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		config.ID = strconv.Itoa(row.ID)
		return nil
	}
	return tx.Model(&row).Updates(map[string]any{"name": config.Name, "enabled": config.Enabled, "stock_mode": config.StockMode, "encrypted": encrypted, "revision": gorm.Expr("revision + 1"), "updated_at": now}).Error
}

func ImportBenefitInventory(id int, items [][]BenefitField) error {
	if len(items) < 1 || len(items) > 500 {
		return errors.New("每次可导入 1–500 份库存")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var row Benefit
		var config BenefitConfig
		if err := lockForUpdate(tx).First(&row, id).Error; err != nil {
			return err
		}
		if row.StockMode != "individual" {
			return errors.New("共享资源不需要导入库存")
		}
		if err := decryptBenefit(row.Encrypted, "config", &config); err != nil {
			return err
		}
		rows := make([]BenefitInventory, 0, len(items))
		identities, err := benefitInventoryIdentities(tx, id, config.Category, 0)
		if err != nil {
			return err
		}
		for _, fields := range items {
			if err := validateBenefitFields(fields, false); err != nil {
				return err
			}
			if len(fields) != len(config.Fields) {
				return errors.New("库存字段与资源定义不匹配")
			}
			for i := range fields {
				if fields[i].ID != config.Fields[i].ID || fields[i].Kind != config.Fields[i].Kind {
					return errors.New("库存字段与资源定义不匹配")
				}
				fields[i].Label = config.Fields[i].Label
			}
			identity := benefitInventoryIdentity(fields, config.Category)
			if identities[identity] {
				return ErrInventoryDuplicate
			}
			identities[identity] = true
			encrypted, err := encryptBenefit(fields, "stock")
			if err != nil {
				return err
			}
			rows = append(rows, BenefitInventory{BenefitID: id, Encrypted: encrypted, Revision: 1, CreatedAt: time.Now().Unix(), UpdatedAt: time.Now().Unix()})
		}
		return tx.CreateInBatches(rows, 50).Error
	})
}

type BenefitCodeRequest struct {
	BenefitID    int    `json:"benefit_id"`
	Count        int    `json:"count"`
	Mode         string `json:"mode"`
	Limit        int    `json:"limit"`
	TargetUserID int    `json:"target_user_id"`
	ExpiresAt    int64  `json:"expires_at"`
}

func GenerateBenefitCodes(request BenefitCodeRequest) ([]BenefitCode, error) {
	if request.Count < 1 || request.Count > 100 || !slices.Contains([]string{"single", "campaign"}, request.Mode) || request.Limit < 0 || request.Limit > 1000000 || request.TargetUserID < 0 || (request.ExpiresAt != 0 && request.ExpiresAt <= time.Now().Unix()) {
		return nil, errors.New("卡密配置无效")
	}
	if request.Mode == "single" {
		request.Limit = 1
	}
	if request.TargetUserID > 0 {
		if _, err := GetUserById(request.TargetUserID, false); err != nil {
			return nil, errors.New("指定用户不存在")
		}
	}
	var benefit Benefit
	if err := DB.First(&benefit, request.BenefitID).Error; err != nil {
		return nil, err
	}
	rows := make([]BenefitCode, 0, request.Count)
	for range request.Count {
		data := make([]byte, 16)
		if _, err := rand.Read(data); err != nil {
			return nil, err
		}
		code := "GIFT-" + base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(data)
		encrypted, err := encryptBenefit(code, "code")
		if err != nil {
			return nil, err
		}
		rows = append(rows, BenefitCode{BenefitID: request.BenefitID, Hash: benefitCodeHash(code), Encrypted: encrypted, Mode: request.Mode, Limit: request.Limit, TargetUserID: request.TargetUserID, ExpiresAt: request.ExpiresAt, Enabled: true, CreatedAt: time.Now().Unix()})
	}
	return rows, DB.Transaction(func(tx *gorm.DB) error { return tx.Create(&rows).Error })
}

func benefitCodeHash(code string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(code)))
	return hex.EncodeToString(sum[:])
}

func BenefitCodeValue(code BenefitCode) (string, error) {
	var value string
	err := decryptBenefit(code.Encrypted, "code", &value)
	return value, err
}

func ValidatePopupBenefit(id int, audience string, userID int) error {
	if id == 0 {
		return nil
	}
	var code BenefitCode
	if err := DB.First(&code, id).Error; err != nil {
		return errors.New("关联资源卡密不存在")
	}
	if code.TargetUserID > 0 && (audience != "user" || userID != code.TargetUserID) {
		return errors.New("定向卡密必须关联到同一用户的弹窗")
	}
	return nil
}

// All stock assignment, per-user uniqueness and total campaign usage are in
// one transaction. Conditional writes also protect SQLite, which has no FOR UPDATE.
func claimBenefit(tx *gorm.DB, userID, codeID int, now int64) (BenefitReceipt, error) {
	var receipt BenefitReceipt
	var code BenefitCode
	if err := lockForUpdate(tx).First(&code, codeID).Error; err != nil {
		return receipt, ErrBenefitUnavailable
	}
	if !code.Enabled || (code.ExpiresAt > 0 && code.ExpiresAt <= now) || (code.TargetUserID > 0 && code.TargetUserID != userID) {
		return receipt, ErrBenefitUnavailable
	}
	var previous BenefitReceipt
	if err := tx.Where("user_id = ? AND code_id = ?", userID, code.ID).Limit(1).Find(&previous).Error; err != nil {
		return receipt, err
	}
	if previous.ID > 0 {
		return receipt, ErrBenefitClaimed
	}
	if code.Limit > 0 && code.Claimed >= code.Limit {
		return receipt, ErrBenefitUnavailable
	}
	config, stockID, err := allocateBenefitStock(tx, code.BenefitID)
	if err != nil {
		return receipt, err
	}

	result := tx.Model(&code).Where("enabled = ?", true)
	if code.Limit > 0 {
		result = result.Where("claimed < ?", code.Limit)
	}
	result = result.Update("claimed", gorm.Expr("claimed + 1"))
	if result.Error != nil {
		return receipt, result.Error
	}
	if result.RowsAffected != 1 {
		return receipt, ErrBenefitUnavailable
	}
	encrypted, err := encryptBenefit(config, "receipt")
	if err != nil {
		return receipt, err
	}
	receipt = BenefitReceipt{UserID: userID, CodeID: code.ID, BenefitID: code.BenefitID, InventoryID: stockID, Name: config.Name, Summary: config.Summary, Category: config.Category, Tone: config.Tone, Encrypted: encrypted, ReceivedAt: now}
	if config.ValidityDays > 0 {
		receipt.ExpiresAt = now + int64(config.ValidityDays)*86400
	}
	if err := tx.Create(&receipt).Error; err != nil {
		return receipt, err
	}
	return receipt, nil
}

func RedeemBenefit(userID int, code string) (BenefitReceipt, error) {
	var receipt BenefitReceipt
	if userID <= 0 || len(code) > 100 || strings.TrimSpace(code) == "" {
		return receipt, ErrBenefitUnavailable
	}
	var row BenefitCode
	if err := DB.Select("id").Where("hash = ?", benefitCodeHash(code)).First(&row).Error; err != nil {
		return receipt, ErrBenefitUnavailable
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		receipt, err = claimBenefit(tx, userID, row.ID, time.Now().Unix())
		return err
	})
	return receipt, err
}

func RedeemPopupBenefit(userID, noticeID int, revision int64) (BenefitReceipt, error) {
	var receipt BenefitReceipt
	err := DB.Transaction(func(tx *gorm.DB) error {
		var notice PopupNotice
		if err := lockForUpdate(tx).First(&notice, noticeID).Error; err != nil {
			return ErrBenefitUnavailable
		}
		now := time.Now().Unix()
		if userID <= 0 || notice.Status != "published" || notice.Revision != revision || notice.BenefitCodeID <= 0 || notice.StartAt > now || (notice.EndAt > 0 && notice.EndAt <= now) || (notice.Audience != "all_users" && !(notice.Audience == "user" && notice.TargetUserId == userID)) {
			return ErrBenefitUnavailable
		}
		var err error
		receipt, err = claimBenefit(tx, userID, notice.BenefitCodeID, now)
		return err
	})
	return receipt, err
}

type BenefitWarehouseItem struct {
	ID         string         `json:"id"`
	Benefit    BenefitConfig  `json:"benefit"`
	Fields     []BenefitField `json:"fields"`
	Received   string         `json:"received"`
	Expires    string         `json:"expires"`
	Status     string         `json:"status"`
	SourceCode string         `json:"sourceCode"`
	UserID     int            `json:"userId,omitempty"`
}

func BenefitWarehouseView(receipt BenefitReceipt, detail bool) (BenefitWarehouseItem, error) {
	config := BenefitConfig{ID: strconv.Itoa(receipt.BenefitID), Name: receipt.Name, Summary: receipt.Summary, Category: receipt.Category, Tone: receipt.Tone, Fields: []BenefitField{}}
	if detail {
		if err := decryptBenefit(receipt.Encrypted, "receipt", &config); err != nil {
			return BenefitWarehouseItem{}, err
		}
		// Delivery credentials and entitlements stay in the receipt snapshot.
		// Instructions follow the resource so edits also reach existing recipients.
		var resource Benefit
		err := DB.Select("encrypted").First(&resource, receipt.BenefitID).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return BenefitWarehouseItem{}, err
		}
		if err == nil {
			var current BenefitConfig
			if err := decryptBenefit(resource.Encrypted, "config", &current); err != nil {
				return BenefitWarehouseItem{}, err
			}
			config.Instructions, config.Format = current.Instructions, current.Format
		}
	}
	if receipt.CodeID < 0 {
		var order ShopOrder
		err := DB.Where("id = ? AND receipt_id = ? AND user_id = ?", -receipt.CodeID, receipt.ID, receipt.UserID).First(&order).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return BenefitWarehouseItem{}, err
		}
		if err == nil && order.DripGenerated {
			if err := applyDripReceiptPlan(&config, order, detail); err != nil {
				return BenefitWarehouseItem{}, err
			}
		}
	}
	item := BenefitWarehouseItem{ID: strconv.Itoa(receipt.ID), Benefit: config, Fields: config.Fields, Received: time.Unix(receipt.ReceivedAt, 0).UTC().Format(time.RFC3339), Status: "active", SourceCode: fmt.Sprintf("#%d", receipt.CodeID)}
	if receipt.CodeID < 0 {
		item.SourceCode = fmt.Sprintf("shop:%d", -receipt.CodeID)
	}
	if receipt.ExpiresAt > 0 {
		item.Expires = time.Unix(receipt.ExpiresAt, 0).UTC().Format(time.RFC3339)
		if receipt.ExpiresAt <= time.Now().Unix() {
			item.Status = "expired"
		}
	}
	return item, nil
}

func GetBenefitWarehouseDetail(id, userID int) (BenefitWarehouseItem, error) {
	var row BenefitReceipt
	if err := DB.Where("id = ? AND user_id = ?", id, userID).First(&row).Error; err != nil {
		return BenefitWarehouseItem{}, err
	}
	return BenefitWarehouseView(row, true)
}

func allocateBenefitStock(tx *gorm.DB, benefitID int) (BenefitConfig, int, error) {
	var benefit Benefit
	var config BenefitConfig
	if err := lockForUpdate(tx).First(&benefit, benefitID).Error; err != nil {
		return config, 0, ErrBenefitUnavailable
	}
	if !benefit.Enabled {
		return config, 0, ErrBenefitUnavailable
	}
	if err := decryptBenefit(benefit.Encrypted, "config", &config); err != nil {
		return config, 0, err
	}
	config.ID = strconv.Itoa(benefit.ID)
	config.Enabled = benefit.Enabled
	var stockID int
	if benefit.StockMode == "individual" {
		var stock BenefitInventory
		if err := lockForUpdate(tx).Where("benefit_id = ? AND claimed = ? AND disabled = ? AND removed = ?", benefit.ID, false, false, false).Order("id").First(&stock).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return config, 0, ErrBenefitStock
			}
			return config, 0, err
		}
		if err := decryptBenefit(stock.Encrypted, "stock", &config.Fields); err != nil {
			return config, 0, err
		}
		// Labels may have changed since the stock was imported.
		var current BenefitConfig
		if err := decryptBenefit(benefit.Encrypted, "config", &current); err != nil {
			return config, 0, err
		}
		for i := range config.Fields {
			config.Fields[i].Label = current.Fields[i].Label
		}
		result := tx.Model(&stock).Where("claimed = ? AND disabled = ? AND removed = ?", false, false, false).Updates(map[string]any{"claimed": true, "revision": gorm.Expr("revision + 1"), "updated_at": time.Now().Unix()})
		if result.Error != nil {
			return config, 0, result.Error
		}
		if result.RowsAffected != 1 {
			return config, 0, ErrBenefitStock
		}
		stockID = stock.ID
	}
	return config, stockID, nil
}
