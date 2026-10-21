package model

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	sqlitedriver "github.com/glebarez/go-sqlite"
	"github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

// RedemptionClaim survives code deletion so an account cannot claim twice.
type RedemptionClaim struct {
	Id           int   `json:"id" gorm:"primaryKey"`
	RedemptionId int   `json:"redemption_id" gorm:"uniqueIndex:idx_redemption_account"`
	UserId       int   `json:"user_id" gorm:"uniqueIndex:idx_redemption_account"`
	Quota        int   `json:"quota"`
	CreatedTime  int64 `json:"created_time"`
}

var ErrRedemptionAlreadyClaimed = errors.New("该账号已经领取过此兑换码")
var ErrRedemptionLimitReached = errors.New("此福利码已达到领取人数上限")
var ErrRedemptionKeyExists = errors.New("该兑换码密钥已存在，请更换一个")

// Keep custom keys compatible with the existing 32-character database column.
func ValidateCustomRedemptionKey(key string) error {
	if !utf8.ValidString(key) || utf8.RuneCountInString(key) < 1 || utf8.RuneCountInString(key) > 32 {
		return errors.New("自定义密钥长度须为 1–32 个字符")
	}
	for _, character := range key {
		if unicode.IsSpace(character) || unicode.Is(unicode.C, character) {
			return errors.New("自定义密钥不能包含空格或不可见字符")
		}
	}
	return nil
}

func isRedemptionKeyConflict(err error) bool {
	var postgresError *pgconn.PgError
	var mysqlError *mysql.MySQLError
	var sqliteError *sqlitedriver.Error
	return errors.Is(err, gorm.ErrDuplicatedKey) ||
		(errors.As(err, &postgresError) && postgresError.Code == "23505") ||
		(errors.As(err, &mysqlError) && mysqlError.Number == 1062) ||
		(errors.As(err, &sqliteError) && sqliteError.Code() == 2067)
}

type Redemption struct {
	Reusable     bool           `json:"reusable" gorm:"not null;default:false"`
	MaxClaims    int64          `json:"max_claims" gorm:"not null;default:0"`
	ClaimedCount int64          `json:"claimed_count" gorm:"not null;default:0"`
	Id           int            `json:"id"`
	UserId       int            `json:"user_id"`
	Key          string         `json:"key" gorm:"type:char(32);uniqueIndex"`
	Status       int            `json:"status" gorm:"default:1"`
	Name         string         `json:"name" gorm:"index"`
	Quota        int            `json:"quota" gorm:"default:100"`
	CreatedTime  int64          `json:"created_time" gorm:"bigint"`
	RedeemedTime int64          `json:"redeemed_time" gorm:"bigint"`
	Count        int            `json:"count" gorm:"-:all"` // only for api request
	UsedUserId   int            `json:"used_user_id"`
	DeletedAt    gorm.DeletedAt `gorm:"index"`
	ExpiredTime  int64          `json:"expired_time" gorm:"bigint"` // 过期时间，0 表示不过期
}

// PostgreSQL CHAR(32) pads short custom keys; never expose padding in copies or exports.
func (redemption *Redemption) AfterFind(_ *gorm.DB) error {
	redemption.Key = strings.TrimRight(redemption.Key, " ")
	return nil
}

func GetAllRedemptions(startIdx int, num int) (redemptions []*Redemption, total int64, err error) {
	// 开始事务
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 获取总数
	err = tx.Model(&Redemption{}).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// 获取分页数据
	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&redemptions).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// 提交事务
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return redemptions, total, nil
}

func SearchRedemptions(keyword string, status string, startIdx int, num int) (redemptions []*Redemption, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&Redemption{})

	if keyword != "" {
		if id, err := strconv.Atoi(keyword); err == nil {
			query = query.Where("id = ? OR name LIKE ?", id, keyword+"%")
		} else {
			query = query.Where("name LIKE ?", keyword+"%")
		}
	}

	if status != "" {
		now := common.GetTimestamp()
		switch status {
		case "expired":
			query = query.Where(
				"status = ? AND expired_time != 0 AND expired_time < ?",
				common.RedemptionCodeStatusEnabled,
				now,
			)
		case strconv.Itoa(common.RedemptionCodeStatusEnabled):
			query = query.Where(
				"status = ? AND (expired_time = 0 OR expired_time >= ?)",
				common.RedemptionCodeStatusEnabled,
				now,
			)
			query = query.Where("reusable = ? OR max_claims = 0 OR claimed_count < max_claims", false)
		case strconv.Itoa(common.RedemptionCodeStatusDisabled):
			query = query.Where("status = ?", common.RedemptionCodeStatusDisabled)
		case strconv.Itoa(common.RedemptionCodeStatusUsed):
			query = query.Where("status = ? OR (status = ? AND reusable = ? AND max_claims > 0 AND claimed_count >= max_claims)", common.RedemptionCodeStatusUsed, common.RedemptionCodeStatusEnabled, true)
		}
	}

	// Get total count
	err = query.Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated data
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&redemptions).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return redemptions, total, nil
}

func GetRedemptionById(id int) (*Redemption, error) {
	if id == 0 {
		return nil, errors.New("id 为空！")
	}
	redemption := Redemption{Id: id}
	var err error = nil
	err = DB.First(&redemption, "id = ?", id).Error
	return &redemption, err
}

func Redeem(key string, userId int) (quota int, err error) {
	if key == "" {
		return 0, errors.New("未提供兑换码")
	}
	if userId == 0 {
		return 0, errors.New("无效的 user id")
	}
	redemption := &Redemption{}

	common.RandomSleep()
	err = DB.Transaction(func(tx *gorm.DB) error {
		return redeemInTransaction(tx, key, userId, redemption)
	})
	if err != nil {
		common.SysError("redemption failed: " + err.Error())
		if errors.Is(err, ErrRedemptionAlreadyClaimed) || errors.Is(err, ErrRedemptionLimitReached) {
			return 0, err
		}
		return 0, ErrRedeemFailed
	}
	syncCreditUserQuotaCache(userId, redemption.Quota, "redemption")
	RecordLog(userId, LogTypeTopup, fmt.Sprintf("通过兑换码充值 %s，兑换码ID %d", logger.LogQuota(redemption.Quota), redemption.Id))
	return redemption.Quota, nil
}

// redeemInTransaction shares the claim guard between wallet and registration.
func redeemInTransaction(tx *gorm.DB, key string, userId int, redemption *Redemption) error {
	keyCol := "`key`"
	if tx.Dialector.Name() == "postgres" {
		keyCol = `"key"`
	}
	err := lockForUpdate(tx).Where(keyCol+" = ?", key).First(redemption).Error
	if err != nil {
		return errors.New("无效的兑换码")
	}
	if redemption.Status != common.RedemptionCodeStatusEnabled {
		return errors.New("该兑换码已被使用")
	}
	if redemption.ExpiredTime != 0 && redemption.ExpiredTime < common.GetTimestamp() {
		return errors.New("该兑换码已过期")
	}
	if redemption.Reusable {
		claim := RedemptionClaim{RedemptionId: redemption.Id, UserId: userId, Quota: redemption.Quota, CreatedTime: common.GetTimestamp()}
		var count int64
		if err := tx.Model(&RedemptionClaim{}).Where("redemption_id = ? AND user_id = ?", redemption.Id, userId).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return ErrRedemptionAlreadyClaimed
		}
		// Reserve a place atomically. Claim, counter and wallet credit all roll
		// back together if any step fails, including a duplicate or overflow.
		reserved := tx.Model(&Redemption{}).
			Where("id = ? AND status = ? AND reusable = ? AND (max_claims = 0 OR claimed_count < max_claims)", redemption.Id, common.RedemptionCodeStatusEnabled, true).
			UpdateColumn("claimed_count", gorm.Expr("claimed_count + 1"))
		if reserved.Error != nil {
			return reserved.Error
		}
		if reserved.RowsAffected != 1 {
			return ErrRedemptionLimitReached
		}
		if err := tx.Create(&claim).Error; err != nil {
			return err
		}

		return creditTopUpQuota(tx, userId, redemption.Quota, nil)
	}
	// Compare-and-swap on status: only the transaction that flips
	// enabled -> used may credit quota, so a concurrent redeem of the
	// same code loses here even without a row lock (e.g. on SQLite).
	result := tx.Model(&Redemption{}).
		Where("id = ? AND status = ?", redemption.Id, common.RedemptionCodeStatusEnabled).
		Updates(map[string]any{
			"redeemed_time": common.GetTimestamp(),
			"status":        common.RedemptionCodeStatusUsed,
			"used_user_id":  userId,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("该兑换码已被使用")
	}
	return creditTopUpQuota(tx, userId, redemption.Quota, nil)
}

// InsertWithRedemption commits the account and its optional credit together.
func (user *User) InsertWithRedemption(inviterId int, key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return user.Insert(inviterId)
	}
	if utf8.RuneCountInString(key) > 32 {
		return ErrRedeemFailed
	}
	redemption := &Redemption{}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := user.InsertWithTx(tx, inviterId); err != nil {
			return err
		}
		if err := redeemInTransaction(tx, key, user.Id, redemption); err != nil {
			return ErrRedeemFailed
		}
		return nil
	})
	if err != nil {
		return err
	}
	user.FinishInsert(inviterId)
	// The new account is committed with its final quota; no cache delta is needed.
	RecordLog(user.Id, LogTypeTopup, fmt.Sprintf("通过注册兑换码充值 %s，兑换码ID %d", logger.LogQuota(redemption.Quota), redemption.Id))
	return nil
}

func (redemption *Redemption) Insert() error {
	if err := ValidateRedemptionMode(redemption.Reusable, redemption.MaxClaims); err != nil {
		return err
	}
	redemption.ClaimedCount = 0
	if redemption.Quota <= 0 {
		return errors.New("redemption quota must be positive")
	}
	if err := common.ValidateWalletQuota(redemption.Quota); err != nil {
		return err
	}
	var err error
	err = DB.Create(redemption).Error
	if isRedemptionKeyConflict(err) {
		return ErrRedemptionKeyExists
	}
	return err
}

func (redemption *Redemption) SelectUpdate() error {
	// This can update zero values
	return DB.Model(redemption).Select("redeemed_time", "status").Updates(redemption).Error
}

// Update Make sure your token's fields is completed, because this will update non-zero values
func (redemption *Redemption) Update() error {
	if err := ValidateRedemptionMode(redemption.Reusable, redemption.MaxClaims); err != nil {
		return err
	}
	if redemption.Quota <= 0 {
		return errors.New("redemption quota must be positive")
	}
	if err := common.ValidateWalletQuota(redemption.Quota); err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var current Redemption
		if err := lockForUpdate(tx).First(&current, "id = ?", redemption.Id).Error; err != nil {
			return err
		}
		if current.Status == common.RedemptionCodeStatusUsed || current.RedeemedTime != 0 || current.UsedUserId != 0 {
			return errors.New("redeemed codes cannot be changed")
		}
		if current.ClaimedCount > 0 {
			if redemption.Reusable != current.Reusable || redemption.Quota != current.Quota {
				return errors.New("已有领取记录，不能修改领取模式或每人额度")
			}
			if redemption.MaxClaims != 0 && redemption.MaxClaims < current.ClaimedCount {
				return errors.New("人数上限不能小于已领取人数")
			}
		}
		if redemption.Status != common.RedemptionCodeStatusEnabled && redemption.Status != common.RedemptionCodeStatusDisabled {
			return errors.New("invalid redemption status")
		}
		result := tx.Model(&Redemption{}).
			Where("id = ? AND status = ? AND claimed_count = ? AND redeemed_time = 0 AND used_user_id = 0", redemption.Id, current.Status, current.ClaimedCount).
			Updates(map[string]any{
				"name": redemption.Name, "status": redemption.Status, "quota": redemption.Quota,
				"expired_time": redemption.ExpiredTime,
				"reusable":     redemption.Reusable, "max_claims": redemption.MaxClaims,
			})
		if result.Error != nil {
			return result.Error
		}
		// MySQL may count an unchanged row as zero affected rows.
		if result.RowsAffected == 0 {
			var after Redemption
			if err := tx.First(&after, "id = ?", redemption.Id).Error; err != nil {
				return err
			}
			if after.Status != redemption.Status || after.Name != redemption.Name || after.Quota != redemption.Quota || after.ExpiredTime != redemption.ExpiredTime || after.Reusable != redemption.Reusable || after.MaxClaims != redemption.MaxClaims || after.ClaimedCount != current.ClaimedCount || after.RedeemedTime != 0 || after.UsedUserId != 0 {
				return errors.New("redemption code is no longer available")
			}
		}
		redemption.ClaimedCount = current.ClaimedCount
		return nil
	})
}

// UpdateUnusedRedemptionQuota changes all selected codes or none. Redeemed codes
// remain immutable even if a redemption races with an administrator's request.
func UpdateUnusedRedemptionQuota(ids []int, quota int) (int64, error) {
	if len(ids) == 0 || len(ids) > 1000 {
		return 0, errors.New("select between 1 and 1000 redemption codes")
	}
	seen := make(map[int]struct{}, len(ids))
	for _, id := range ids {
		if id <= 0 {
			return 0, errors.New("redemption IDs must be positive")
		}
		if _, duplicate := seen[id]; duplicate {
			return 0, errors.New("duplicate redemption ID")
		}
		seen[id] = struct{}{}
	}
	if quota <= 0 {
		return 0, errors.New("redemption quota must be positive")
	}
	if err := common.ValidateWalletQuota(quota); err != nil {
		return 0, err
	}

	err := DB.Transaction(func(tx *gorm.DB) error {
		var rows []Redemption
		if err := lockForUpdate(tx).Where("id IN ?", ids).Find(&rows).Error; err != nil {
			return err
		}
		if len(rows) != len(ids) {
			return errors.New("one or more redemption codes are unavailable")
		}
		needsChange := int64(0)
		for _, row := range rows {
			if (row.Status != common.RedemptionCodeStatusEnabled && row.Status != common.RedemptionCodeStatusDisabled) || row.RedeemedTime != 0 || row.UsedUserId != 0 || row.ClaimedCount != 0 {
				return errors.New("redeemed codes cannot be changed")
			}
			if row.Quota != quota {
				needsChange++
			}
		}
		if needsChange == 0 {
			return nil
		}
		result := tx.Model(&Redemption{}).
			Where("id IN ? AND status IN ? AND redeemed_time = 0 AND used_user_id = 0 AND claimed_count = 0 AND quota <> ?", ids,
				[]int{common.RedemptionCodeStatusEnabled, common.RedemptionCodeStatusDisabled}, quota).
			Update("quota", quota)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != needsChange {
			return errors.New("one or more redemption codes changed during this request")
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return int64(len(ids)), nil
}

func (redemption *Redemption) Delete() error {
	var err error
	err = DB.Delete(redemption).Error
	return err
}

func DeleteRedemptionById(id int) (err error) {
	if id == 0 {
		return errors.New("id 为空！")
	}
	redemption := Redemption{Id: id}
	err = DB.Where(redemption).First(&redemption).Error
	if err != nil {
		return err
	}
	return redemption.Delete()
}

func DeleteInvalidRedemptions() (int64, error) {
	now := common.GetTimestamp()
	result := DB.Where("status IN ? OR (status = ? AND expired_time != 0 AND expired_time < ?) OR (status = ? AND reusable = ? AND max_claims > 0 AND claimed_count >= max_claims)", []int{common.RedemptionCodeStatusUsed, common.RedemptionCodeStatusDisabled}, common.RedemptionCodeStatusEnabled, now, common.RedemptionCodeStatusEnabled, true).Delete(&Redemption{})
	return result.RowsAffected, result.Error
}

func ValidateRedemptionMode(reusable bool, maxClaims int64) error {
	if maxClaims < 0 || maxClaims > 1_000_000_000 {
		return errors.New("领取人数上限须为 0 到 1000000000 的整数，0 表示不限人数")
	}
	if !reusable && maxClaims != 0 {
		return errors.New("单人卡密不能设置多人领取上限")
	}
	return nil
}

// Reconcile previously issued reusable codes during master startup. Never lower
// an existing counter; historical claims and user balances remain untouched.
func BackfillRedemptionClaimCounts(db *gorm.DB) error {
	var counts []struct {
		RedemptionId int
		Count        int64
	}
	if err := db.Model(&RedemptionClaim{}).Select("redemption_id, COUNT(*) AS count").Group("redemption_id").Scan(&counts).Error; err != nil {
		return err
	}
	for _, c := range counts {
		if err := db.Model(&Redemption{}).Where("id = ? AND reusable = ? AND claimed_count < ?", c.RedemptionId, true, c.Count).UpdateColumn("claimed_count", c.Count).Error; err != nil {
			return err
		}
	}
	return nil
}

// BatchDeleteRedemptions soft-deletes the selected codes in one statement.
func BatchDeleteRedemptions(ids []int) (int64, error) {
	if len(ids) == 0 || len(ids) > 1000 {
		return 0, errors.New("select between 1 and 1000 redemption codes")
	}
	for _, id := range ids {
		if id <= 0 {
			return 0, errors.New("redemption IDs must be positive")
		}
	}
	result := DB.Where("id IN ?", ids).Delete(&Redemption{})
	return result.RowsAffected, result.Error
}
