package main

import (
	"errors"
	"os"
)

// Config holds the startup-time configuration read from environment
// variables (PRD Section 2: declarative, twelve-factor style).
type Config struct {
	Listen      string // JITPACK_LISTEN, default ":8080"
	DBPath      string // JITPACK_DB_PATH, default "jitpack.db"
	SingleUser  bool   // JITPACK_SINGLE_USER, "true" enables
	LocalUserID string // JITPACK_LOCAL_USER_ID, required when SingleUser
	JWTSecret   string // JITPACK_JWT_SECRET, HS256 secret (multi-user)
	JWKSURL     string // JITPACK_JWKS_URL, RS256 JWKS endpoint (multi-user)

	// OIDC code-exchange broker (Sync-API §2); requires JWKSURL.
	OIDCTokenURL     string // JITPACK_OIDC_TOKEN_URL, IdP token endpoint
	OIDCAuthorizeURL string // JITPACK_OIDC_AUTHORIZE_URL, IdP authorize endpoint
	OIDCClientID     string // JITPACK_OIDC_CLIENT_ID

	// Web Push (NFR-4.6): operator contact for the VAPID sub claim,
	// e.g. "mailto:ops@example.com". Optional — the keys themselves are
	// self-generated on first use.
	PushContact string // JITPACK_PUSH_CONTACT
}

// LoadConfig reads configuration from the environment. It returns an
// error if the combination of values is invalid (e.g. multi-user mode
// without a JWT secret).
func LoadConfig() (Config, error) {
	return loadConfigFrom(os.Getenv)
}

func loadConfigFrom(getenv func(string) string) (Config, error) {
	c := Config{
		Listen:      envOr(getenv, "JITPACK_LISTEN", ":8080"),
		DBPath:      envOr(getenv, "JITPACK_DB_PATH", "jitpack.db"),
		SingleUser:  getenv("JITPACK_SINGLE_USER") == "true",
		LocalUserID: getenv("JITPACK_LOCAL_USER_ID"),
		JWTSecret:   getenv("JITPACK_JWT_SECRET"),
		JWKSURL:     getenv("JITPACK_JWKS_URL"),

		OIDCTokenURL:     getenv("JITPACK_OIDC_TOKEN_URL"),
		OIDCAuthorizeURL: getenv("JITPACK_OIDC_AUTHORIZE_URL"),
		OIDCClientID:     getenv("JITPACK_OIDC_CLIENT_ID"),

		PushContact: getenv("JITPACK_PUSH_CONTACT"),
	}

	if c.SingleUser {
		if c.LocalUserID == "" {
			return Config{}, errors.New("JITPACK_LOCAL_USER_ID is required in single-user mode")
		}
	} else {
		if c.JWTSecret == "" && c.JWKSURL == "" {
			return Config{}, errors.New("JITPACK_JWT_SECRET or JITPACK_JWKS_URL is required in multi-user mode")
		}
		if c.JWTSecret != "" && c.JWKSURL != "" {
			return Config{}, errors.New("JITPACK_JWT_SECRET and JITPACK_JWKS_URL are mutually exclusive")
		}
	}

	oidcVars := []string{c.OIDCTokenURL, c.OIDCAuthorizeURL, c.OIDCClientID}
	oidcSet := 0
	for _, v := range oidcVars {
		if v != "" {
			oidcSet++
		}
	}
	if oidcSet > 0 {
		if oidcSet < len(oidcVars) {
			return Config{}, errors.New("JITPACK_OIDC_TOKEN_URL, JITPACK_OIDC_AUTHORIZE_URL, and JITPACK_OIDC_CLIENT_ID must be set together")
		}
		if c.JWKSURL == "" {
			return Config{}, errors.New("the OIDC exchange requires JITPACK_JWKS_URL (brokered tokens are JWKS-verified)")
		}
	}
	return c, nil
}

func envOr(getenv func(string) string, key, fallback string) string {
	if v := getenv(key); v != "" {
		return v
	}
	return fallback
}
