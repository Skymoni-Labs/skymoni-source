package service

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

var ErrCreatorGitHubConfig = errors.New("GitHub connection is not configured")
var ErrCreatorGitHubReconnect = errors.New("GitHub authorization expired or was revoked")
var ErrCreatorGitHubRemote = errors.New("GitHub is temporarily unavailable")
var ErrCreatorGitHubRate = errors.New("GitHub API limit reached; try later")
var githubVaultMutex sync.Mutex
var githubName = regexp.MustCompile(`^[a-zA-Z0-9_.-]{1,100}$`)

// Configuration is independent of the site's GitHub login provider.
type CreatorGitHubConfig struct{ ClientID, ClientSecret, Callback string }

func CreatorGitHubConfiguration() (CreatorGitHubConfig, error) {
	c := CreatorGitHubConfig{os.Getenv("CREATOR_GITHUB_CLIENT_ID"), os.Getenv("CREATOR_GITHUB_CLIENT_SECRET"), os.Getenv("CREATOR_GITHUB_CALLBACK_URL")}
	u, err := url.Parse(c.Callback)
	if c.ClientID == "" || c.ClientSecret == "" || err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/creators/github/callback" || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost"))) {
		return c, ErrCreatorGitHubConfig
	}
	return c, nil
}

type CreatorGitHubConnection struct {
	ID               int64  `json:"id"`
	Login            string `json:"login"`
	ConnectedAt      int64  `json:"connectedAt"`
	Access           string `json:"access"`
	Refresh          string `json:"refresh"`
	ExpiresAt        int64  `json:"expiresAt"`
	RefreshExpiresAt int64  `json:"refreshExpiresAt"`
}
type CreatorGitHubStatus struct {
	Configured bool   `json:"configured"`
	Connected  bool   `json:"connected"`
	Login      string `json:"login,omitempty"`
	ExpiresAt  int64  `json:"expiresAt,omitempty"`
}
type githubToken struct {
	Access         string `json:"access_token"`
	Refresh        string `json:"refresh_token"`
	Expires        int64  `json:"expires_in"`
	RefreshExpires int64  `json:"refresh_token_expires_in"`
	Type           string `json:"token_type"`
	Error          string `json:"error"`
}

// This client never follows redirects, including redirects returned by repository content APIs.
var creatorGitHubHTTP = &http.Client{Timeout: 18 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

func githubRequest(ctx context.Context, method, endpoint, token string, form url.Values, target any) error {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return ErrCreatorGitHubRemote
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "skymoni-creator-center")
	req.Header.Set("X-GitHub-Api-Version", "2026-03-10")
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Accept", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := creatorGitHubHTTP.Do(req)
	if err != nil {
		return ErrCreatorGitHubRemote
	}
	defer res.Body.Close()
	if res.StatusCode == 401 {
		return ErrCreatorGitHubReconnect
	}
	if res.StatusCode == 429 || (res.StatusCode == 403 && res.Header.Get("X-RateLimit-Remaining") == "0") {
		return ErrCreatorGitHubRate
	}
	if res.StatusCode == 404 {
		return os.ErrNotExist
	}
	if res.StatusCode != 200 {
		return ErrCreatorGitHubRemote
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, 2*1024*1024+1))
	if err != nil || len(raw) > 2*1024*1024 || common.Unmarshal(raw, target) != nil {
		return ErrCreatorGitHubRemote
	}
	return nil
}

func CreatorGitHubExchange(ctx context.Context, code, verifier string) (CreatorGitHubConnection, error) {
	c, err := CreatorGitHubConfiguration()
	if err != nil {
		return CreatorGitHubConnection{}, err
	}
	var token githubToken
	err = githubRequest(ctx, "POST", "https://github.com/login/oauth/access_token", "", url.Values{"client_id": {c.ClientID}, "client_secret": {c.ClientSecret}, "code": {code}, "redirect_uri": {c.Callback}, "code_verifier": {verifier}}, &token)
	if err != nil {
		return CreatorGitHubConnection{}, err
	}
	if token.Access == "" || token.Refresh == "" || token.Expires <= 0 || token.RefreshExpires <= 0 || token.Error != "" || !strings.EqualFold(token.Type, "bearer") {
		return CreatorGitHubConnection{}, ErrCreatorGitHubReconnect
	}
	var user struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
	}
	if err = githubRequest(ctx, "GET", "https://api.github.com/user", token.Access, nil, &user); err != nil {
		return CreatorGitHubConnection{}, err
	}
	if user.ID <= 0 || !githubName.MatchString(user.Login) {
		return CreatorGitHubConnection{}, ErrCreatorGitHubRemote
	}
	now := time.Now().Unix()
	return CreatorGitHubConnection{ID: user.ID, Login: user.Login, ConnectedAt: now, Access: token.Access, Refresh: token.Refresh, ExpiresAt: now + min(max(token.Expires, 1), 28800), RefreshExpiresAt: now + min(max(token.RefreshExpires, 0), 15897600)}, nil
}

// The key and encrypted vault stay outside public/static roots and corresponding source archives.
// A separate OS lock makes writes and refresh-token rotation safe across processes.
func WithCreatorGitHubVault(write bool, action func(map[int]CreatorGitHubConnection) error) error {
	githubVaultMutex.Lock()
	defer githubVaultMutex.Unlock()
	dir := filepath.Join(CreatorDirectory(), "github-private")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	lock, err := os.OpenFile(filepath.Join(dir, ".lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err = lockSoftwareFile(lock); err != nil {
		return err
	}
	defer unlockSoftwareFile(lock)
	keyPath := filepath.Join(dir, "key")
	key, err := os.ReadFile(keyPath)
	if os.IsNotExist(err) {
		if _, vaultErr := os.Stat(filepath.Join(dir, "connections.enc")); vaultErr == nil || !os.IsNotExist(vaultErr) {
			return ErrCreatorGitHubConfig
		}
		key = make([]byte, 32)
		if _, err = rand.Read(key); err != nil {
			return err
		}
		keyFile, createErr := os.OpenFile(keyPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if createErr != nil {
			return createErr
		}
		if _, err = keyFile.Write(key); err == nil {
			err = keyFile.Sync()
		}
		closeErr := keyFile.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
	} else if err != nil {
		return err
	}
	if len(key) != 32 {
		return ErrCreatorGitHubConfig
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	data := map[int]CreatorGitHubConnection{}
	vaultPath := filepath.Join(dir, "connections.enc")
	raw, err := os.ReadFile(vaultPath)
	if err == nil {
		if len(raw) > 4*1024*1024 || len(raw) < aead.NonceSize() {
			return ErrCreatorGitHubConfig
		}
		plain, e := aead.Open(nil, raw[:aead.NonceSize()], raw[aead.NonceSize():], []byte("creator-github-v1"))
		if e != nil {
			return ErrCreatorGitHubConfig
		}
		if common.Unmarshal(plain, &data) != nil {
			return ErrCreatorGitHubConfig
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err = action(data); err != nil || !write {
		return err
	}
	plain, err := common.Marshal(data)
	if err != nil {
		return err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return err
	}
	raw = aead.Seal(nonce, nonce, plain, []byte("creator-github-v1"))
	if len(raw) > 4*1024*1024 {
		return ErrCreatorGitHubRemote
	}
	temp, err := os.CreateTemp(dir, ".vault-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if _, err = temp.Write(raw); err == nil {
		err = temp.Sync()
	}
	closeErr := temp.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(temp.Name(), vaultPath)
}

func CreatorGitHubGetStatus(uid int) (CreatorGitHubStatus, error) {
	_, err := CreatorGitHubConfiguration()
	status := CreatorGitHubStatus{Configured: err == nil}
	err = WithCreatorGitHubVault(false, func(data map[int]CreatorGitHubConnection) error {
		if c, ok := data[uid]; ok {
			status.Connected = true
			status.Login = c.Login
			status.ExpiresAt = c.ExpiresAt
		}
		return nil
	})
	return status, err
}
func CreatorGitHubStore(uid int, connection CreatorGitHubConnection) error {
	return WithCreatorGitHubVault(true, func(data map[int]CreatorGitHubConnection) error {
		// No silent replacement: disconnect explicitly before connecting a different account.
		if old, ok := data[uid]; ok && old.ID != connection.ID {
			return ErrCreatorConflict
		}
		data[uid] = connection
		return nil
	})
}
func CreatorGitHubToken(ctx context.Context, uid int) (string, error) {
	var token string
	err := WithCreatorGitHubVault(true, func(data map[int]CreatorGitHubConnection) error {
		connection, ok := data[uid]
		if !ok {
			return ErrCreatorGitHubReconnect
		}
		if connection.ExpiresAt <= time.Now().Unix()+60 {
			if connection.Refresh == "" || connection.RefreshExpiresAt <= time.Now().Unix() {
				return ErrCreatorGitHubReconnect
			}
			config, err := CreatorGitHubConfiguration()
			if err != nil {
				return err
			}
			var refreshed githubToken
			err = githubRequest(ctx, "POST", "https://github.com/login/oauth/access_token", "", url.Values{"grant_type": {"refresh_token"}, "client_id": {config.ClientID}, "client_secret": {config.ClientSecret}, "refresh_token": {connection.Refresh}}, &refreshed)
			if err != nil {
				return err
			}
			if refreshed.Access == "" || refreshed.Refresh == "" || refreshed.Expires <= 0 || refreshed.RefreshExpires <= 0 || refreshed.Error != "" || !strings.EqualFold(refreshed.Type, "bearer") {
				return ErrCreatorGitHubReconnect
			}
			now := time.Now().Unix()
			connection.Access = refreshed.Access
			connection.Refresh = refreshed.Refresh
			connection.ExpiresAt = now + min(max(refreshed.Expires, 1), 28800)
			connection.RefreshExpiresAt = now + min(max(refreshed.RefreshExpires, 1), 15897600)
			data[uid] = connection
		}
		token = connection.Access
		return nil
	})
	return token, err
}
func CreatorGitHubDisconnect(ctx context.Context, uid int) (bool, error) {
	revoked := false
	err := WithCreatorGitHubVault(true, func(data map[int]CreatorGitHubConnection) error {
		connection, ok := data[uid]
		if !ok {
			return nil
		}
		if config, err := CreatorGitHubConfiguration(); err == nil {
			raw, _ := common.Marshal(map[string]string{"access_token": connection.Access})
			req, _ := http.NewRequestWithContext(ctx, "DELETE", "https://api.github.com/applications/"+url.PathEscape(config.ClientID)+"/grant", bytes.NewReader(raw))
			req.SetBasicAuth(config.ClientID, config.ClientSecret)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/vnd.github+json")
			req.Header.Set("User-Agent", "skymoni-creator-center")
			if res, err := creatorGitHubHTTP.Do(req); err == nil {
				revoked = res.StatusCode == 204 || res.StatusCode == 404
				res.Body.Close()
			}
		}
		delete(data, uid)
		return nil
	})
	return revoked, err
}

type CreatorGitHubRepository struct {
	ID            int64    `json:"id"`
	Name          string   `json:"name"`
	FullName      string   `json:"full_name"`
	Description   string   `json:"description"`
	HTMLURL       string   `json:"html_url"`
	Homepage      string   `json:"homepage"`
	Language      string   `json:"language"`
	Topics        []string `json:"topics"`
	Private       bool     `json:"private"`
	Fork          bool     `json:"fork"`
	Archived      bool     `json:"archived"`
	DefaultBranch string   `json:"default_branch"`
	UpdatedAt     string   `json:"updated_at"`
	Owner         struct {
		Login string `json:"login"`
	} `json:"owner"`
	License *struct {
		SPDX string `json:"spdx_id"`
		Name string `json:"name"`
	} `json:"license"`
}

func CreatorGitHubRepositories(ctx context.Context, uid, page int) ([]CreatorGitHubRepository, error) {
	if page < 1 || page > 100 {
		return nil, ErrCreatorInvalid
	}
	token, err := CreatorGitHubToken(ctx, uid)
	if err != nil {
		return nil, err
	}
	var repos []CreatorGitHubRepository
	// public + owner are enforced again after the response; private content is never imported.
	err = githubRequest(ctx, "GET", "https://api.github.com/user/repos?visibility=public&affiliation=owner&sort=updated&per_page=30&page="+strconv.Itoa(page), token, nil, &repos)
	if err != nil {
		return nil, err
	}
	var login string
	err = WithCreatorGitHubVault(false, func(data map[int]CreatorGitHubConnection) error { login = data[uid].Login; return nil })
	if err != nil {
		return nil, err
	}
	public := []CreatorGitHubRepository{}
	for _, r := range repos {
		if !r.Private && strings.EqualFold(r.Owner.Login, login) {
			public = append(public, r)
		}
	}
	return public, nil
}
