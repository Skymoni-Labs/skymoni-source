package model

import "github.com/QuantumNous/new-api/common"
import "gorm.io/gorm"

// A successful credit-code redemption qualifies, including promotional codes
// and codes redeemed during signup. History remains valid after the balance is
// spent or a code expires or is soft-deleted. Reusable claims survive deletion
// of their source code. Direct gifts and internal balance conversions do not
// qualify; existing successful online payments remain accepted.
func HasCreatorRecharge(userID int) (bool, error) { return HasCreatorRechargeWithDB(DB, userID) }
func HasCreatorRechargeWithDB(db *gorm.DB, userID int) (bool, error) {
	if userID <= 0 {
		return false, nil
	}
	var count int64
	err := db.Unscoped().Model(&Redemption{}).
		Where("used_user_id = ? AND status = ? AND redeemed_time > ? AND quota > ?", userID, common.RedemptionCodeStatusUsed, 0, 0).
		Count(&count).Error
	if err != nil || count > 0 {
		return count > 0, err
	}
	err = db.Model(&RedemptionClaim{}).
		Where("user_id = ? AND created_time > ? AND quota > ?", userID, 0, 0).
		Count(&count).Error
	if err != nil || count > 0 {
		return count > 0, err
	}
	err = db.Model(&TopUp{}).Where("user_id = ? AND status = ? AND money > ? AND complete_time > ? AND payment_provider IN ?", userID, common.TopUpStatusSuccess, 0, 0, []string{PaymentProviderEpay, PaymentProviderStripe, PaymentProviderCreem, PaymentProviderWaffo, PaymentProviderWaffoPancake}).Limit(1).Count(&count).Error
	return count > 0, err
}
