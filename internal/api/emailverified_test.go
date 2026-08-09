package api_test

import (
	"crypto/rsa"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"jitpack/internal/api"
	"jitpack/internal/store"

	"github.com/golang-jwt/jwt/v5"
)

// FR-23.1 grants the instance-admin role by matching the token's `email`
// claim against a configured allowlist. OIDC Core §5.7 is explicit that
// `email` carries no verification guarantee on its own — `email_verified`
// does — so an IdP that lets an account set its own address would let
// anyone claim the configured admin address and inherit the role. The
// allowlist must therefore ignore an unverified claim.
//
// These tests assert the consequence rather than the column: whether the
// admin-only surface opens.

// rsaTokenWith signs an RS256 token carrying arbitrary extra claims, so a
// test can state exactly which claim combination it is about.
func rsaTokenWith(t *testing.T, key *rsa.PrivateKey, kid, sub string, extra map[string]any) string {
	t.Helper()
	claims := jwt.MapClaims{"sub": sub, "exp": time.Now().Add(time.Hour).Unix()}
	for k, v := range extra {
		claims[k] = v
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = kid
	signed, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign RS256 token: %v", err)
	}
	return signed
}

// newAdminAllowlistServer builds a JWKS-mode server whose FR-23.1 allowlist
// holds a single address, and returns a signer for tokens it will accept.
func newAdminAllowlistServer(t *testing.T, adminEmail string) (string, func(sub string, extra map[string]any) string) {
	t.Helper()
	key := generateRSAKey(t)
	kid := "idp-key-1"
	jwksSrv := serveJWKS(t, kid, &key.PublicKey)
	provider, err := api.NewJWKSProvider(jwksSrv.URL)
	if err != nil {
		t.Fatalf("NewJWKSProvider: %v", err)
	}
	t.Cleanup(provider.Close)

	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	apiSrv := api.NewWithJWKS(st, provider)
	apiSrv.SetAdminEmails([]string{adminEmail})
	srv := httptest.NewServer(apiSrv.Handler())
	t.Cleanup(srv.Close)

	return srv.URL, func(sub string, extra map[string]any) string {
		return rsaTokenWith(t, key, kid, sub, extra)
	}
}

func TestAuthed_AdminEmail_GrantsRoleOnlyWhenVerified(t *testing.T) {
	const adminEmail = "andy@example.com"

	tests := []struct {
		name       string
		claims     map[string]any
		wantStatus int
	}{
		{
			// The allowlisted address with the verification flag — the
			// intended FR-23.1 path, and the reason this cannot simply
			// stop trusting the claim altogether.
			name:       "verified allowlisted address is admin",
			claims:     map[string]any{"email": adminEmail, "email_verified": true},
			wantStatus: http.StatusOK,
		},
		{
			// The escalation: an IdP that does not verify addresses, or a
			// self-service account that set one. Same claim value, no proof.
			name:       "unverified allowlisted address is not admin",
			claims:     map[string]any{"email": adminEmail, "email_verified": false},
			wantStatus: http.StatusForbidden,
		},
		{
			// Absent is not verified. Providers omit the flag when they have
			// nothing to assert, which must read as "no" and not as "yes".
			name:       "missing email_verified is not admin",
			claims:     map[string]any{"email": adminEmail},
			wantStatus: http.StatusForbidden,
		},
		{
			// Some IdPs serialise the flag as a JSON string. It is still a
			// claim of verification and must be honoured, not silently
			// dropped into the deny branch for the wrong reason.
			name:       "string-typed true is honoured",
			claims:     map[string]any{"email": adminEmail, "email_verified": "true"},
			wantStatus: http.StatusOK,
		},
		{
			name:       "verified non-allowlisted address is not admin",
			claims:     map[string]any{"email": "mallory@example.com", "email_verified": true},
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			baseURL, sign := newAdminAllowlistServer(t, adminEmail)
			token := sign("auth|"+tc.name, tc.claims)

			resp, raw := doJSON(t, http.MethodGet, baseURL+"/api/v1/admin/users", token, nil)
			if resp.StatusCode != tc.wantStatus {
				t.Errorf("GET /admin/users = %d, want %d (body %s)", resp.StatusCode, tc.wantStatus, raw)
			}
		})
	}
}

// The role is re-stamped on every request, so losing verification must take
// the role away again — otherwise one unverified request would be enough to
// leave a permanent admin behind.
func TestAuthed_AdminRoleIsRevokedWhenVerificationDisappears(t *testing.T) {
	const adminEmail = "andy@example.com"
	baseURL, sign := newAdminAllowlistServer(t, adminEmail)

	verified := sign("auth|andy", map[string]any{"email": adminEmail, "email_verified": true})
	if resp, raw := doJSON(t, http.MethodGet, baseURL+"/api/v1/admin/users", verified, nil); resp.StatusCode != http.StatusOK {
		t.Fatalf("verified admin = %d, want 200 (body %s)", resp.StatusCode, raw)
	}

	unverified := sign("auth|andy", map[string]any{"email": adminEmail, "email_verified": false})
	if resp, raw := doJSON(t, http.MethodGet, baseURL+"/api/v1/admin/users", unverified, nil); resp.StatusCode != http.StatusForbidden {
		t.Errorf("same account, verification withdrawn = %d, want 403 (body %s)", resp.StatusCode, raw)
	}
}
