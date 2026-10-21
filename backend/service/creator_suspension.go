package service

import "errors"

var ErrCreatorApplicationsClosed = errors.New("暂未开放新的创作者开通，请稍后再来")

func SetCreatorSuspended(uid, actor int, suspended bool, expected string) (string, error) {
	status := ""
	if uid <= 0 || actor <= 0 {
		return status, ErrCreatorInvalid
	}
	err := WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		previous := CreatorMemberStatus(c, uid)
		if expected != previous {
			return ErrCreatorConflict
		}
		member, ok := c.Members[uid]
		if !ok || (member.AcceptedAt == 0 && member.GrantedAt == 0) {
			return ErrCreatorInvalid
		}
		member.Suspended = suspended
		c.Members[uid] = member
		status = CreatorMemberStatus(c, uid)
		return nil
	})
	if err == nil {
		notifyCreatorAccess(uid)
	}
	return status, err
}
