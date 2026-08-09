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

// EnableOIDC turns on the /auth/token, /auth/refresh and /auth/config
// endpoints, brokering logins against the discovered IdP endpoints as a
// confidential client (client_secret_basic).
func (s *Server) EnableOIDC(d Discovery, clientID, clientSecret string, jwks *JWKSProvider) {
	s.oidc = &oidcBroker{
		issuer:       d.Issuer,
		clientID:     clientID,
		clientSecret: clientSecret,
		authorizeURL: d.AuthorizeURL,
		tokenURL:     d.TokenURL,
		userinfoURL:  d.UserinfoURL,
		jwks:         jwks,
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
type sessionTokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func (s *Server) handleAuthToken(w http.ResponseWriter, r *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, "not_configured", "OIDC login is not configured")
		return
	}
	var req struct {
		Code         string `json:"code"`
		CodeVerifier string `json:"code_verifier"`
		RedirectURI  string `json:"redirect_uri"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "code, code_verifier, redirect_uri required")
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
		writeError(w, http.StatusBadGateway, "idp_error", "IdP returned no id_token — is the openid scope configured for this client?")
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
		writeError(w, http.StatusUnauthorized, "unauthorized", "ID token failed verification")
		return
	}
	sub, err := idClaims.GetSubject()
	if err != nil || sub == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "ID token has no subject")
		return
	}

	info, ok := s.fetchUserinfo(w, tokens.AccessToken)
	if !ok {
		return
	}
	// OIDC Core §5.3.2: the UserInfo sub MUST match the ID token's —
	// this is the defense against a swapped-in access token.
	if infoSub, _ := info["sub"].(string); infoSub != sub {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UserInfo subject does not match ID token")
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
		writeError(w, http.StatusNotImplemented, "not_configured", "OIDC login is not configured")
		return
	}
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "refresh_token required")
		return
	}
	now := time.Now().UTC()
	oldHash := hashRefreshToken(req.RefreshToken)

	// Peek before consuming: on an IdP outage the chain must survive
	// untouched, so nothing is rotated until the IdP has answered.
	sess, err := s.store.GetSessionByHash(r.Context(), oldHash, now)
	if errors.Is(err, store.ErrSessionNotFound) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "unknown or expired session")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "session lookup failed")
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
			_ = s.store.DeleteSession(r.Context(), oldHash)
			writeError(w, http.StatusUnauthorized, "unauthorized", "IdP rejected the session")
			return
		case idpUnreachable:
			// Offline is normal, not a logout: leave the chain intact.
			writeError(w, http.StatusBadGateway, "idp_unreachable", "IdP token endpoint unreachable")
			return
		}
	}

	if deactivated, err := s.store.UserDeactivated(r.Context(), sess.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "account lookup failed")
		return
	} else if deactivated {
		_ = s.store.DeleteSession(r.Context(), oldHash)
		writeError(w, http.StatusForbidden, "account_deactivated", "account is deactivated")
		return
	}

	newRefresh := newRefreshToken()
	if _, err := s.store.RotateSession(r.Context(), oldHash, hashRefreshToken(newRefresh),
		newIDPRefresh, now.Add(sessionRefreshTTL), now); err != nil {
		// Consumed by a concurrent rotation between peek and here —
		// indistinguishable from a replay, and answered the same way.
		writeError(w, http.StatusUnauthorized, "unauthorized", "unknown or expired session")
		return
	}
	s.writeSessionTokens(w, sess.UserID, newRefresh, now)
}

func (s *Server) handleAuthConfig(w http.ResponseWriter, _ *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, "not_configured", "OIDC login is not configured")
		return
	}
	writeJSON(w, map[string]string{
		"authorize_url": s.oidc.authorizeURL,
		"client_id":     s.oidc.clientID,
	})
}

// provisionFromUserinfo maps UserInfo claims onto the users row: JIT
// provisioning, display name, e-mail, and the FR-23.1 admin stamp —
// which requires the IdP's email_verified assertion, exactly as the
// token-claim variant did before ADR-007 moved the source here.
func (s *Server) provisionFromUserinfo(w http.ResponseWriter, ctx context.Context, sub string, info map[string]any) (string, bool) {
	email := stringClaim(info, "email")
	userID, err := s.store.EnsureOIDCUser(ctx, sub, displayNameClaim(info), email,
		s.isAdminEmail(email, emailVerifiedClaim(info)))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "user provisioning failed")
		return "", false
	}
	return userID, true
}

// issueSession opens a refresh chain and hands the client its first
// token pair. Login of a deactivated account is refused outright rather
// than issuing tokens that every endpoint would 403 anyway (FR-23.3).
func (s *Server) issueSession(w http.ResponseWriter, ctx context.Context, userID, idpRefreshToken string) {
	if deactivated, err := s.store.UserDeactivated(ctx, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "account lookup failed")
		return
	} else if deactivated {
		writeError(w, http.StatusForbidden, "account_deactivated", "account is deactivated")
		return
	}
	now := time.Now().UTC()
	refresh := newRefreshToken()
	if _, err := s.store.CreateSession(ctx, userID, hashRefreshToken(refresh),
		idpRefreshToken, now.Add(sessionRefreshTTL), now); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "session creation failed")
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
		writeError(w, http.StatusInternalServerError, "internal", "token signing failed")
		return
	}
	writeJSON(w, sessionTokens{
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

// idpTokenRequest posts to the IdP token endpoint as a confidential
// client and decodes the token set. Reports ok=false after writing the
// error response.
func (s *Server) idpTokenRequest(w http.ResponseWriter, form url.Values) (idpTokenSet, bool) {
	tokens, status := s.idpTokenPost(form)
	switch status {
	case idpRejected:
		writeError(w, http.StatusUnauthorized, "unauthorized", "IdP rejected the request")
		return idpTokenSet{}, false
	case idpUnreachable:
		writeError(w, http.StatusBadGateway, "idp_unreachable", "IdP token endpoint unreachable")
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
	if resp.StatusCode >= http.StatusInternalServerError {
		// A 5xx is the IdP being down, not the IdP saying no — the
		// distinction decides whether a session survives (offline is
		// normal, spec §2), so it must never collapse into rejection.
		return idpTokenSet{}, idpUnreachable
	}
	if resp.StatusCode != http.StatusOK {
		return idpTokenSet{}, idpRejected
	}
	var tokens idpTokenSet
	if err := json.Unmarshal(body, &tokens); err != nil || tokens.AccessToken == "" {
		return idpTokenSet{}, idpUnreachable
	}
	return tokens, idpOK
}

// fetchUserinfo wraps userinfoRequest with the broker's error
// responses; reports ok=false after writing them.
func (s *Server) fetchUserinfo(w http.ResponseWriter, accessToken string) (map[string]any, bool) {
	info, err := s.userinfoRequest(accessToken)
	if err != nil {
		writeError(w, http.StatusBadGateway, "idp_unreachable", "IdP UserInfo endpoint unreachable")
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
