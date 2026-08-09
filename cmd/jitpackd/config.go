package main

import (
	"errors"
	"os"
	"strings"
)

// Config holds the startup-time configuration read from environment
// variables (PRD Section 2: declarative, twelve-factor style).
type Config struct {
	Listen      string // JITPACK_LISTEN, default ":8080"
	DBPath      string // JITPACK_DB_PATH, default "jitpack.db"
	SingleUser  bool   // JITPACK_SINGLE_USER, "true" enables
	LocalUserID string // JITPACK_LOCAL_USER_ID, required when SingleUser

	// SessionSecret signs the HS256 session tokens JIT-Pack issues for
	// its own API (ADR-007). Required in multi-user mode: with the OIDC
	// broker configured it signs what the broker hands out after login,
	// and without one it validates externally minted tokens (tests,
	// scripted deployments).
	SessionSecret string // JITPACK_SESSION_SECRET

	// OIDC login broker (ADR-007, Sync-API §2). The issuer is the only
	// endpoint the operator provides — authorize/token/JWKS/userinfo are
	// resolved from {issuer}/.well-known/openid-configuration at startup.
	// JIT-Pack is a confidential client (client_secret_basic), so the
	// secret lives here, server-side, never in the SPA.
	OIDCIssuer       string // JITPACK_OIDC_ISSUER, no trailing slash
	OIDCClientID     string // JITPACK_OIDC_CLIENT_ID
	OIDCClientSecret string // JITPACK_OIDC_CLIENT_SECRET

	// Web Push (NFR-4.6): operator contact for the VAPID sub claim,
	// e.g. "mailto:ops@example.com". Optional — the keys themselves are
	// self-generated on first use.
	PushContact string // JITPACK_PUSH_CONTACT

	// Instance admins (FR-23.1): comma-separated e-mail addresses,
	// matched case-insensitively against the verified email the UserInfo
	// endpoint reports at login. Empty ⇒ the feature is dormant.
	AdminEmails []string // JITPACK_ADMIN_EMAILS
}

// LoadConfig reads configuration from the environment. It returns an
// error if the combination of values is invalid (e.g. multi-user mode
// without a session secret).
func LoadConfig() (Config, error) {
	return loadConfigFrom(os.Getenv)
}

func loadConfigFrom(getenv func(string) string) (Config, error) {
	c := Config{
		Listen:      envOr(getenv, "JITPACK_LISTEN", ":8080"),
		DBPath:      envOr(getenv, "JITPACK_DB_PATH", "jitpack.db"),
		SingleUser:  getenv("JITPACK_SINGLE_USER") == "true",
		LocalUserID: getenv("JITPACK_LOCAL_USER_ID"),

		SessionSecret: getenv("JITPACK_SESSION_SECRET"),

		OIDCIssuer:       strings.TrimRight(getenv("JITPACK_OIDC_ISSUER"), "/"),
		OIDCClientID:     getenv("JITPACK_OIDC_CLIENT_ID"),
		OIDCClientSecret: getenv("JITPACK_OIDC_CLIENT_SECRET"),

		PushContact: getenv("JITPACK_PUSH_CONTACT"),

		AdminEmails: splitList(getenv("JITPACK_ADMIN_EMAILS")),
	}

	if c.SingleUser {
		if c.LocalUserID == "" {
			return Config{}, errors.New("JITPACK_LOCAL_USER_ID is required in single-user mode")
		}
		return c, nil
	}

	if c.SessionSecret == "" {
		return Config{}, errors.New("JITPACK_SESSION_SECRET is required in multi-user mode (it signs the sessions JIT-Pack issues, see ADR-007)")
	}

	oidcVars := []string{c.OIDCIssuer, c.OIDCClientID, c.OIDCClientSecret}
	oidcSet := 0
	for _, v := range oidcVars {
		if v != "" {
			oidcSet++
		}
	}
	if oidcSet > 0 && oidcSet < len(oidcVars) {
		return Config{}, errors.New("JITPACK_OIDC_ISSUER, JITPACK_OIDC_CLIENT_ID, and JITPACK_OIDC_CLIENT_SECRET must be set together")
	}
	return c, nil
}

func envOr(getenv func(string) string, key, fallback string) string {
	if v := getenv(key); v != "" {
		return v
	}
	return fallback
}

// splitList parses a comma-separated env value, trimming whitespace and
// dropping empty entries; nil for an unset variable.
func splitList(raw string) []string {
	if raw == "" {
		return nil
	}
	var out []string
	for part := range strings.SplitSeq(raw, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}
