// Package api — auth.go brokers the OIDC Authorization-Code + PKCE
// exchange (Sync-API §2): the client sends code + verifier here, the
// server forwards them to the IdP token endpoint, verifies the returned
// token against the JWKS, JIT-provisions the user, and passes the token
// set through. Refresh works the same way. GET /auth/config lets the
// client stay zero-config (one server URL, everything else discovered).
package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// oidcExchange holds the IdP endpoints the broker talks to.
type oidcExchange struct {
	tokenURL     string
	clientID     string
	authorizeURL string
}

// EnableOIDCExchange turns on the /auth/token, /auth/refresh, and
// /auth/config endpoints. Requires a JWKS-mode server — the brokered
// tokens are validated with the same provider.
func (s *Server) EnableOIDCExchange(tokenURL, clientID, authorizeURL string) {
	s.oidc = &oidcExchange{tokenURL: tokenURL, clientID: clientID, authorizeURL: authorizeURL}
}

type tokenSet struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func (s *Server) handleAuthToken(w http.ResponseWriter, r *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, "not_configured", "OIDC exchange is not configured")
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
		"client_id":     {s.oidc.clientID},
	})
	if !ok {
		return
	}

	// Verify the IdP token and JIT-provision the user (§2).
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(tokens.AccessToken, claims, s.keyFunc,
		jwt.WithValidMethods(s.validMethods)); err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "IdP token failed verification")
		return
	}
	sub, err := claims.GetSubject()
	if err != nil || sub == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "IdP token has no subject")
		return
	}
	if _, err := s.store.EnsureOIDCUser(r.Context(), sub, displayNameClaim(claims)); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "user provisioning failed")
		return
	}
	writeJSON(w, tokens)
}

func (s *Server) handleAuthRefresh(w http.ResponseWriter, r *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, "not_configured", "OIDC exchange is not configured")
		return
	}
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "refresh_token required")
		return
	}
	tokens, ok := s.idpTokenRequest(w, url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {req.RefreshToken},
		"client_id":     {s.oidc.clientID},
	})
	if !ok {
		return
	}
	writeJSON(w, tokens)
}

func (s *Server) handleAuthConfig(w http.ResponseWriter, _ *http.Request) {
	if s.oidc == nil {
		writeError(w, http.StatusNotImplemented, "not_configured", "OIDC exchange is not configured")
		return
	}
	writeJSON(w, map[string]string{
		"authorize_url": s.oidc.authorizeURL,
		"client_id":     s.oidc.clientID,
	})
}

// idpTokenRequest forwards a token-endpoint request to the IdP and
// decodes the token set. Reports ok=false after writing the error.
func (s *Server) idpTokenRequest(w http.ResponseWriter, form url.Values) (tokenSet, bool) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(s.oidc.tokenURL, "application/x-www-form-urlencoded",
		strings.NewReader(form.Encode()))
	if err != nil {
		writeError(w, http.StatusBadGateway, "idp_unreachable", "IdP token endpoint unreachable")
		return tokenSet{}, false
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadGateway, "idp_unreachable", "IdP response unreadable")
		return tokenSet{}, false
	}
	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusUnauthorized, "unauthorized", "IdP rejected the request")
		return tokenSet{}, false
	}
	var tokens tokenSet
	if err := json.Unmarshal(body, &tokens); err != nil || tokens.AccessToken == "" {
		writeError(w, http.StatusBadGateway, "idp_unreachable", "IdP returned no token")
		return tokenSet{}, false
	}
	return tokens, true
}

func displayNameClaim(claims jwt.MapClaims) string {
	for _, key := range []string{"name", "preferred_username"} {
		if v, ok := claims[key].(string); ok && v != "" {
			return v
		}
	}
	return ""
}
