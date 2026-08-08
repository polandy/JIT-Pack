package api_test

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/api"
)

func generateRSAKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	return key
}

func serveJWKS(t *testing.T, kid string, pub *rsa.PublicKey) *httptest.Server {
	t.Helper()
	jwks := map[string]any{
		"keys": []map[string]string{
			{
				"kty": "RSA",
				"kid": kid,
				"alg": "RS256",
				"n":   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
			},
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jwks)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func rsaToken(t *testing.T, key *rsa.PrivateKey, kid, sub string) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub": sub,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	tok.Header["kid"] = kid
	signed, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign RS256 token: %v", err)
	}
	return signed
}

func TestJWKSProvider_FetchAndValidate(t *testing.T) {
	key := generateRSAKey(t)
	kid := "test-key-1"
	jwksSrv := serveJWKS(t, kid, &key.PublicKey)

	provider, err := api.NewJWKSProvider(jwksSrv.URL)
	if err != nil {
		t.Fatalf("NewJWKSProvider: %v", err)
	}
	defer provider.Close()

	// Create a valid RS256 token and verify via KeyFunc.
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub": "user-1",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	tok.Header["kid"] = kid

	signed, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	parsed, err := jwt.Parse(signed, provider.KeyFunc, jwt.WithValidMethods([]string{"RS256"}))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	sub, _ := parsed.Claims.(jwt.MapClaims).GetSubject()
	if sub != "user-1" {
		t.Errorf("sub = %q, want user-1", sub)
	}
}

func TestJWKSProvider_UnknownKid(t *testing.T) {
	key := generateRSAKey(t)
	jwksSrv := serveJWKS(t, "known-key", &key.PublicKey)

	provider, err := api.NewJWKSProvider(jwksSrv.URL)
	if err != nil {
		t.Fatalf("NewJWKSProvider: %v", err)
	}
	defer provider.Close()

	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub": "user-1",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	tok.Header["kid"] = "unknown-key"
	signed, _ := tok.SignedString(key)

	_, err = jwt.Parse(signed, provider.KeyFunc, jwt.WithValidMethods([]string{"RS256"}))
	if err == nil {
		t.Error("expected error for unknown kid")
	}
}

func TestJWKSProvider_BadURL(t *testing.T) {
	_, err := api.NewJWKSProvider("http://127.0.0.1:1/nonexistent")
	if err == nil {
		t.Error("expected error for unreachable JWKS URL")
	}
}

func TestJWKSProvider_NoKidHeader(t *testing.T) {
	key := generateRSAKey(t)
	jwksSrv := serveJWKS(t, "key-1", &key.PublicKey)

	provider, err := api.NewJWKSProvider(jwksSrv.URL)
	if err != nil {
		t.Fatalf("NewJWKSProvider: %v", err)
	}
	defer provider.Close()

	// Token without kid header.
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub": "user-1",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, _ := tok.SignedString(key)

	_, err = jwt.Parse(signed, provider.KeyFunc, jwt.WithValidMethods([]string{"RS256"}))
	if err == nil {
		t.Error("expected error for token without kid")
	}
}
