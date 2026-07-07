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
	"jitpack/internal/store"
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

// Integration test: full HTTP flow with RS256 through the API server.
func TestRS256_AuthThroughAPI(t *testing.T) {
	key := generateRSAKey(t)
	kid := "authelia-key-1"
	jwksSrv := serveJWKS(t, kid, &key.PublicKey)

	provider, err := api.NewJWKSProvider(jwksSrv.URL)
	if err != nil {
		t.Fatalf("NewJWKSProvider: %v", err)
	}
	defer provider.Close()

	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	for _, q := range []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-a', 'auth|a', 'Andy')`,
		`INSERT INTO trips (id, name, start_date, end_date) VALUES ('trip1', 'Test', '2026-01-01', '2026-01-10')`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip1', 'user-a', 'owner')`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	srv := httptest.NewServer(api.NewWithJWKS(st, provider).Handler())
	t.Cleanup(srv.Close)

	// Valid RS256 token → 200
	tok := rsaToken(t, key, kid, "user-a")
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/sync/trips/trip1?cursor=0", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("valid RS256 token: status = %d, want 200", resp.StatusCode)
	}

	// HS256 token (wrong algorithm) → 401
	hs256tok := token(t, "user-a", testSecret)
	req, _ = http.NewRequest(http.MethodGet, srv.URL+"/api/v1/sync/trips/trip1?cursor=0", nil)
	req.Header.Set("Authorization", "Bearer "+hs256tok)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("HS256 token against RS256 server: status = %d, want 401", resp.StatusCode)
	}

	// No token → 401
	req, _ = http.NewRequest(http.MethodGet, srv.URL+"/api/v1/sync/trips/trip1?cursor=0", nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("no token: status = %d, want 401", resp.StatusCode)
	}
}
