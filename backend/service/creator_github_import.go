package service

import (
	"context"
	"encoding/base64"
	"net/url"
	"os"
	"path"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type githubContent struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Type     string `json:"type"`
	Encoding string `json:"encoding"`
	Content  string `json:"content"`
	SHA      string `json:"sha"`
}
type CreatorGitHubImport struct {
	Repository string `json:"repository"`
	Directory  string `json:"directory"`
}
type CreatorGitHubDraft struct {
	Work     CreatorWork `json:"work"`
	Signals  []string    `json:"signals"`
	Warnings []string    `json:"warnings"`
}

func githubPath(value string) string {
	parts := strings.Split(value, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}
func githubClip(value string, limit int) string {
	units := 0
	for index, r := range value {
		cost := 1
		if r > 0xffff {
			cost = 2
		}
		if units+cost > limit {
			return value[:index]
		}
		units += cost
	}
	return value
}

// Signals choose an editable starting layout, not the site's public taxonomy.
func CreatorGitHubSignals(repo CreatorGitHubRepository, files []githubContent) (string, []string) {
	category := "other"
	signals := []string{}
	names := []string{}
	for _, f := range files {
		names = append(names, strings.ToLower(f.Name))
	}
	joined := strings.ToLower(strings.Join(append(slices.Clone(repo.Topics), repo.Name), " "))
	for _, name := range names {
		switch {
		case name == "skill.md":
			signals = append(signals, "skill")
			category = "workflow"
		case strings.HasSuffix(name, ".kicad_pcb") || strings.HasSuffix(name, ".kicad_sch") || strings.HasSuffix(name, ".sch") || strings.HasSuffix(name, ".brd"):
			signals = append(signals, "hardware")
		case strings.HasSuffix(name, ".scad") || strings.HasSuffix(name, ".step") || strings.HasSuffix(name, ".stl"):
			signals = append(signals, "3d")
		case strings.HasSuffix(name, ".ipynb"):
			signals = append(signals, "notebook")
		case strings.HasSuffix(name, ".ttf") || strings.HasSuffix(name, ".otf") || strings.HasSuffix(name, ".svg"):
			signals = append(signals, "design")
		}
	}
	for _, keyword := range []string{"mcp", "firmware", "dataset", "tutorial", "robot", "fpga"} {
		if strings.Contains(joined, keyword) {
			signals = append(signals, keyword)
		}
	}
	if category == "other" {
		switch {
		case slices.Contains(signals, "mcp"):
			category = "workflow"
		case slices.Contains(signals, "hardware") || slices.Contains(signals, "3d") || slices.Contains(signals, "firmware") || slices.Contains(signals, "fpga") || slices.Contains(signals, "robot"):
			category = "other"
		case slices.Contains(names, "index.html") || slices.Contains(names, "next.config.js") || slices.Contains(names, "vite.config.ts"):
			category = "website"
		case slices.Contains(names, "package.json") || slices.Contains(names, "cargo.toml") || slices.Contains(names, "go.mod") || slices.Contains(names, "pyproject.toml") || slices.Contains(names, "pubspec.yaml"):
			category = "software"
		case slices.Contains(signals, "design"):
			category = "design"
		case slices.Contains(signals, "notebook") || slices.Contains(signals, "dataset") || slices.Contains(signals, "tutorial"):
			category = "article"
		}
	}
	if len(signals) == 0 {
		signals = append(signals, "repository")
	}
	slices.Sort(signals)
	return category, slices.Compact(signals)
}

func CreatorGitHubImportDraft(ctx context.Context, uid int, input CreatorGitHubImport) (CreatorGitHubDraft, error) {
	result := CreatorGitHubDraft{Warnings: []string{}}
	owner, name, ok := strings.Cut(input.Repository, "/")
	if !ok || !githubName.MatchString(owner) || !githubName.MatchString(name) || name == "." || name == ".." || owner == "." || owner == ".." || len(input.Directory) > 300 {
		return result, ErrCreatorInvalid
	}
	dir := strings.Trim(input.Directory, "/")
	if strings.Contains(dir, "\\") || strings.ContainsAny(dir, "\x00\r\n") || path.Clean(dir) != dir && dir != "" {
		return result, ErrCreatorInvalid
	}
	for part := range strings.SplitSeq(dir, "/") {
		if part == ".." || part == "." {
			return result, ErrCreatorInvalid
		}
	}
	err := WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	token, err := CreatorGitHubToken(ctx, uid)
	if err != nil {
		return result, err
	}
	var login string
	err = WithCreatorGitHubVault(false, func(data map[int]CreatorGitHubConnection) error { login = data[uid].Login; return nil })
	if err != nil {
		return result, err
	}
	if !strings.EqualFold(owner, login) {
		return result, ErrCreatorForbidden
	}
	apiBase := "https://api.github.com/repos/" + githubPath(input.Repository)
	var repo CreatorGitHubRepository
	if err = githubRequest(ctx, "GET", apiBase, token, nil, &repo); err != nil {
		return result, err
	}
	if repo.Private || !strings.EqualFold(repo.Owner.Login, login) || repo.ID <= 0 {
		return result, ErrCreatorForbidden
	}
	var files []githubContent
	if err = githubRequest(ctx, "GET", apiBase+"/contents/"+githubPath(dir), token, nil, &files); err != nil {
		if !os.IsNotExist(err) || dir != "" {
			return result, err
		}
		files = []githubContent{}
	}
	readmePath := ""
	skillPath := ""
	for _, f := range files {
		if f.Type != "file" {
			continue
		}
		lower := strings.ToLower(f.Name)
		if (lower == "readme.md" || lower == "readme.rst" || lower == "readme.txt" || lower == "readme") && readmePath == "" {
			readmePath = f.Path
		}
		if lower == "skill.md" {
			skillPath = f.Path
		}
	}
	if readmePath == "" {
		readmePath = skillPath
	}
	readme := ""
	readmeSHA := ""
	if readmePath != "" {
		var file githubContent
		if err = githubRequest(ctx, "GET", apiBase+"/contents/"+githubPath(readmePath), token, nil, &file); err != nil {
			return result, err
		}
		if file.Encoding == "base64" {
			raw, e := base64.StdEncoding.DecodeString(strings.ReplaceAll(file.Content, "\n", ""))
			if e == nil {
				readme = string(raw)
				readmeSHA = file.SHA
			}
		}
		if len([]rune(readme)) > 12000 {
			result.Warnings = append(result.Warnings, "README_TRUNCATED")
		}
	}
	if readme == "" {
		result.Warnings = append(result.Warnings, "README_MISSING")
	}
	if repo.Fork {
		result.Warnings = append(result.Warnings, "FORK_ATTRIBUTION")
	}
	if repo.License == nil || repo.License.SPDX == "NOASSERTION" {
		result.Warnings = append(result.Warnings, "LICENSE_REVIEW")
	}
	result.Warnings = append(result.Warnings, "COVER_OPTIONAL")
	category, signals := CreatorGitHubSignals(repo, files)
	result.Signals = signals
	title := repo.Name
	source := repo.HTMLURL
	if dir != "" {
		title = path.Base(dir)
		source += "/tree/" + url.PathEscape(repo.DefaultBranch) + "/" + githubPath(dir)
	}
	settings := &CreatorSettings{Accent: "#438fe7", Layout: "story", CoverRatio: "wide", ShowCover: true, ShowDescription: true, ShowGallery: true, ShowFiles: true, ShowRelated: true, Listed: true, ButtonLabel: "GitHub", Links: []CreatorLink{}, Metadata: []CreatorMetadata{{ID: common.GetUUID(), Label: "GitHub repository", Value: repo.FullName}, {ID: common.GetUUID(), Label: "Repository owner", Value: repo.Owner.Login}, {ID: common.GetUUID(), Label: "Imported at", Value: time.Now().UTC().Format(time.RFC3339)}}}
	if repo.Language != "" {
		settings.Metadata = append(settings.Metadata, CreatorMetadata{ID: common.GetUUID(), Label: "Language", Value: repo.Language})
	}
	if repo.License != nil {
		settings.Metadata = append(settings.Metadata, CreatorMetadata{ID: common.GetUUID(), Label: "License", Value: githubClip(repo.License.Name, 300)})
		settings.Links = append(settings.Links, CreatorLink{ID: common.GetUUID(), Label: "License files", URL: repo.HTMLURL + "/tree/" + url.PathEscape(repo.DefaultBranch)})
	}
	if readmeSHA != "" {
		settings.Metadata = append(settings.Metadata, CreatorMetadata{ID: common.GetUUID(), Label: "README revision", Value: readmeSHA})
	}
	work := CreatorWork{ID: common.GetUUID(), Title: githubClip(title, 80), Summary: githubClip(repo.Description, 160), Category: category, Tags: githubClip(strings.Join(repo.Topics, ", "), 120), URL: source, Style: "horizon", Status: "draft", Images: []string{}, Blocks: []CreatorBlock{}, Settings: settings}
	if readme != "" {
		work.Blocks = append(work.Blocks, CreatorBlock{ID: common.GetUUID(), Type: "markdown", Title: "README", Text: githubClip(readme, 12000), URL: repo.HTMLURL + "/blob/" + url.PathEscape(repo.DefaultBranch) + "/" + githubPath(readmePath), Visible: true})
	}
	if repo.Homepage != "" && creatorURL(repo.Homepage) {
		work.URL = repo.Homepage
		settings.ButtonLabel = "Website"
		settings.Links = append(settings.Links, CreatorLink{ID: common.GetUUID(), Label: "GitHub", URL: source})
	}
	if repo.Fork {
		work.Blocks = append(work.Blocks, CreatorBlock{ID: common.GetUUID(), Type: "callout", Title: "Fork", Text: "This is a fork. Please preserve upstream authorship and license information before submitting.", Visible: true})
	}
	var release struct {
		Name    string `json:"name"`
		Tag     string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if e := githubRequest(ctx, "GET", apiBase+"/releases/latest", token, nil, &release); e == nil && creatorURL(release.HTMLURL) && release.HTMLURL != "" {
		settings.Links = append(settings.Links, CreatorLink{ID: common.GetUUID(), Label: "GitHub Releases", URL: release.HTMLURL})
		settings.Metadata = append(settings.Metadata, CreatorMetadata{ID: common.GetUUID(), Label: "Release", Value: githubClip(release.Tag, 300)})
	} else if e != nil && !os.IsNotExist(e) {
		result.Warnings = append(result.Warnings, "RELEASE_UNAVAILABLE")
	}
	// Authorization may have been disconnected while GitHub was responding.
	err = WithCreatorGitHubVault(false, func(data map[int]CreatorGitHubConnection) error {
		c, ok := data[uid]
		if !ok || c.Login != login || c.Access != token {
			return ErrCreatorGitHubReconnect
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	work, err = SaveCreatorWork(uid, work)
	if err != nil {
		return result, err
	}
	result.Work = work
	return result, nil
}
