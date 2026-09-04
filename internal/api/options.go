package api

import (
	"strings"
	"time"
)

// Options are the startup-time choices an operator makes for a Server,
// passed to whichever constructor the mode calls for (invariant 5). They
// are read once, at construction: a Server is not reconfigured while it
// serves, and there is no per-request equivalent of any of them.
//
// The zero value is a complete configuration — every field's zero means
// "the documented default", named beside it.
type Options struct {
	// Currency is the instance-wide ISO-4217 label amounts carry
	// (FR-21.9). Empty leaves them unit-less; an unnamed currency is
	// not a default one.
	Currency string
	// PushContact is the RFC 8292 sub claim shown to push services,
	// e.g. "mailto:ops@example.com". Empty falls back to
	// defaultPushContact.
	PushContact string
	// WSIdle shrinks the §9 WebSocket idle timeout, so a test does not
	// have to hold a socket for five minutes to see it reaped. Zero
	// means wsIdleTimeout.
	WSIdle time.Duration
	// AdminEmails declares which accounts hold the instance-admin role
	// (FR-23.1), matched case-insensitively against the token's email
	// claim. The list is authoritative in both directions and is
	// stamped into users.is_instance_admin at every login. Multi-user
	// mode only: Single-User Mode presents no token to match against.
	AdminEmails []string
	// Now overrides the server's clock (G-4). Nil means real UTC time,
	// which is what production passes — the field exists so a test can
	// assert an exact timestamp instead of asserting one is non-empty.
	Now func() time.Time
	// OIDC turns on the /auth/token, /auth/refresh and /auth/config
	// endpoints, brokering logins against the discovered IdP as a
	// confidential client (client_secret_basic, ADR-007). Nil leaves
	// them answering "not configured", which is how the tests drive
	// authenticated endpoints with externally minted tokens. Multi-user
	// mode only: Single-User Mode bypasses authentication entirely.
	OIDC *OIDCConfig
}

// OIDCConfig is the confidential-client configuration the login broker
// resolves its endpoints from. The client secret never leaves the
// server.
type OIDCConfig struct {
	// Discovery is the IdP's answer to the one configured endpoint;
	// everything the broker calls is read from it.
	Discovery Discovery
	ClientID  string
	// ClientSecret authenticates JIT-Pack itself at the token endpoint.
	ClientSecret string
	// JWKS verifies the ID token's signature.
	JWKS *JWKSProvider
}

// emailSet lowercases the FR-23.1 allowlist for matching.
func emailSet(emails []string) map[string]bool {
	set := make(map[string]bool, len(emails))
	for _, e := range emails {
		set[strings.ToLower(e)] = true
	}
	return set
}
