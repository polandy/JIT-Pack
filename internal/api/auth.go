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
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
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

// oidcBroker holds the confidential-client configuration resolved from
// discovery. The client secret lives only here, server-side.
type oidcBroker struct {
	issuer       string
	clientID     string
	clientSecret string
	authorizeURL string
	tokenURL     string
	userinfoURL  string
	jwks         *JWKSProvider
}

// newOIDCBroker flattens the operator's OIDCConfig onto the endpoints
// discovery resolved, which is all the broker itself reads.
func newOIDCBroker(cfg OIDCConfig) *oidcBroker {
	return &oidcBroker{
		issuer:       cfg.Discovery.Issuer,
		clientID:     cfg.ClientID,
		clientSecret: cfg.ClientSecret,
		authorizeURL: cfg.Discovery.AuthorizeURL,
		tokenURL:     cfg.Discovery.TokenURL,
		userinfoURL:  cfg.Discovery.UserinfoURL,
		jwks:         cfg.JWKS,
	}
}

// idpTokenSet is the IdP's token-endpoint response. Only the broker
// ever sees it; the session tokens handed to the client are JIT-Pack's
// own (see issueSession).
type idpTokenSet struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
}

// sessionTokens is what the client receives: a short-lived HS256 access
// token and the current link of the refresh chain.
func (s *Server) handleAuthToken(w http.ResponseWriter, r *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, ErrNotConfigured, "OIDC login is not configured")
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

	tokens, ok := s.idpTokenRequest(w, url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {req.Code},
		"code_verifier": {req.CodeVerifier},
		"redirect_uri":  {req.RedirectURI},
	})
	if !ok {
		return
	}
	if tokens.IDToken == "" {
		writeError(w, http.StatusBadGateway, ErrIDPError, "IdP returned no id_token — is the openid scope configured for this client?")
		return
	}

	// The ID token is the credential minted *for this broker*: audience
	// is our client id, issuer is the configured IdP, signature is in
	// the discovered JWKS. Everything identity-shaped rides on it.
	idClaims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(tokens.IDToken, idClaims, s.oidc.jwks.KeyFunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(s.oidc.issuer),
		jwt.WithAudience(s.oidc.clientID)); err != nil {
		writeError(w, http.StatusUnauthorized, ErrUnauthorized, "ID token failed verification")
		return
	}
	sub, err := idClaims.GetSubject()
	if err != nil || sub == "" {
		writeError(w, http.StatusUnauthorized, ErrUnauthorized, "ID token has no subject")
		return
	}

	info, ok := s.fetchUserinfo(w, tokens.AccessToken)
	if !ok {
		return
	}
	// OIDC Core §5.3.2: the UserInfo sub MUST match the ID token's —
	// this is the defense against a swapped-in access token.
	if infoSub, _ := info["sub"].(string); infoSub != sub {
		writeError(w, http.StatusUnauthorized, ErrUnauthorized, "UserInfo subject does not match ID token")
		return
	}

	userID, ok := s.provisionFromUserinfo(w, r.Context(), sub, info)
	if !ok {
		return
	}
	s.issueSession(w, r.Context(), userID, tokens.RefreshToken)
}

func (s *Server) handleAuthRefresh(w http.ResponseWriter, r *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, ErrNotConfigured, "OIDC login is not configured")
		return
	}
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "refresh_token required")
		return
	}
	now := time.Now().UTC()
	oldHash := hashRefreshToken(req.RefreshToken)

	// Peek before consuming: on an IdP outage the chain must survive
	// untouched, so nothing is rotated until the IdP has answered.
	sess, err := s.store.GetSessionByHash(r.Context(), oldHash, now)
	if errors.Is(err, store.ErrSessionNotFound) {
		writeError(w, http.StatusUnauthorized, ErrUnauthorized, "unknown or expired session")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "session lookup failed")
		return
	}

	newIDPRefresh := sess.IDPRefreshToken
	if sess.IDPRefreshToken != "" {
		// Re-validate the account at the IdP once per refresh: a user
		// disabled or logged out at Authelia is cut off at refresh
		// cadence rather than never (ADR-007).
		idpTokens, status := s.idpRefresh(sess.IDPRefreshToken)
		switch status {
		case idpOK:
			if idpTokens.RefreshToken != "" {
				newIDPRefresh = idpTokens.RefreshToken
			}
			// Freshen identity and the FR-23.1 admin stamp from
			// UserInfo. Best-effort: the IdP already vouched for the
			// account above, and failing the whole refresh now would
			// discard the rotated IdP refresh token we must keep.
			if info, err := s.userinfoRequest(idpTokens.AccessToken); err == nil {
				if infoSub, _ := info["sub"].(string); infoSub != "" {
					if _, ok := s.provisionFromUserinfo(w, r.Context(), infoSub, info); !ok {
						return
					}
				}
			}
		case idpRejected:
			// The IdP disowned the session — only this ends it (§2).
			s.endSession(r.Context(), oldHash, sessionEndIDPRejected)
			writeError(w, http.StatusUnauthorized, ErrUnauthorized, sessionEndIDPRejected)
			return
		case idpUnreachable:
			// Offline is normal, not a logout: leave the chain intact.
			writeError(w, http.StatusBadGateway, ErrIDPUnreachable, "IdP token endpoint unreachable")
			return
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

// msgSessionCleanupFailed is asserted by the tests, so it is named once
// (CODING_PRINCIPLES §4a).
const msgSessionCleanupFailed = "session cleanup failed"

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
		writeError(w, http.StatusNotImplemented, ErrNotConfigured, "OIDC login is not configured")
		return
	}
	writeJSON(w, AuthConfigResponse{
		AuthorizeURL: s.oidc.authorizeURL,
		ClientID:     s.oidc.clientID,
	})
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
func (s *Server) provisionFromUserinfo(w http.ResponseWriter, ctx context.Context, sub string, info map[string]any) (string, bool) {
	email := stringClaim(info, "email")
	var isAdmin *bool
	if email != "" {
		admin := s.isAdminEmail(email, emailVerifiedClaim(info))
		isAdmin = &admin
	}
	userID, err := s.store.EnsureOIDCUser(ctx, sub, displayNameClaim(info), email, isAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "user provisioning failed")
		return "", false
	}
	return userID, true
}

// issueSession opens a refresh chain and hands the client its first
// token pair. Login of a deactivated account is refused outright rather
// than issuing tokens that every endpoint would 403 anyway (FR-23.3).
func (s *Server) issueSession(w http.ResponseWriter, ctx context.Context, userID, idpRefreshToken string) {
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
	now := time.Now().UTC()
	refresh := newRefreshToken()
	if _, err := s.store.CreateSession(ctx, userID, hashRefreshToken(refresh),
		idpRefreshToken, now.Add(sessionRefreshTTL), now); err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "session creation failed")
		return
	}
	s.writeSessionTokens(w, userID, refresh, now)
}

func (s *Server) writeSessionTokens(w http.ResponseWriter, userID, refresh string, now time.Time) {
	access := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
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

// --- IdP round-trips ------------------------------------------------------

type idpStatus int

const (
	idpOK idpStatus = iota
	idpRejected
	idpUnreachable
)

// oauthErrorResponse is the token endpoint's error body (RFC 6749
// §5.2). Its presence is the signal that the IdP itself answered:
// proxies and error pages serve HTML or plain text, IdPs serve this.
type oauthErrorResponse struct {
	Code        string `json:"error"`
	Description string `json:"error_description"`
}

const (
	// errInvalidGrant is the only RFC 6749 §5.2 code that says anything
	// about *this user's* grant — the refresh token or code is expired,
	// revoked, or was never valid. It is what Authelia returns (400)
	// once a token is revoked or the login it belongs to is gone.
	errInvalidGrant = "invalid_grant"
	// errInvalidClient means the broker's own credentials were refused
	// (Authelia answers 401). Identical for every user, so it is a
	// deployment fault, never a per-user rejection.
	errInvalidClient = "invalid_client"
)

// idpTokenRequest posts to the IdP token endpoint as a confidential
// client and decodes the token set. Reports ok=false after writing the
// error response.
func (s *Server) idpTokenRequest(w http.ResponseWriter, form url.Values) (idpTokenSet, bool) {
	tokens, status := s.idpTokenPost(form)
	switch status {
	case idpRejected:
		writeError(w, http.StatusUnauthorized, ErrUnauthorized, "IdP rejected the request")
		return idpTokenSet{}, false
	case idpUnreachable:
		writeError(w, http.StatusBadGateway, ErrIDPUnreachable, "IdP token endpoint unreachable")
		return idpTokenSet{}, false
	}
	return tokens, true
}

// idpRefresh runs the refresh_token grant; the caller maps the status
// onto its own error semantics (rejection ends the session, outage
// does not).
func (s *Server) idpRefresh(refreshToken string) (idpTokenSet, idpStatus) {
	return s.idpTokenPost(url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	})
}

func (s *Server) idpTokenPost(form url.Values) (idpTokenSet, idpStatus) {
	req, err := http.NewRequest(http.MethodPost, s.oidc.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return idpTokenSet{}, idpUnreachable
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// client_secret_basic (RFC 6749 §2.3.1) — the auth method Authelia
	// defaults to for confidential clients. Credentials are form-encoded
	// inside the Basic header per OAuth 2.0, hence the QueryEscape.
	req.SetBasicAuth(url.QueryEscape(s.oidc.clientID), url.QueryEscape(s.oidc.clientSecret))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return idpTokenSet{}, idpUnreachable
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return idpTokenSet{}, idpUnreachable
	}
	if status := classifyTokenResponse(resp.StatusCode, body); status != idpOK {
		return idpTokenSet{}, status
	}
	var tokens idpTokenSet
	if err := json.Unmarshal(body, &tokens); err != nil || tokens.AccessToken == "" {
		// A 200 that is not a token set never came from a token
		// endpoint — a captive portal or a misrouted proxy, not a grant.
		return idpTokenSet{}, idpUnreachable
	}
	return tokens, idpOK
}

// classifyTokenResponse decides whether the token endpoint said no or
// was never reached — the distinction that decides whether a session
// survives (ADR-007, spec §2), so it must never collapse into
// rejection.
//
// A rejection is only an RFC 6749 §5.2 error response: 400 (or 401,
// which some IdPs use) carrying a JSON object with an `error` field,
// and among those codes only `invalid_grant`. Everything else is an
// outage:
//
//   - Status codes outside 400/401, and any body that is not a JSON
//     OAuth error. Behind a reverse proxy — the reference deployment —
//     the IdP going down does not produce a 5xx at all: Traefik drops
//     the router with the container and the POST lands on the catch-all
//     error page, which answers 404 with HTML. That is the ordinary
//     shape of "Authelia is down".
//   - `invalid_client` and the remaining §5.2 codes. They describe the
//     broker's registration or request, are identical for every user,
//     and would turn one wrong secret into a fleet-wide permanent
//     logout. Logged instead, because nothing else surfaces them.
//
// The asymmetry is deliberate. Reading a rejection as an outage costs a
// session row that lingers to its absolute expiry while the user is cut
// off anyway (no refresh ever succeeds); reading an outage as a
// rejection destroys the session for good. Only the latter is
// unrecoverable, so anything ambiguous resolves to outage.
func classifyTokenResponse(statusCode int, body []byte) idpStatus {
	if statusCode == http.StatusOK {
		return idpOK
	}
	var oauthErr oauthErrorResponse
	if err := json.Unmarshal(body, &oauthErr); err != nil || oauthErr.Code == "" {
		return idpUnreachable
	}
	if statusCode != http.StatusBadRequest && statusCode != http.StatusUnauthorized {
		return idpUnreachable
	}
	if oauthErr.Code != errInvalidGrant {
		if oauthErr.Code == errInvalidClient {
			slog.Error("IdP refused the broker's client credentials — check JITPACK_OIDC_CLIENT_ID and JITPACK_OIDC_CLIENT_SECRET",
				"error", oauthErr.Code, "description", oauthErr.Description)
		}
		return idpUnreachable
	}
	return idpRejected
}

// fetchUserinfo wraps userinfoRequest with the broker's error
// responses; reports ok=false after writing them.
func (s *Server) fetchUserinfo(w http.ResponseWriter, accessToken string) (map[string]any, bool) {
	info, err := s.userinfoRequest(accessToken)
	if err != nil {
		writeError(w, http.StatusBadGateway, ErrIDPUnreachable, "IdP UserInfo endpoint unreachable")
		return nil, false
	}
	return info, true
}

// userinfoRequest reads the identity claims the IdP holds for the
// access token. Plain JSON per the reference deployment (Authelia,
// userinfo_signed_response_alg "none").
func (s *Server) userinfoRequest(accessToken string) (map[string]any, error) {
	req, err := http.NewRequest(http.MethodGet, s.oidc.userinfoURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("userinfo endpoint refused the access token")
	}
	var info map[string]any
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, err
	}
	return info, nil
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
