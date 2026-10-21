package service

import (
	"os"
	"slices"
	"sort"

	"github.com/QuantumNous/new-api/model"
)

// A public profile is an explicit projection, never the private member record
// (which also contains saved projects, moderation state and enrollment data).
type PublicCreatorProfile struct {
	UserID  int            `json:"userId"`
	Profile CreatorProfile `json:"profile"`
	Avatar  string         `json:"avatar"`
	Pinned  []string       `json:"pinned"`
	Works   []CreatorWork  `json:"works"`
}

func GetPublicCreatorProfile(uid int) (PublicCreatorProfile, error) {
	out := PublicCreatorProfile{UserID: uid, Pinned: []string{}, Works: []CreatorWork{}}
	err := WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		if uid <= 0 || !CreatorActive(c, uid) {
			return os.ErrNotExist
		}
		member := c.Members[uid]
		out.Profile = member.Profile
		var author model.CreatorHomeAuthor
		if err := model.DB.Where("user_id = ?", uid).Limit(1).Find(&author).Error; err != nil {
			return err
		}
		out.Avatar = homeCreatorAvatar(member.Profile, author.Avatar)
		for _, work := range c.Works {
			if work.OwnerID != uid || !CreatorPublic(c, work) {
				continue
			}
			work.Author = member.Profile.Name
			work.Revision, work.ReviewNote = "", ""
			// Cards fetch full content from the existing public work endpoint.
			work.Description, work.Images, work.Blocks, work.Attachment = "", nil, nil, nil
			out.Works = append(out.Works, work)
		}
		sort.SliceStable(out.Works, func(i, j int) bool { return out.Works[i].UpdatedAt > out.Works[j].UpdatedAt })
		for _, id := range member.Pinned {
			if len(out.Pinned) == 6 {
				break
			}
			if !slices.Contains(out.Pinned, id) && slices.ContainsFunc(out.Works, func(w CreatorWork) bool { return w.ID == id }) {
				out.Pinned = append(out.Pinned, id)
			}
		}
		return nil
	})
	return out, err
}
