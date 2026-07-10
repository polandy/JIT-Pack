package api

import "testing"

// FR-23.1: the allowlist matches the token's email claim
// case-insensitively; no claim ⇒ no role.
func TestIsAdminEmail(t *testing.T) {
	s := &Server{}
	s.SetAdminEmails([]string{"Andy@Example.com"})

	tests := []struct {
		email string
		want  bool
	}{
		{"andy@example.com", true},
		{"ANDY@EXAMPLE.COM", true},
		{"sarah@example.com", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := s.isAdminEmail(tt.email); got != tt.want {
			t.Errorf("isAdminEmail(%q) = %v, want %v", tt.email, got, tt.want)
		}
	}
}
