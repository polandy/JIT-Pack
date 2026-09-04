// Package api — auth.go is the OIDC login broker (ADR-007, Sync-API §2).
// The client sends code + PKCE verifier; the broker exchanges them as a
// confidential client, validates the ID token against the IdP's JWKS
// (signature, issuer, audience), reads identity from the UserInfo
// endpoint, JIT-provisions the user, and issues JIT-Pack's own session
// tokens. The IdP's access token is used for exactly one UserInfo call
// per exchange and never leaves the broker — per Authelia's guidance,
// the client is not its intended recipient.
package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/store"
)

const (
	// sessionAccessTTL bounds how long a revoked-at-the-IdP account can
	// keep using an already-issued access token; deactivation inside
	// JIT-Pack (FR-23.3) is checked per request regardless.
	sessionAccessTTL = 15 * time.Minute
	// sessionRefreshTTL is the absolute bound of a refresh chain,
	// sliding at each rotation — long enough to survive offline trips
	// (NFR-4.4), matching the spec's long-lived-refresh guidance.
	sessionRefreshTTL = 90 * 24 * time.Hour
)

// handleAuthToken completes a login: the client's code and PKCE
// verifier go to the broker, and what comes back is JIT-Pack's own
// session token pair.
func (s *Server) handleAuthToken(w http.ResponseWriter, r *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, ErrNotConfigured, msgOIDCNotConfigured)
		return
	}
	var req struct {
		Code         string `json:"code"`
		CodeVerifier string `json:"code_verifier"`
		RedirectURI  string `json:"redirect_uri"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "code, code_verifier, redirect_uri required")
		return
	}

	id, err := s.oidc.exchange(r.Context(), req.Code, req.CodeVerifier, req.RedirectURI)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	userID, err := s.provisionFromUserinfo(r.Context(), id.sub, id.info)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, msgProvisioningFailed)
		return
	}
	s.issueSession(r.Context(), w, userID, id.idpRefreshToken)
}

func (s *Server) handleAuthRefresh(w http.ResponseWriter, r *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, ErrNotConfigured, msgOIDCNotConfigured)
		return
	}
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "refresh_token required")
		return
	}
	now := s.now().UTC()
	oldHash := hashRefreshToken(req.RefreshToken)

	// Peek before consuming: on an IdP outage the chain must survive
	// untouched, so nothing is rotated until the IdP has answered.
	sess, err := s.store.GetSessionByHash(r.Context(), oldHash, now)
	if err != nil {
		writeStoreError(w, err, "session lookup failed")
		return
	}

	newIDPRefresh := sess.IDPRefreshToken
	if sess.IDPRefreshToken != "" {
		id, err := s.oidc.refresh(r.Context(), sess.IDPRefreshToken)
		switch {
		case errors.Is(err, errIDPRejected):
			// The IdP disowned the session — only this ends it (§2).
			s.endSession(r.Context(), oldHash, sessionEndIDPRejected)
			writeError(w, http.StatusUnauthorized, ErrUnauthorized, sessionEndIDPRejected)
			return
		case err != nil:
			// Offline is normal, not a logout: leave the chain intact.
			writeAuthError(w, err)
			return
		}
		if id.idpRefreshToken != "" {
			newIDPRefresh = id.idpRefreshToken
		}
		// Freshen identity and the FR-23.1 admin stamp from what the
		// IdP just said, when it said anything (see oidcBroker.refresh).
		if id.sub != "" {
			if _, err := s.provisionFromUserinfo(r.Context(), id.sub, id.info); err != nil {
				writeError(w, http.StatusInternalServerError, ErrInternal, msgProvisioningFailed)
				return
			}
		}
	}

	state, err := s.store.AccountStatus(r.Context(), sess.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "account lookup failed")
		return
	}
	switch state {
	case store.AccountDeactivated:
		s.endSession(r.Context(), oldHash, sessionEndDeactivated)
		writeError(w, http.StatusForbidden, ErrAccountDeactivated, sessionEndDeactivated)
		return
	case store.AccountUnknown:
		// The row went away underneath a live chain. Refreshing it forever
		// would keep minting access tokens for nobody, so the chain ends
		// here rather than at its own expiry.
		s.endSession(r.Context(), oldHash, sessionEndAccountGone)
		writeError(w, http.StatusUnauthorized, ErrUnauthorized, sessionEndAccountGone)
		return
	case store.AccountActive:
	}

	newRefresh := newRefreshToken()
	if _, err := s.store.RotateSession(r.Context(), oldHash, hashRefreshToken(newRefresh),
		newIDPRefresh, now.Add(sessionRefreshTTL), now); err != nil {
		// Consumed by a concurrent rotation between peek and here —
		// indistinguishable from a replay, and answered the same way.
		writeError(w, http.StatusUnauthorized, ErrUnauthorized, "unknown or expired session")
		return
	}
	s.writeSessionTokens(w, sess.UserID, newRefresh, now)
}

// Why a refresh ends the session it was given. Each reason is both the
// message the client is refused with and the one the cleanup is logged
// under, so the two can never describe different events.
const (
	sessionEndIDPRejected = "IdP rejected the session"
	sessionEndDeactivated = "account is deactivated"
	sessionEndAccountGone = "account no longer exists"
)

// Messages more than one handler answers with, named once
// (CODING_PRINCIPLES §4a); msgSessionCleanupFailed is also asserted by
// the tests.
const (
	msgSessionCleanupFailed = "session cleanup failed"
	msgOIDCNotConfigured    = "OIDC login is not configured"
	msgProvisioningFailed   = "user provisioning failed"
)

// authErrorResponses is the one place a broker failure becomes an HTTP
// answer. A table rather than a switch per handler, because the same
// failure must read the same way whichever endpoint met it — and
// because the pair that must never be conflated (rejection vs outage)
// is then two adjacent lines rather than two files apart.
var authErrorResponses = []errorResponse{
	{errIDPRejected, http.StatusUnauthorized, ErrUnauthorized, "IdP rejected the request"},
	{errIDPUnreachable, http.StatusBadGateway, ErrIDPUnreachable, "IdP token endpoint unreachable"},
	{errNoIDToken, http.StatusBadGateway, ErrIDPError, "IdP returned no id_token — is the openid scope configured for this client?"},
	{errIDTokenInvalid, http.StatusUnauthorized, ErrUnauthorized, "ID token failed verification"},
	{errNoSubject, http.StatusUnauthorized, ErrUnauthorized, "ID token has no subject"},
	{errSubjectMismatch, http.StatusUnauthorized, ErrUnauthorized, "UserInfo subject does not match ID token"},
	{errUserinfoUnreachable, http.StatusBadGateway, ErrIDPUnreachable, "IdP UserInfo endpoint unreachable"},
}

// writeAuthError answers a broker failure. An error the table does not
// know is a bug in this package rather than anything the caller did, so
// it answers 500 instead of guessing a status.
func writeAuthError(w http.ResponseWriter, err error) {
	if !answerFrom(w, authErrorResponses, err) {
		writeError(w, http.StatusInternalServerError, ErrInternal, "login failed")
	}
}

// endSession deletes the refresh row behind a session that has just been
// refused. The refusal has already been decided and does not depend on
// this succeeding — the client is logged out either way — so a failure is
// logged rather than returned: it leaves a row alive that should be dead,
// and the log line is the only trace it would otherwise have.
func (s *Server) endSession(ctx context.Context, refreshHash, reason string) {
	if err := s.store.DeleteSession(ctx, refreshHash); err != nil {
		slog.Error(msgSessionCleanupFailed, "reason", reason, "error", err)
	}
}

func (s *Server) handleAuthConfig(w http.ResponseWriter, _ *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, ErrNotConfigured, msgOIDCNotConfigured)
		return
	}
	writeJSON(w, s.oidc.authorizeConfig())
}

// provisionFromUserinfo maps UserInfo claims onto the users row: JIT
// provisioning, display name, e-mail, and the FR-23.1 admin stamp —
// which requires the IdP's email_verified assertion, exactly as the
// token-claim variant did before ADR-007 moved the source here.
//
// A response without an email claim resolves the role to *unknown*
// rather than to false. UserInfo answering 200 with the standard claims
// stripped is a real shape — Authelia returns exactly that for an
// account disabled after the token was issued — and since the re-stamp
// on refresh is best-effort (consequence 6), treating the gap as "not
// an admin" silently demoted every instance admin at their next
// refresh, with no error raised and only a fresh login to recover.
// Revocation still works whenever the IdP does supply an address: that
// is the case FR-23.1 is about.
func (s *Server) provisionFromUserinfo(ctx context.Context, sub string, info map[string]any) (string, error) {
	email := stringClaim(info, "email")
	var isAdmin *bool
	if email != "" {
		admin := s.isAdminEmail(email, emailVerifiedClaim(info))
		isAdmin = &admin
	}
	return s.store.EnsureOIDCUser(ctx, sub, displayNameClaim(info), email, isAdmin)
}

// issueSession opens a refresh chain and hands the client its first
// token pair. Login of a deactivated account is refused outright rather
// than issuing tokens that every endpoint would 403 anyway (FR-23.3).
func (s *Server) issueSession(ctx context.Context, w http.ResponseWriter, userID, idpRefreshToken string) {
	state, err := s.store.AccountStatus(ctx, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "account lookup failed")
		return
	}
	switch state {
	case store.AccountDeactivated:
		writeError(w, http.StatusForbidden, ErrAccountDeactivated, "account is deactivated")
		return
	case store.AccountUnknown:
		// EnsureOIDCUser returned this id moments ago, so an absent row is
		// this server's broken invariant, not a state of the person — a 403
		// here would tell them their account is deactivated when it is not.
		writeError(w, http.StatusInternalServerError, ErrInternal, "account lookup failed")
		return
	case store.AccountActive:
	}
	now := s.now().UTC()
	refresh := newRefreshToken()
	if _, err := s.store.CreateSession(ctx, userID, hashRefreshToken(refresh),
		idpRefreshToken, now.Add(sessionRefreshTTL), now); err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "session creation failed")
		return
	}
	s.writeSessionTokens(w, userID, refresh, now)
}

func (s *Server) writeSessionTokens(w http.ResponseWriter, userID, refresh string, now time.Time) {
	access := jwt.NewWithClaims(sessionSigningMethod, jwt.MapClaims{
		"sub": userID,
		"iat": now.Unix(),
		"exp": now.Add(sessionAccessTTL).Unix(),
	})
	signed, err := access.SignedString(s.sessionSecret)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "token signing failed")
		return
	}
	writeJSON(w, SessionTokens{
		AccessToken:  signed,
		RefreshToken: refresh,
		ExpiresIn:    int(sessionAccessTTL.Seconds()),
	})
}

// --- refresh-token material ----------------------------------------------

// newRefreshToken mints the client-held half of the chain: 256 bits,
// URL-safe. Only its hash is stored (see migration 017).
func newRefreshToken() string {
	b := make([]byte, 32)
	rand.Read(b) // crypto/rand.Read never fails on supported platforms
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// --- claim readers --------------------------------------------------------

func stringClaim(claims map[string]any, key string) string {
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}

func displayNameClaim(claims map[string]any) string {
	for _, key := range []string{"name", "preferred_username"} {
		if v := stringClaim(claims, key); v != "" {
			return v
		}
	}
	return ""
}

// emailVerifiedClaim reports whether the IdP asserts that it verified
// the email claim (OIDC Core §5.7). Providers serialise the flag as a
// JSON bool or, less often, as a string, so both are accepted; anything
// else — an absent claim included — reads as unverified, because a
// provider that asserts nothing has not verified anything.
func emailVerifiedClaim(claims map[string]any) bool {
	switch v := claims["email_verified"].(type) {
	case bool:
		return v
	case string:
		return v == "true"
	}
	return false
}
