package api_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/api"
)

// MintAPIToken is the whole rule of FR-23.7 in one pure function, so that it
// is reachable by a test with no server and no database — the handler and the
// `jitpackd token create` subcommand are both thin callers of it. The clock
// and the token id are parameters rather than ambient calls, which is what
// lets every case below state its expectation exactly instead of racing one.

// claimsOf verifies the signature with secret and returns the payload.
func claimsOf(t *testing.T, tokenStr string, secret []byte) jwt.MapClaims {
	t.Helper()
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(tokenStr, claims,
		func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{"HS256"})); err != nil {
		t.Fatalf("parse minted token: %v", err)
	}
	return claims
}

func TestMintAPIToken_CarriesTheClaimsThatIdentifyIt(t *testing.T) {
	now := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)

	out, err := api.MintAPIToken(testSecret,
		api.APITokenRequest{Name: "cleanup script", Expiry: api.APITokenExpiry90d},
		userA, "0123456789abcdef", now)
	if err != nil {
		t.Fatalf("MintAPIToken: %v", err)
	}

	claims := claimsOf(t, out.Token, testSecret)
	if got := claims["sub"]; got != userA {
		t.Errorf("sub = %v, want %q", got, userA)
	}
	// The marker that lets the server tell a machine credential from a
	// browser session — without it the two are indistinguishable.
	if got := claims["kind"]; got != api.APITokenKind {
		t.Errorf("kind = %v, want %q", got, api.APITokenKind)
	}
	if got := claims["jti"]; got != "0123456789abcdef" {
		t.Errorf("jti = %v — the id a later denylist would key on is missing", got)
	}
	if got := claims["name"]; got != "cleanup script" {
		t.Errorf("name = %v, want the name the person gave it", got)
	}
	if _, ok := claims["iat"]; !ok {
		t.Error("iat missing")
	}
}

func TestMintAPIToken_ExpiryFollowsTheChosenLifetime(t *testing.T) {
	now := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)

	for _, tc := range []struct {
		expiry api.APITokenExpiry
		want   time.Time // zero means: no exp claim at all
	}{
		{api.APITokenExpiry30d, now.AddDate(0, 0, 30)},
		{api.APITokenExpiry90d, now.AddDate(0, 0, 90)},
		{api.APITokenExpiry365d, now.AddDate(0, 0, 365)},
		{api.APITokenExpiryNever, time.Time{}},
	} {
		t.Run(string(tc.expiry), func(t *testing.T) {
			out, err := api.MintAPIToken(testSecret,
				api.APITokenRequest{Name: "n", Expiry: tc.expiry}, userA, "aaaaaaaaaaaaaaaa", now)
			if err != nil {
				t.Fatalf("MintAPIToken: %v", err)
			}
			claims := claimsOf(t, out.Token, testSecret)

			if tc.want.IsZero() {
				if _, ok := claims["exp"]; ok {
					t.Error("a token that never expires carries an exp claim")
				}
				if out.ExpiresAt != "" {
					t.Errorf("expires_at = %q, want empty for never", out.ExpiresAt)
				}
				return
			}
			if out.ExpiresAt != tc.want.Format(time.RFC3339) {
				t.Errorf("expires_at = %q, want %q", out.ExpiresAt, tc.want.Format(time.RFC3339))
			}
			exp, err := claims.GetExpirationTime()
			if err != nil || exp == nil {
				t.Fatalf("exp claim: %v", err)
			}
			if !exp.Equal(tc.want) {
				t.Errorf("exp = %v, want %v", exp.Time, tc.want)
			}
		})
	}
}

// A "never" token depends on the parser not insisting on an exp claim.
// golang-jwt only requires one under WithExpirationRequired(), and hardening
// `authed` with that option later would silently kill every never-expiring
// token already issued — which, with no listing, nobody could find out about.
func TestMintAPIToken_NeverExpiringTokenIsAccepted(t *testing.T) {
	srv := newTestServer(t)
	out, err := api.MintAPIToken(testSecret,
		api.APITokenRequest{Name: "forever", Expiry: api.APITokenExpiryNever},
		userA, "bbbbbbbbbbbbbbbb", time.Now().UTC())
	if err != nil {
		t.Fatalf("MintAPIToken: %v", err)
	}

	resp, raw := doJSON(t, "GET", srv.URL+"/api/v1/me", out.Token, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, want 200 — a token with no exp was refused, body %s",
			resp.StatusCode, raw)
	}
}

func TestMintAPIToken_RefusesANameItCannotCarry(t *testing.T) {
	now := time.Now().UTC()
	for _, tc := range []struct {
		name  string
		given string
		want  error
	}{
		{"empty", "", api.ErrTokenNameRequired},
		{"whitespace only", "   ", api.ErrTokenNameRequired},
		{"longer than the cap", strings.Repeat("ä", 61), api.ErrTokenNameTooLong},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := api.MintAPIToken(testSecret,
				api.APITokenRequest{Name: tc.given, Expiry: api.APITokenExpiry90d},
				userA, "cccccccccccccccc", now)
			if !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestMintAPIToken_RefusesAnExpiryItDoesNotOffer(t *testing.T) {
	_, err := api.MintAPIToken(testSecret,
		api.APITokenRequest{Name: "n", Expiry: api.APITokenExpiry("forever-and-ever")},
		userA, "dddddddddddddddd", time.Now().UTC())
	if !errors.Is(err, api.ErrUnknownExpiry) {
		t.Errorf("err = %v, want ErrUnknownExpiry", err)
	}
}

// The token is only as good as the secret that signed it: a server whose
// secret was rotated must not accept the old one. This is the whole
// revocation story (ADR-039), so it is asserted rather than assumed.
func TestMintAPIToken_IsRefusedAfterTheSecretChanges(t *testing.T) {
	srv := newTestServer(t)
	out, err := api.MintAPIToken([]byte("a-different-secret-entirely"),
		api.APITokenRequest{Name: "stale", Expiry: api.APITokenExpiry90d},
		userA, "eeeeeeeeeeeeeeee", time.Now().UTC())
	if err != nil {
		t.Fatalf("MintAPIToken: %v", err)
	}

	resp, _ := doJSON(t, "GET", srv.URL+"/api/v1/me", out.Token, nil)
	if resp.StatusCode != 401 {
		t.Errorf("status = %d, want 401 — a token signed with another secret was accepted",
			resp.StatusCode)
	}
}

// The claim that distinguishes the two credentials only works if the login
// broker never sets it. Asserted here because the two mints live in different
// files and nothing else would notice them converging.
func TestIssuedSessionTokensCarryNoKind(t *testing.T) {
	srv, _ := newTestServerWithStore(t)
	_ = srv
	claims := claimsOf(t, token(t, userA, testSecret), testSecret)
	if _, ok := claims["kind"]; ok {
		t.Error("a session token carries a kind claim — the absence is what marks it a session")
	}
}
