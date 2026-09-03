package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// FR-23.1 grants the instance-admin role by matching the verified email
// against a configured allowlist. Since ADR-007 the claims come from the
// IdP's UserInfo endpoint at login and at each refresh — the rule is
// unchanged: OIDC Core §5.7 gives `email` no verification guarantee on
// its own, so an unverified address must never mint an admin.
//
// These tests assert the consequence rather than the column: whether the
// admin-only surface opens for the issued session.

func TestLogin_AdminEmail_GrantsRoleOnlyWhenVerified(t *testing.T) {
	const adminEmail = "andy@example.com"

	tests := []struct {
		name       string
		userinfo   map[string]any
		wantStatus int
	}{
		{
			// The intended FR-23.1 path — and the reason the rule cannot
			// simply stop trusting the claim altogether.
			name:       "verified allowlisted address is admin",
			userinfo:   map[string]any{"email": adminEmail, "email_verified": true},
			wantStatus: http.StatusOK,
		},
		{
			// The escalation: a self-service account naming the admin
			// address. Same claim value, no proof.
			name:       "unverified allowlisted address is not admin",
			userinfo:   map[string]any{"email": adminEmail, "email_verified": false},
			wantStatus: http.StatusForbidden,
		},
		{
			// Absent is not verified: a provider that asserts nothing
			// has verified nothing.
			name:       "missing email_verified is not admin",
			userinfo:   map[string]any{"email": adminEmail},
			wantStatus: http.StatusForbidden,
		},
		{
			// Some IdPs serialise the flag as a JSON string; it is still
			// an assertion of verification and must be honoured.
			name:       "string-typed true is honoured",
			userinfo:   map[string]any{"email": adminEmail, "email_verified": "true"},
			wantStatus: http.StatusOK,
		},
		{
			name:       "verified non-allowlisted address is not admin",
			userinfo:   map[string]any{"email": "mallory@example.com", "email_verified": true},
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idp := newFakeIDP(t)
			idp.userinfo = tc.userinfo
			srv, _, _ := newBrokerParts(t, idp, adminEmail)

			access, _ := login(t, srv.URL)
			resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/admin/users", access, nil)
			if resp.StatusCode != tc.wantStatus {
				t.Errorf("GET /admin/users = %d, want %d (body %s)", resp.StatusCode, tc.wantStatus, raw)
			}
		})
	}
}

// The admin stamp is refreshed from UserInfo at every session refresh
// (ADR-007), so losing verification — or leaving the allowlist — takes
// the role away at refresh cadence rather than never.
func TestRefresh_AdminRoleIsRevokedWhenVerificationDisappears(t *testing.T) {
	const adminEmail = "andy@example.com"
	idp := newFakeIDP(t)
	idp.userinfo = map[string]any{"email": adminEmail, "email_verified": true}
	srv, _, _ := newBrokerParts(t, idp, adminEmail)

	access, refresh := login(t, srv.URL)
	if resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/admin/users", access, nil); resp.StatusCode != http.StatusOK {
		t.Fatalf("verified admin = %d, want 200 (body %s)", resp.StatusCode, raw)
	}

	// The IdP withdraws verification; the next refresh re-stamps.
	idp.userinfo["email_verified"] = false
	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": refresh,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("refresh: status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}

	if resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/admin/users", out.AccessToken, nil); resp.StatusCode != http.StatusForbidden {
		t.Errorf("after verification withdrawn = %d, want 403 (body %s)", resp.StatusCode, raw)
	}
}
