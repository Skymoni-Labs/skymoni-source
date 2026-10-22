package service

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	_ "embed"
	"encoding/asn1"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// Android public trust anchors retrieved from https://android.googleapis.com/attestation/root.
// These are certificates, never application signing or device private keys.
//
//go:embed app_beta_roots.pem
var appBetaRoots []byte

func AppBetaEnabled() bool {
	return os.Getenv("SKYMONI_APP_BETA_ENABLED") == "1" && len(AppBetaModels()) > 0 && len(os.Getenv("SKYMONI_APP_BETA_CERT_SHA256")) > 0
}
func AppBetaModels() []string {
	var out []string
	for _, v := range strings.Split(os.Getenv("SKYMONI_APP_BETA_MODELS"), ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}
func AppBetaRandom(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
func AppBetaHash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }

type keyDescription struct {
	AttestationVersion  int
	AttestationSecurity asn1.Enumerated
	KeymasterVersion    int
	KeymasterSecurity   asn1.Enumerated
	Challenge           []byte
	UniqueID            []byte
	Software            asn1.RawValue
	Hardware            asn1.RawValue
}
type attestedPackage struct {
	Name    []byte
	Version int64
}
type attestedApplication struct {
	Packages []attestedPackage `asn1:"set"`
	Digests  [][]byte          `asn1:"set"`
}
type attestedBoot struct {
	Key    []byte
	Locked bool
	State  asn1.Enumerated
	Hash   []byte `asn1:"optional"`
}

// Strict DER decoding rejects trailing data, duplicate tags and malformed wrappers.
func decodeBetaDER(data []byte, v any) error {
	rest, err := asn1.Unmarshal(data, v)
	if err != nil {
		return err
	}
	if len(rest) != 0 {
		return errors.New("trailing attestation data")
	}
	return nil
}
func betaAuthorizations(list asn1.RawValue) (map[int][]byte, error) {
	if list.Tag != asn1.TagSequence || list.Class != asn1.ClassUniversal {
		return nil, errors.New("invalid authorization list")
	}
	out := map[int][]byte{}
	for data := list.Bytes; len(data) > 0; {
		var field asn1.RawValue
		rest, err := asn1.Unmarshal(data, &field)
		if err != nil {
			return nil, err
		}
		if field.Class != asn1.ClassContextSpecific || !field.IsCompound || out[field.Tag] != nil {
			return nil, errors.New("invalid authorization tag")
		}
		out[field.Tag] = field.Bytes
		data = rest
	}
	return out, nil
}

var betaRevocations struct {
	sync.Mutex
	expires time.Time
	entries map[string]struct {
		Status string `json:"status"`
	}
}

func CheckAppBetaRevocations(serials string) error {
	betaRevocations.Lock()
	defer betaRevocations.Unlock()
	if !time.Now().Before(betaRevocations.expires) {
		client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		response, err := client.Get("https://android.googleapis.com/attestation/status")
		if err != nil {
			return errors.New("设备证明撤销列表暂不可用")
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			return errors.New("设备证明撤销列表暂不可用")
		}
		data, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
		if err != nil {
			return err
		}
		var status struct {
			Entries map[string]struct {
				Status string `json:"status"`
			} `json:"entries"`
		}
		if err := common.Unmarshal(data, &status); err != nil || status.Entries == nil {
			return errors.New("invalid attestation revocation list")
		}
		ttl := 5 * time.Minute
		for _, part := range strings.Split(response.Header.Get("Cache-Control"), ",") {
			if v, ok := strings.CutPrefix(strings.TrimSpace(part), "max-age="); ok {
				if seconds, e := strconv.Atoi(v); e == nil && seconds >= 0 {
					ttl = min(time.Duration(seconds)*time.Second, time.Hour)
				}
			}
		}
		betaRevocations.entries = status.Entries
		betaRevocations.expires = time.Now().Add(ttl)
	}
	for serial := range strings.SplitSeq(serials, ",") {
		if _, revoked := betaRevocations.entries[serial]; revoked {
			return errors.New("设备证明已被撤销")
		}
	}
	return nil
}

func VerifyAppBetaAttestation(chain []string, challenge string) ([]byte, string, int64, error) {
	if !AppBetaEnabled() {
		return nil, "", 0, errors.New("App 内测接入尚未配置")
	}
	if len(chain) < 2 || len(chain) > 6 {
		return nil, "", 0, errors.New("invalid attestation chain")
	}
	certs := make([]*x509.Certificate, len(chain))
	serials := make([]string, len(chain))
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(appBetaRoots) {
		return nil, "", 0, errors.New("invalid trust anchors")
	}
	intermediates := x509.NewCertPool()
	expires := time.Now().Add(30 * 24 * time.Hour)
	oid := asn1.ObjectIdentifier{1, 3, 6, 1, 4, 1, 11129, 2, 1, 17}
	var description []byte
	for i, encoded := range chain {
		raw, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(raw) > 16000 {
			return nil, "", 0, errors.New("invalid attestation certificate")
		}
		cert, err := x509.ParseCertificate(raw)
		if err != nil {
			return nil, "", 0, err
		}
		certs[i] = cert
		serials[i] = cert.SerialNumber.Text(16)
		expires = minTime(expires, cert.NotAfter)
		if i > 0 {
			intermediates.AddCert(cert)
		}
		for _, ext := range cert.Extensions {
			if ext.Id.Equal(oid) {
				// An issuer carrying an attestation means an attacker extended an attested
				// key into another leaf. Only accept a directly attested leaf key.
				if i != 0 || description != nil {
					return nil, "", 0, errors.New("attestation must describe the leaf key")
				}
				description = ext.Value
			}
		}
	}
	verified, err := certs[0].Verify(x509.VerifyOptions{Roots: roots, Intermediates: intermediates, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageAny}})
	if err != nil || len(verified) == 0 {
		return nil, "", 0, errors.New("untrusted attestation chain")
	}
	key, ok := certs[0].PublicKey.(*ecdsa.PublicKey)
	if !ok || key.Curve != elliptic.P256() {
		return nil, "", 0, errors.New("P-256 key required")
	}
	var desc keyDescription
	if err := decodeBetaDER(description, &desc); err != nil {
		return nil, "", 0, err
	}
	wanted, err := base64.RawURLEncoding.DecodeString(challenge)
	if err != nil || subtle.ConstantTimeCompare(desc.Challenge, wanted) != 1 {
		return nil, "", 0, errors.New("attestation challenge mismatch")
	}
	if (desc.AttestationSecurity != 1 && desc.AttestationSecurity != 2) || (desc.KeymasterSecurity != 1 && desc.KeymasterSecurity != 2) {
		return nil, "", 0, errors.New("hardware backed attestation required")
	}
	software, err := betaAuthorizations(desc.Software)
	if err != nil {
		return nil, "", 0, err
	}
	hardware, err := betaAuthorizations(desc.Hardware)
	if err != nil {
		return nil, "", 0, err
	}
	if software[600] != nil || hardware[600] != nil {
		return nil, "", 0, errors.New("unbound key")
	}
	var boot attestedBoot
	if err := decodeBetaDER(hardware[704], &boot); err != nil || !boot.Locked || boot.State != 0 {
		return nil, "", 0, errors.New("verified locked device required")
	}
	var appBytes []byte
	if err := decodeBetaDER(software[709], &appBytes); err != nil {
		return nil, "", 0, errors.New("missing attested application")
	}
	var app attestedApplication
	if err := decodeBetaDER(appBytes, &app); err != nil {
		return nil, "", 0, err
	}
	if len(app.Packages) != 1 || string(app.Packages[0].Name) != "com.skyjjgw.independent.ski" || len(app.Digests) != 1 {
		return nil, "", 0, errors.New("application identity mismatch")
	}
	digest := hex.EncodeToString(app.Digests[0])
	trusted := false
	for _, pinned := range strings.Split(os.Getenv("SKYMONI_APP_BETA_CERT_SHA256"), ",") {
		if strings.EqualFold(strings.ReplaceAll(strings.TrimSpace(pinned), ":", ""), digest) && len(digest) == 64 {
			trusted = true
		}
	}
	if !trusted {
		return nil, "", 0, errors.New("application signing certificate mismatch")
	}
	serialList := strings.Join(serials, ",")
	if err := CheckAppBetaRevocations(serialList); err != nil {
		return nil, "", 0, err
	}
	encoded, err := x509.MarshalPKIXPublicKey(key)
	return encoded, serialList, expires.Unix(), err
}
func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

// Tokens only select a device. Every request additionally needs its non-exportable key.
func VerifyAppBetaProof(device model.AppBetaDevice, method, path, bodyHash, token, timestamp, nonce, proof string) error {
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || seconds < time.Now().Unix()-60 || seconds > time.Now().Unix()+60 {
		return errors.New("expired device proof")
	}
	nonceBytes, err := base64.RawURLEncoding.DecodeString(nonce)
	if err != nil || len(nonceBytes) != 24 {
		return errors.New("invalid request nonce")
	}
	key, err := x509.ParsePKIXPublicKey(device.PublicKey)
	if err != nil {
		return err
	}
	public, ok := key.(*ecdsa.PublicKey)
	if !ok {
		return errors.New("invalid device key")
	}
	signature, err := base64.StdEncoding.DecodeString(proof)
	if err != nil {
		return err
	}
	message := fmt.Sprintf("skymoni-app-beta-v1\n%s\n%s\n%s\n%s\n%s\n%s", method, path, timestamp, nonce, bodyHash, AppBetaHash(token))
	hash := sha256.Sum256([]byte(message))
	if !ecdsa.VerifyASN1(public, hash[:], signature) {
		return errors.New("invalid device proof")
	}
	// Unique index makes nonce consumption atomic across workers and restarts.
	return model.DB.Create(&model.AppBetaNonce{ID: device.ID + ":" + nonce, ExpiresAt: seconds + 120}).Error
}
