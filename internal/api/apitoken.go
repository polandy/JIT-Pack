// Package api — apitoken.go mints the long-lived credentials of FR-23.7.
//
// An API token is an ordinary session JWT with a longer life and three extra
// claims. **Nothing about it is stored** (ADR-039): it cannot be listed and
// cannot be revoked one at a time, and rotating the signing secret is what
// revokes them all. The trade is written up in the ADR; what lives here is
// the shape.
package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
)

// The claim names, once — they are written here and read in authed (§4a).
const (
	claimKind = "kind"
	claimJTI  = "jti"
	claimName = "name"
	claimSub  = "sub"
	claimIAT  = "iat"
	claimExp  = "exp"
)

// APITokenKind marks a machine credential. A session token carries no kind
// at all, so the *absence* is what identifies a browser session — which is
// why nothing may ever start stamping one there.
const APITokenKind = "api"

// maxTokenNameRunes caps what a caller can put in the token itself. The name
// travels inside the credential, so an unbounded name is an unbounded token;
// `users.display_name` carries a 50-character CHECK for the same reason.
const maxTokenNameRunes = 60

// Why a mint can be refused. Each is the caller's mistake rather than a
// failure, so each is a sentinel the HTTP edge turns into a 422.
var (
	// ErrTokenNameRequired means the name was empty or only whitespace.
	ErrTokenNameRequired = errors.New("api: token name is required")
	// ErrTokenNameTooLong means the name exceeds maxTokenNameRunes.
	ErrTokenNameTooLong = errors.New("api: token name is too long")
	// ErrUnknownExpiry means the lifetime is outside the offered vocabulary.
	ErrUnknownExpiry = errors.New("api: unknown token expiry")
)

// ParseAPITokenExpiry turns the wire vocabulary into a lifetime. A zero
// duration is APITokenExpiryNever, and means the token carries no exp claim
// at all rather than a very distant one.
func ParseAPITokenExpiry(e APITokenExpiry) (time.Duration, error) {
	switch e {
	case APITokenExpiry1d:
		return 24 * time.Hour, nil
	case APITokenExpiry7d:
		return 7 * 24 * time.Hour, nil
	case APITokenExpiry30d:
		return 30 * 24 * time.Hour, nil
	case APITokenExpiry90d:
		return 90 * 24 * time.Hour, nil
	case APITokenExpiry365d:
		return 365 * 24 * time.Hour, nil
	case APITokenExpiryNever:
		return 0, nil
	}
	return 0, fmt.Errorf("%w: %q", ErrUnknownExpiry, e)
}

// MintAPIToken signs one API token for userID.
//
// It is a plain function, not a method, because the rule has two doors — the
// endpoint and `jitpackd token create` — and a rule reachable only through an
// HTTP handler is one that cannot be tested as itself. Both sources of
// non-determinism are parameters for the same reason: `now` and `jti` are
// given, never read from the environment here.
func MintAPIToken(secret []byte, req APITokenRequest, userID, jti string, now time.Time) (APITokenResponse, error) {
	name, err := validTokenName(req.Name)
	if err != nil {
		return APITokenResponse{}, err
	}
	lifetime, err := ParseAPITokenExpiry(req.Expiry)
	if err != nil {
		return APITokenResponse{}, err
	}

	claims := jwt.MapClaims{
		claimSub:  userID,
		claimKind: APITokenKind,
		claimJTI:  jti,
		claimName: name,
		claimIAT:  now.Unix(),
	}
	var expiresAt string
	if lifetime > 0 {
		exp := now.Add(lifetime)
		claims[claimExp] = exp.Unix()
		expiresAt = exp.Format(time.RFC3339)
	}

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		return APITokenResponse{}, fmt.Errorf("sign api token: %w", err)
	}
	return APITokenResponse{Token: signed, ExpiresAt: expiresAt}, nil
}

// validTokenName trims and bounds what goes into the credential.
func validTokenName(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "", ErrTokenNameRequired
	}
	if utf8.RuneCountInString(trimmed) > maxTokenNameRunes {
		return "", ErrTokenNameTooLong
	}
	// A control character in a name reaches every place the name is later
	// printed — a terminal included.
	for _, r := range trimmed {
		if unicode.IsControl(r) {
			return "", fmt.Errorf("%w: control characters", ErrTokenNameRequired)
		}
	}
	return trimmed, nil
}

// NewTokenID is the jti: sixteen hex characters from crypto/rand. It buys
// nothing today and is what a denylist would key on if this ever grows one,
// which is cheap enough now and impossible to add to tokens already issued.
func NewTokenID() string {
	b := make([]byte, 8)
	rand.Read(b) // crypto/rand.Read never fails on supported platforms
	return hex.EncodeToString(b)
}

// handleMintAPIToken answers the one route in this API whose body is a
// credential (FR-23.7).
func (s *Server) handleMintAPIToken(w http.ResponseWriter, r *http.Request) {
	// First, before the body is even read. In Single-User Mode `authed` is
	// bypassed entirely, so this handler is reachable with no credential at
	// all — and there is no secret to sign with either. An endpoint that is
	// merely inert there would be the normal story; this one would be open.
	if len(s.sessionSecret) == 0 {
		writeError(w, http.StatusNotImplemented, ErrNotConfigured,
			"API tokens need a server that signs sessions")
		return
	}
	userID, _ := r.Context().Value(userIDKey).(string)

	// A token may not mint another one. Without this a leaked credential
	// renews itself before its own expiry and outlives every lifetime its
	// owner ever chose — and `exp` is the only bound an unmanaged token has
	// (ADR-039). Unlike a scope, this is one question with exactly one place
	// to ask it: there is a single endpoint whose answer is a credential.
	if kind, _ := r.Context().Value(tokenKindKey).(string); kind == APITokenKind {
		writeError(w, http.StatusForbidden, ErrForbidden,
			"an API token cannot create another API token")
		return
	}

	var req APITokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "name and expiry required")
		return
	}
	out, err := MintAPIToken(s.sessionSecret, req, userID, NewTokenID(), time.Now().UTC())
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, err.Error())
		return
	}

	// The one response in the system worth keeping out of a cache.
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, out)
}
