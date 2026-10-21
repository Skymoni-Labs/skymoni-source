package model

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/schema"
)

const MaxPopupNoticeContentBytes = 256 << 10

var (
	ErrPopupNoticeNotFound = errors.New("popup notice not found")
	ErrPopupNoticeConflict = errors.New("popup notice version changed")
)

// PopupNoticeContent permits HTML and Markdown larger than MySQL TEXT's 64 KiB.
type PopupNoticeContent string

func (PopupNoticeContent) GormDBDataType(db *gorm.DB, _ *schema.Field) string {
	if db.Dialector.Name() == "mysql" {
		return "LONGTEXT"
	}
	return "TEXT"
}

type PopupNotice struct {
	Id            int                `json:"id" gorm:"primaryKey"`
	Title         string             `json:"title" gorm:"type:varchar(200);not null"`
	Content       PopupNoticeContent `json:"content" gorm:"not null"`
	Format        string             `json:"format" gorm:"type:varchar(16);not null"`
	Audience      string             `json:"audience" gorm:"type:varchar(16);not null;index:idx_popup_delivery,priority:2"`
	TargetUserId  int                `json:"target_user_id" gorm:"not null;index:idx_popup_delivery,priority:3"`
	Status        string             `json:"status" gorm:"type:varchar(16);not null;index:idx_popup_delivery,priority:1"`
	Frequency     string             `json:"frequency" gorm:"type:varchar(16);not null"`
	DurationDays  int                `json:"duration_days" gorm:"not null;default:0"`
	StartAt       int64              `json:"start_at" gorm:"bigint;not null"`
	EndAt         int64              `json:"end_at" gorm:"bigint;not null"`
	Revision      int64              `json:"revision" gorm:"bigint;not null"`
	Priority      int                `json:"priority" gorm:"not null"`
	CreatedAt     int64              `json:"created_at" gorm:"bigint;not null"`
	UpdatedAt     int64              `json:"updated_at" gorm:"bigint;not null"`
	PublishedAt   int64              `json:"published_at" gorm:"bigint;not null"`
	CreatedBy     int                `json:"created_by" gorm:"not null"`
	ReadCount     int64              `json:"read_count" gorm:"-"`
	BenefitCodeID int                `json:"benefit_code_id" gorm:"not null;default:0"`
	DeletedAt     gorm.DeletedAt     `json:"-" gorm:"index"`
	// DurationDaysSet distinguishes an explicit permanent duration from a legacy
	// request that still authors start_at/end_at. It is never stored or returned.
	DurationDaysSet bool `json:"-" gorm:"-"`
}

type PopupNoticeRead struct {
	Id       int   `json:"id" gorm:"primaryKey;index:idx_popup_history,priority:3"`
	NoticeId int   `json:"notice_id" gorm:"not null;uniqueIndex:idx_popup_notice_reader,priority:1"`
	Revision int64 `json:"revision" gorm:"bigint;not null;uniqueIndex:idx_popup_notice_reader,priority:2"`
	UserId   int   `json:"user_id" gorm:"not null;uniqueIndex:idx_popup_notice_reader,priority:3;index:idx_popup_history,priority:1"`
	ReadAt   int64 `json:"read_at" gorm:"bigint;not null;index:idx_popup_history,priority:2"`
}

// PopupNoticeRevision is an immutable copy shared by every recipient of a
// published revision. Its contents remain available after edits or deletion.
type PopupNoticeRevision struct {
	BenefitCodeID int                `gorm:"not null;default:0"`
	Id            int                `gorm:"primaryKey"`
	NoticeId      int                `gorm:"not null;uniqueIndex:idx_popup_revision,priority:1"`
	Revision      int64              `gorm:"bigint;not null;uniqueIndex:idx_popup_revision,priority:2"`
	Title         string             `gorm:"type:varchar(200);not null"`
	Content       PopupNoticeContent `gorm:"not null"`
	Format        string             `gorm:"type:varchar(16);not null"`
	PublishedAt   int64              `gorm:"bigint;not null"`
}

type PopupNoticeHistory struct {
	BenefitCodeID int    `json:"benefit_code_id"`
	Id            int    `json:"id"`
	NoticeId      int    `json:"notice_id"`
	Revision      int64  `json:"revision"`
	Title         string `json:"title"`
	Format        string `json:"format"`
	PublishedAt   int64  `json:"published_at"`
	ReadAt        int64  `json:"read_at"`
}

type PopupNoticeHistoryDetail struct {
	PopupNoticeHistory
	Content PopupNoticeContent `json:"content"`
}

type PopupNoticeHistoryCursor struct {
	AfterReadAt int64
	AfterID     int
}

func ensurePopupNoticeRevision(tx *gorm.DB, item *PopupNotice) error {
	snapshot := PopupNoticeRevision{NoticeId: item.Id, Revision: item.Revision, Title: item.Title, Content: item.Content, Format: item.Format, PublishedAt: item.PublishedAt, BenefitCodeID: item.BenefitCodeID}
	return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "notice_id"}, {Name: "revision"}}, DoNothing: true}).Create(&snapshot).Error
}

func preservePopupNoticeRevision(tx *gorm.DB, item *PopupNotice) error {
	if item.PublishedAt == 0 {
		return nil
	}
	if item.Status == "draft" {
		// A draft edit can advance revision while retaining the last publication
		// time. Only a receipt proves this draft revision was actually received.
		var read PopupNoticeRead
		if err := tx.Select("id").Where("notice_id = ? AND revision = ?", item.Id, item.Revision).Limit(1).Find(&read).Error; err != nil {
			return err
		}
		if read.Id == 0 {
			return nil
		}
	}
	return ensurePopupNoticeRevision(tx, item)
}

// BackfillPopupNoticeRevisions recovers legacy content only when the receipt
// still matches the current revision. Overwritten revisions cannot be recovered
// and must never be replaced by the notice's newer content.
func BackfillPopupNoticeRevisions() error {
	noticeTable := DB.NamingStrategy.TableName("PopupNotice")
	readTable := DB.NamingStrategy.TableName("PopupNoticeRead")
	revisionTable := DB.NamingStrategy.TableName("PopupNoticeRevision")
	afterID := 0
	for {
		items := make([]PopupNotice, 0)
		err := DB.Transaction(func(tx *gorm.DB) error {
			matchingRead := tx.Model(&PopupNoticeRead{}).Select("1").Where(fmt.Sprintf("%s.notice_id = %s.id AND %s.revision = %s.revision", readTable, noticeTable, readTable, noticeTable))
			matchingSnapshot := tx.Model(&PopupNoticeRevision{}).Select("1").Where(fmt.Sprintf("%s.notice_id = %s.id AND %s.revision = %s.revision", revisionTable, noticeTable, revisionTable, noticeTable))
			if err := lockForUpdate(tx).Unscoped().Where("id > ?", afterID).Where("EXISTS (?) AND NOT EXISTS (?)", matchingRead, matchingSnapshot).Order("id").Limit(100).Find(&items).Error; err != nil {
				return err
			}
			for i := range items {
				if err := ensurePopupNoticeRevision(tx, &items[i]); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
		if len(items) == 0 {
			return nil
		}
		afterID = items[len(items)-1].Id
	}
}

type PopupNoticeCursor struct {
	AfterID       int
	AfterPriority int
}

// ValidatePopupNotice validates authored fields only, never caller-controlled
// creator IDs, timestamps or receipt identities.
func ValidatePopupNotice(item *PopupNotice) error {
	item.Title = strings.TrimSpace(item.Title)
	if item.Title == "" || utf8.RuneCountInString(item.Title) > 200 || strings.IndexFunc(item.Title, unicode.IsControl) >= 0 {
		return errors.New("title must contain 1 to 200 characters without control characters")
	}
	if strings.TrimSpace(string(item.Content)) == "" || len(item.Content) > MaxPopupNoticeContentBytes || !utf8.ValidString(string(item.Content)) {
		return errors.New("content must contain valid text of at most 256 KiB")
	}
	switch item.Format {
	case "auto", "text", "markdown", "html":
	default:
		return errors.New("invalid popup content format")
	}
	switch item.Audience {
	case "all_users", "guest":
		if item.TargetUserId != 0 {
			return errors.New("only a single-user popup can have a target user")
		}
	case "user":
		if item.TargetUserId <= 0 {
			return errors.New("a target user is required")
		}
	default:
		return errors.New("invalid popup audience")
	}
	switch item.Status {
	case "draft", "published", "disabled":
	default:
		return errors.New("invalid popup status")
	}
	switch item.Frequency {
	case "once", "daily", "visit":
	default:
		return errors.New("invalid popup frequency")
	}
	if item.Priority < 0 || item.Priority > 100 {
		return errors.New("priority must be between 0 and 100")
	}
	if item.DurationDays < 0 || item.DurationDays > 3650 {
		return errors.New("display duration must be between 0 and 3650 days")
	}
	if item.StartAt < 0 || item.EndAt < 0 || (item.EndAt > 0 && item.StartAt > 0 && item.EndAt <= item.StartAt) {
		return errors.New("invalid popup start and end time")
	}
	return nil
}

func GetPopupNotice(id int) (*PopupNotice, error) {
	var item PopupNotice
	err := DB.First(&item, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPopupNoticeNotFound
	}
	if err != nil {
		return nil, err
	}
	err = DB.Model(&PopupNoticeRead{}).Where("notice_id = ? AND revision = ?", item.Id, item.Revision).Count(&item.ReadCount).Error
	return &item, err
}

func ListPopupNotices(status, audience, keyword string, offset, limit int) ([]PopupNotice, int64, error) {
	query := DB.Model(&PopupNotice{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if audience != "" {
		query = query.Where("audience = ?", audience)
	}
	if keyword != "" {
		query = query.Where("title LIKE ?", "%"+keyword+"%")
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]PopupNotice, 0)
	err := query.Order("priority desc, id desc").Offset(offset).Limit(limit).Find(&items).Error
	if err != nil || len(items) == 0 {
		return items, total, err
	}
	// Count distinct recipient confirmations for the currently published revision.
	// The receipt uniqueness constraint makes one row equal one recipient.
	currentRevisions := DB.Where("notice_id = ? AND revision = ?", items[0].Id, items[0].Revision)
	for _, item := range items[1:] {
		currentRevisions = currentRevisions.Or("notice_id = ? AND revision = ?", item.Id, item.Revision)
	}
	var counts []struct {
		NoticeId int
		Revision int64
		Total    int64
	}
	if err := DB.Model(&PopupNoticeRead{}).Select("notice_id, revision, count(*) AS total").Where(currentRevisions).Group("notice_id, revision").Find(&counts).Error; err != nil {
		return nil, 0, err
	}
	byRevision := make(map[[2]int64]int64, len(counts))
	for _, count := range counts {
		byRevision[[2]int64{int64(count.NoticeId), count.Revision}] = count.Total
	}
	for i := range items {
		items[i].ReadCount = byRevision[[2]int64{int64(items[i].Id), items[i].Revision}]
	}
	return items, total, nil
}

func CreatePopupNotice(item *PopupNotice, creatorID int) error {
	if item.DurationDaysSet || item.DurationDays > 0 {
		item.StartAt, item.EndAt = 0, 0
	}
	if err := ValidatePopupNotice(item); err != nil {
		return err
	}
	if item.Audience == "user" {
		if _, err := GetUserById(item.TargetUserId, false); err != nil {
			return errors.New("target user does not exist")
		}
	}
	now := time.Now().Unix()
	item.Id, item.Revision, item.CreatedBy = 0, 1, creatorID
	item.CreatedAt, item.UpdatedAt, item.PublishedAt = now, now, 0
	item.DeletedAt = gorm.DeletedAt{}
	if item.Status == "published" {
		publishPopupNotice(item, now)
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		if item.Status == "published" {
			return ensurePopupNoticeRevision(tx, item)
		}
		return nil
	})
}

// publishPopupNotice starts the duration at publication. Existing timestamp
// windows with duration_days=0 keep their legacy schedule until explicitly saved
// with a duration, which clears that window.
func publishPopupNotice(item *PopupNotice, now int64) {
	item.PublishedAt = now
	if item.DurationDays > 0 || (item.StartAt == 0 && item.EndAt == 0) {
		item.StartAt, item.EndAt = 0, 0
		if item.DurationDays > 0 {
			item.EndAt = now + int64(item.DurationDays)*86400
		}
	}
}

func UpdatePopupNotice(id int, request PopupNotice) (*PopupNotice, error) {
	if request.DurationDaysSet {
		request.StartAt, request.EndAt = 0, 0
	}
	if err := ValidatePopupNotice(&request); err != nil {
		return nil, err
	}
	var updated PopupNotice
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&updated, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPopupNoticeNotFound
			}
			return err
		}
		if request.Revision != updated.Revision {
			return ErrPopupNoticeConflict
		}
		if err := preservePopupNoticeRevision(tx, &updated); err != nil {
			return err
		}
		previousRevision := updated.Revision
		previousStatus := updated.Status
		now := time.Now().Unix()
		if request.Audience == "user" {
			var user User
			if err := tx.Select("id").First(&user, request.TargetUserId).Error; err != nil {
				return errors.New("target user does not exist")
			}
		}
		if !request.DurationDaysSet {
			request.DurationDays = updated.DurationDays
		} else if request.Status != "draft" && updated.PublishedAt > 0 && previousStatus != "draft" {
			// Editing an existing publication uses its publication anchor. Only a
			// draft publication or an explicit resend grants a fresh duration.
			if request.DurationDays > 0 {
				request.EndAt = updated.PublishedAt + int64(request.DurationDays)*86400
			}
		}
		changed := updated.BenefitCodeID != request.BenefitCodeID || updated.Title != request.Title || updated.Content != request.Content || updated.Format != request.Format ||
			updated.Audience != request.Audience || updated.TargetUserId != request.TargetUserId || updated.Frequency != request.Frequency ||
			updated.DurationDays != request.DurationDays || updated.StartAt != request.StartAt || updated.EndAt != request.EndAt || updated.Priority != request.Priority
		if changed {
			updated.Revision++
		}
		updated.Title, updated.Content, updated.Format = request.Title, request.Content, request.Format
		updated.Audience, updated.TargetUserId, updated.Frequency = request.Audience, request.TargetUserId, request.Frequency
		updated.DurationDays = request.DurationDays
		updated.BenefitCodeID = request.BenefitCodeID
		updated.Status, updated.StartAt, updated.EndAt, updated.Priority = request.Status, request.StartAt, request.EndAt, request.Priority
		if request.Status == "published" && (updated.PublishedAt == 0 || previousStatus == "draft") {
			publishPopupNotice(&updated, now)
		}
		updated.UpdatedAt = now
		result := tx.Model(&updated).Where("revision = ?", previousRevision).Select("title", "content", "format", "audience", "target_user_id", "frequency", "status", "duration_days", "start_at", "end_at", "priority", "revision", "published_at", "updated_at", "benefit_code_id").Updates(&updated)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 && changed {
			return ErrPopupNoticeConflict
		}
		if updated.Status == "published" {
			return ensurePopupNoticeRevision(tx, &updated)
		}
		return nil
	})
	return &updated, err
}

func SetPopupNoticeState(id int, status string, resend bool) (*PopupNotice, error) {
	if (status != "draft" && status != "published" && status != "disabled") || (resend && status != "published") {
		return nil, errors.New("invalid popup publication state")
	}
	var updated PopupNotice
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&updated, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPopupNoticeNotFound
			}
			return err
		}
		if err := preservePopupNoticeRevision(tx, &updated); err != nil {
			return err
		}
		previousRevision := updated.Revision
		previousStatus := updated.Status
		updated.Status, updated.UpdatedAt = status, time.Now().Unix()
		if resend {
			updated.Revision++
		}
		if status == "draft" && updated.DurationDays > 0 {
			updated.StartAt, updated.EndAt = 0, 0
		}
		if status == "published" && (updated.PublishedAt == 0 || previousStatus == "draft" || resend) {
			publishPopupNotice(&updated, updated.UpdatedAt)
		}
		result := tx.Model(&updated).Where("revision = ?", previousRevision).Select("status", "start_at", "end_at", "revision", "published_at", "updated_at").Updates(&updated)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 && resend {
			return ErrPopupNoticeConflict
		}
		if updated.Status == "published" {
			return ensurePopupNoticeRevision(tx, &updated)
		}
		return nil
	})
	return &updated, err
}

func DeletePopupNotice(id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var item PopupNotice
		if err := lockForUpdate(tx).First(&item, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPopupNoticeNotFound
			}
			return err
		}
		if err := preservePopupNoticeRevision(tx, &item); err != nil {
			return err
		}
		return tx.Delete(&item).Error
	})
}

func popupNoticeHistoryQuery(userID int) *gorm.DB {
	readTable := DB.NamingStrategy.TableName("PopupNoticeRead")
	revisionTable := DB.NamingStrategy.TableName("PopupNoticeRevision")
	return DB.Table(readTable+" AS receipt").Joins("INNER JOIN "+revisionTable+" AS snapshot ON snapshot.notice_id = receipt.notice_id AND snapshot.revision = receipt.revision").Where("receipt.user_id = ?", userID)
}

func ListPopupNoticeHistory(userID int, cursor *PopupNoticeHistoryCursor) ([]PopupNoticeHistory, error) {
	items := make([]PopupNoticeHistory, 0)
	if userID <= 0 {
		return items, nil
	}
	query := popupNoticeHistoryQuery(userID).Select("receipt.id, receipt.notice_id, receipt.revision, snapshot.title, snapshot.format, snapshot.benefit_code_id, snapshot.published_at, receipt.read_at")
	if cursor != nil {
		query = query.Where("receipt.read_at < ? OR (receipt.read_at = ? AND receipt.id < ?)", cursor.AfterReadAt, cursor.AfterReadAt, cursor.AfterID)
	}
	err := query.Order("receipt.read_at DESC, receipt.id DESC").Limit(20).Scan(&items).Error
	return items, err
}

func GetPopupNoticeHistory(userID, receiptID int) (*PopupNoticeHistoryDetail, error) {
	if userID <= 0 {
		return nil, ErrPopupNoticeNotFound
	}
	var item PopupNoticeHistoryDetail
	err := popupNoticeHistoryQuery(userID).Select("receipt.id, receipt.notice_id, receipt.revision, snapshot.title, snapshot.format, snapshot.benefit_code_id, snapshot.published_at, receipt.read_at, snapshot.content").Where("receipt.id = ?", receiptID).Take(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPopupNoticeNotFound
	}
	return &item, err
}

// PopupNoticeDayStart uses the site's Beijing calendar rather than server TZ.
func PopupNoticeDayStart(now int64) int64 {
	const offset = int64(8 * 60 * 60)
	return (now+offset)/86400*86400 - offset
}

func GetEligiblePopupNotices(userID int, now int64, page int, cursor *PopupNoticeCursor) ([]PopupNotice, error) {
	items := make([]PopupNotice, 0)
	query := DB.Model(&PopupNotice{}).Where("status = ? AND (start_at = 0 OR start_at <= ?) AND (end_at = 0 OR end_at > ?)", "published", now, now)
	if userID <= 0 {
		query = query.Where("audience = ?", "guest")
	} else {
		query = query.Where("audience = ? OR (audience = ? AND target_user_id = ?)", "all_users", "user", userID)
		noticeTable := DB.NamingStrategy.TableName("PopupNotice")
		readTable := DB.NamingStrategy.TableName("PopupNoticeRead")
		match := fmt.Sprintf("%s.notice_id = %s.id AND %s.revision = %s.revision AND %s.user_id = ?", readTable, noticeTable, readTable, noticeTable, readTable)
		onceRead := DB.Model(&PopupNoticeRead{}).Select("1").Where(match, userID)
		dailyRead := DB.Model(&PopupNoticeRead{}).Select("1").Where(match, userID).Where("read_at >= ?", PopupNoticeDayStart(now))
		query = query.Where("frequency = ? OR (frequency = ? AND NOT EXISTS (?)) OR (frequency = ? AND NOT EXISTS (?))", "visit", "once", onceRead, "daily", dailyRead)
	}
	if cursor != nil {
		query = query.Where("priority < ? OR (priority = ? AND id < ?)", cursor.AfterPriority, cursor.AfterPriority, cursor.AfterID)
		page = 1
	}
	err := query.Order("priority desc, id desc").Offset((page - 1) * 20).Limit(20).Find(&items).Error
	return items, err
}

func ReadPopupNotice(userID, noticeID int, revision, now int64) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var item PopupNotice
		if err := lockForUpdate(tx).First(&item, noticeID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPopupNoticeNotFound
			}
			return err
		}
		if userID <= 0 || (item.Audience != "all_users" && !(item.Audience == "user" && item.TargetUserId == userID)) {
			return ErrPopupNoticeNotFound
		}
		if item.Revision != revision {
			return ErrPopupNoticeConflict
		}
		if item.Status != "published" || (item.StartAt > 0 && item.StartAt > now) || (item.EndAt > 0 && item.EndAt <= now) {
			return ErrPopupNoticeNotFound
		}
		if err := ensurePopupNoticeRevision(tx, &item); err != nil {
			return err
		}
		read := PopupNoticeRead{NoticeId: noticeID, Revision: revision, UserId: userID, ReadAt: now}
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "notice_id"}, {Name: "revision"}, {Name: "user_id"}}, DoNothing: true}).Create(&read).Error; err != nil {
			return err
		}
		if item.Frequency == "daily" {
			return tx.Model(&PopupNoticeRead{}).Where("notice_id = ? AND revision = ? AND user_id = ? AND read_at < ?", noticeID, revision, userID, PopupNoticeDayStart(now)).Update("read_at", now).Error
		}
		return nil
	})
}
