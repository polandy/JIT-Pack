package api

import (
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

// FR-23.1: the allowlist matches the token's email claim
// case-insensitively; no claim ⇒ no role. The address must additionally
// be verified by the IdP (OIDC Core §5.7) — see isAdminEmail.
func TestIsAdminEmail(t *testing.T) {
	s := &Server{}
	s.SetAdminEmails([]string{"Andy@Example.com"})

	tests := []struct {
		email    string
		verified bool
		want     bool
	}{
		{"andy@example.com", true, true},
		{"ANDY@EXAMPLE.COM", true, true},
		{"sarah@example.com", true, false},
		{"", true, false},
		// The allowlisted address without the IdP's verification is
		// self-declared and grants nothing.
		{"andy@example.com", false, false},
		{"ANDY@EXAMPLE.COM", false, false},
		{"", false, false},
	}
	for _, tt := range tests {
		if got := s.isAdminEmail(tt.email, tt.verified); got != tt.want {
			t.Errorf("isAdminEmail(%q, verified=%v) = %v, want %v", tt.email, tt.verified, got, tt.want)
		}
	}
}

// Providers disagree on how they serialise email_verified; anything that
// is not an affirmative assertion must read as unverified.
func TestEmailVerifiedClaim(t *testing.T) {
	tests := []struct {
		name  string
		claim any
		want  bool
	}{
		{"bool true", true, true},
		{"bool false", false, false},
		{"string true", "true", true},
		{"string false", "false", false},
		{"unexpected string", "yes", false},
		{"number", float64(1), false},
		{"null", nil, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims := jwt.MapClaims{"email_verified": tt.claim}
			if got := emailVerifiedClaim(claims); got != tt.want {
				t.Errorf("emailVerifiedClaim(%v) = %v, want %v", tt.claim, got, tt.want)
			}
		})
	}

	// An absent claim is the common case for providers that verify
	// nothing, and must not read as verified.
	if got := emailVerifiedClaim(jwt.MapClaims{}); got {
		t.Error("emailVerifiedClaim with no claim = true, want false")
	}
}
