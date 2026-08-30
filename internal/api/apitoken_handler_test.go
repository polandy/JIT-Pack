package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"jitpack/internal/api"
)

func mintTokenRequest(name string, expiry api.APITokenExpiry) map[string]any {
	return map[string]any{"name": name, "expiry": string(expiry)}
}

// The whole point, end to end at the HTTP edge: what comes back authenticates
// as the person who asked for it.
func TestMintAPIToken_TheMintedTokenAuthenticatesAsItsOwner_FR23_7(t *testing.T) {
	srv := newTestServer(t)

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/me/tokens",
		token(t, userA, testSecret), mintTokenRequest("cleanup", api.APITokenExpiry90d))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	// A credential does not belong in a cache.
	if got := resp.Header.Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}

	var out api.APITokenResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}
	if out.Token == "" || out.ExpiresAt == "" {
		t.Fatalf("response carries no token or no expiry: %s", raw)
	}

	me, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", out.Token, nil)
	if me.StatusCode != http.StatusOK {
		t.Fatalf("the minted token was refused: status %d, body %s", me.StatusCode, raw)
	}
	var who api.MeResponse
	if err := json.Unmarshal(raw, &who); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}
	if who.UserID != userA {
		t.Errorf("the token authenticates as %q, want %q", who.UserID, userA)
	}
}

// The hardening decision of ADR-039, and the reason it is not a scope: this is
// the single endpoint whose answer is a credential, so the question can be
// asked exactly once. Without it a leaked token renews itself indefinitely and
// `exp` — the only bound an unmanaged token has — stops bounding anything.
func TestMintAPIToken_AnAPITokenCannotMintAnother_FR23_7(t *testing.T) {
	srv := newTestServer(t)

	_, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/me/tokens",
		token(t, userA, testSecret), mintTokenRequest("first", api.APITokenExpiry30d))
	var first api.APITokenResponse
	if err := json.Unmarshal(raw, &first); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/me/tokens",
		first.Token, mintTokenRequest("second", api.APITokenExpiryNever))
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 — a token extended its own life, body %s",
			resp.StatusCode, raw)
	}
	if code := errorCode(t, raw); code != string(api.ErrForbidden) {
		t.Errorf("error code = %q, want %q", code, api.ErrForbidden)
	}
}

// Single-User Mode bypasses `authed` entirely, so this handler is reachable
// with no credential at all — and there is no secret to sign with. It must
// refuse before it reads anything.
func TestMintAPIToken_SingleUserMode_Is501AndMintsNothing(t *testing.T) {
	srv, _ := newSingleUserTestServer(t)

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/me/tokens", "",
		mintTokenRequest("anything", api.APITokenExpiry90d))
	if resp.StatusCode != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501, body %s", resp.StatusCode, raw)
	}
	if code := errorCode(t, raw); code != string(api.ErrNotConfigured) {
		t.Errorf("error code = %q, want %q", code, api.ErrNotConfigured)
	}
}

func TestMintAPIToken_RefusesWhatItCannotSign(t *testing.T) {
	srv := newTestServer(t)

	for _, tc := range []struct {
		name string
		body map[string]any
	}{
		{"an empty name", mintTokenRequest("", api.APITokenExpiry90d)},
		{"a whitespace name", mintTokenRequest("   ", api.APITokenExpiry90d)},
		{"an expiry outside the vocabulary", mintTokenRequest("n", api.APITokenExpiry("decade"))},
		{"no expiry at all", map[string]any{"name": "n"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/me/tokens",
				token(t, userA, testSecret), tc.body)
			if resp.StatusCode != http.StatusUnprocessableEntity {
				t.Errorf("status = %d, want 422, body %s", resp.StatusCode, raw)
			}
		})
	}
}

func TestMintAPIToken_WithoutACredential_Is401(t *testing.T) {
	srv := newTestServer(t)

	resp, _ := doJSON(t, http.MethodPost, srv.URL+"/api/v1/me/tokens", "",
		mintTokenRequest("n", api.APITokenExpiry90d))
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}
