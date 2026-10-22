package service

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Private fixture keys and trust are generated only in tests, never accepted
// by the production verifier's embedded Android trust anchors.
func TestAppBetaAttestationPolicy(t *testing.T) {
	rootKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	root := &x509.Certificate{SerialNumber: big.NewInt(901), Subject: pkix.Name{CommonName: "test only"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	rootDER, err := x509.CreateCertificate(rand.Reader, root, root, &rootKey.PublicKey, rootKey)
	require.NoError(t, err)
	root, err = x509.ParseCertificate(rootDER)
	require.NoError(t, err)
	challenge, err := AppBetaRandom(32)
	require.NoError(t, err)
	challengeBytes, err := base64.RawURLEncoding.DecodeString(challenge)
	require.NoError(t, err)
	pinned := sha256.Sum256([]byte("test application certificate"))
	t.Setenv("SKYMONI_APP_BETA_ENABLED", "1")
	t.Setenv("SKYMONI_APP_BETA_MODELS", "test-model")
	t.Setenv("SKYMONI_APP_BETA_CERT_SHA256", hex.EncodeToString(pinned[:]))
	previousRoots := appBetaRoots
	defer func() { appBetaRoots = previousRoots }()
	betaRevocations.Lock()
	previousEntries, previousExpiry := betaRevocations.entries, betaRevocations.expires
	betaRevocations.entries = map[string]struct {
		Status string `json:"status"`
	}{}
	betaRevocations.expires = time.Now().Add(time.Hour)
	betaRevocations.Unlock()
	defer func() {
		betaRevocations.Lock()
		betaRevocations.entries = previousEntries
		betaRevocations.expires = previousExpiry
		betaRevocations.Unlock()
	}()
	appBetaRoots = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: rootDER})
	for _, test := range []struct {
		name, pkg                                                 string
		level                                                     int
		locked                                                    bool
		state                                                     int
		wrongChallenge, wrongSigner, revoked, untrusted, extended bool
	}{
		{name: "trusted app", pkg: "com.skyjjgw.independent.ski", level: 1, locked: true},
		{name: "wrong package", pkg: "com.attacker.app", level: 1, locked: true},
		{name: "wrong signing certificate", pkg: "com.skyjjgw.independent.ski", level: 1, locked: true, wrongSigner: true},
		{name: "software key", pkg: "com.skyjjgw.independent.ski", level: 0, locked: true},
		{name: "unlocked boot", pkg: "com.skyjjgw.independent.ski", level: 1, locked: false},
		{name: "unverified boot", pkg: "com.skyjjgw.independent.ski", level: 1, locked: true, state: 2},
		{name: "challenge mismatch", pkg: "com.skyjjgw.independent.ski", level: 1, locked: true, wrongChallenge: true},
		{name: "revoked certificate", pkg: "com.skyjjgw.independent.ski", level: 1, locked: true, revoked: true},
		{name: "unknown root", pkg: "com.skyjjgw.independent.ski", level: 1, locked: true, untrusted: true},
		{name: "attested key signs attacker leaf", pkg: "com.skyjjgw.independent.ski", level: 1, locked: true, extended: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			digest := pinned[:]
			if test.wrongSigner {
				digest = make([]byte, 32)
			}
			appDER, err := asn1.Marshal(attestedApplication{Packages: []attestedPackage{{Name: []byte(test.pkg), Version: 1}}, Digests: [][]byte{digest}})
			require.NoError(t, err)
			appOctets, err := asn1.Marshal(appDER)
			require.NoError(t, err)
			appField, err := asn1.Marshal(asn1.RawValue{Class: asn1.ClassContextSpecific, Tag: 709, IsCompound: true, Bytes: appOctets})
			require.NoError(t, err)
			bootDER, err := asn1.Marshal(attestedBoot{Key: []byte("boot"), Locked: test.locked, State: asn1.Enumerated(test.state), Hash: []byte("hash")})
			require.NoError(t, err)
			bootField, err := asn1.Marshal(asn1.RawValue{Class: asn1.ClassContextSpecific, Tag: 704, IsCompound: true, Bytes: bootDER})
			require.NoError(t, err)
			nonce := challengeBytes
			if test.wrongChallenge {
				nonce = []byte("wrong")
			}
			desc, err := asn1.Marshal(keyDescription{AttestationVersion: 400, AttestationSecurity: asn1.Enumerated(test.level), KeymasterVersion: 400, KeymasterSecurity: asn1.Enumerated(test.level), Challenge: nonce, Software: asn1.RawValue{Class: asn1.ClassUniversal, Tag: asn1.TagSequence, IsCompound: true, Bytes: appField}, Hardware: asn1.RawValue{Class: asn1.ClassUniversal, Tag: asn1.TagSequence, IsCompound: true, Bytes: bootField}})
			require.NoError(t, err)
			leafKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
			require.NoError(t, err)
			leaf := &x509.Certificate{SerialNumber: big.NewInt(902), Subject: pkix.Name{CommonName: "fixture"}, NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().Add(time.Hour), KeyUsage: x509.KeyUsageDigitalSignature, ExtraExtensions: []pkix.Extension{{Id: asn1.ObjectIdentifier{1, 3, 6, 1, 4, 1, 11129, 2, 1, 17}, Value: desc}}}
			if test.extended {
				leaf.IsCA = true
				leaf.BasicConstraintsValid = true
				leaf.KeyUsage |= x509.KeyUsageCertSign
			}
			leafDER, err := x509.CreateCertificate(rand.Reader, leaf, root, &leafKey.PublicKey, rootKey)
			require.NoError(t, err)
			chain := []string{base64.StdEncoding.EncodeToString(leafDER), base64.StdEncoding.EncodeToString(rootDER)}
			if test.extended {
				leaf, err = x509.ParseCertificate(leafDER)
				require.NoError(t, err)
				attackerKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
				require.NoError(t, err)
				extraDER, err := x509.CreateCertificate(rand.Reader, &x509.Certificate{SerialNumber: big.NewInt(903), NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().Add(time.Hour)}, leaf, &attackerKey.PublicKey, leafKey)
				require.NoError(t, err)
				chain = append([]string{base64.StdEncoding.EncodeToString(extraDER)}, chain...)
			}
			betaRevocations.Lock()
			if test.revoked {
				betaRevocations.entries["386"] = struct {
					Status string `json:"status"`
				}{Status: "REVOKED"}
			} else {
				delete(betaRevocations.entries, "386")
			}
			betaRevocations.Unlock()
			if test.untrusted {
				appBetaRoots = previousRoots
			} else {
				appBetaRoots = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: rootDER})
			}
			key, _, _, err := VerifyAppBetaAttestation(chain, challenge)
			if test.name == "trusted app" {
				require.NoError(t, err)
				require.NotEmpty(t, key)
			} else {
				assert.Error(t, err)
			}
		})
	}
	t.Setenv("SKYMONI_APP_BETA_CERT_SHA256", "")
	assert.False(t, AppBetaEnabled())
	_, _, _, err = VerifyAppBetaAttestation(nil, strings.Repeat("a", 43))
	assert.Error(t, err)
}

func TestAppBetaModelCatalogUsesExistingPermissions(t *testing.T) {
	catalog := []model.Pricing{
		{ModelName: "chat-default", EnableGroup: []string{"default"}, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI}},
		{ModelName: "responses-only", EnableGroup: []string{"default"}, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAIResponse}},
		{ModelName: "chat-premium", EnableGroup: []string{"premium"}, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI}},
		{ModelName: "staff-only", EnableGroup: []string{"staff"}, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI}},
		{ModelName: "text-embedding-3", EnableGroup: []string{"default"}, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI, constant.EndpointTypeEmbeddings}},
		{ModelName: "gpt-image-1", EnableGroup: []string{"default"}, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI, constant.EndpointTypeImageGeneration}},
	}
	routes := appBetaRoutes(catalog, []string{"default", "premium"}, []string{"*"})
	assert.Len(t, routes, 3)
	assert.Equal(t, "responses", routes["responses-only"].Protocol)
	assert.Equal(t, "premium", routes["chat-premium"].Group)
	assert.NotContains(t, routes, "staff-only")
	assert.NotContains(t, routes, "gpt-image-1")
	assert.NotContains(t, routes, "text-embedding-3")
	assert.Len(t, appBetaRoutes(catalog, []string{"default"}, []string{"chat-default"}), 1)
}
