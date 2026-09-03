package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// idpTimeout bounds every call the broker makes to the IdP. Named
	// once: token, UserInfo, discovery and the JWKS refresh are the same
	// hop to the same host, and a timeout that differs between them
	// would be a difference nobody decided.
	idpTimeout = 10 * time.Second
	// idpMaxBody caps what is read from an IdP response. The documents
	// are kilobytes; the cap is against a hung or hostile peer.
	idpMaxBody = 1 << 20
)

// The broker's failures, as the handler needs to tell them apart. The
// distinction that matters most is errIDPRejected vs errIDPUnreachable:
// only the first may end a session (ADR-007, spec §2) — see
// classifyTokenResponse for why anything ambiguous is an outage.
var (
	// errIDPRejected: the IdP answered, and said no to this grant.
	errIDPRejected = errors.New("idp rejected the grant")
	// errIDPUnreachable: no usable answer from the token endpoint.
	errIDPUnreachable = errors.New("idp token endpoint unreachable")
	// errNoIDToken: a token set without the credential the login is
	// built on, which is what a client without the openid scope gets.
	errNoIDToken = errors.New("idp returned no id_token")
	// errIDTokenInvalid: signature, issuer or audience did not hold.
	errIDTokenInvalid = errors.New("id token failed verification")
	// errNoSubject: a verified ID token that identifies nobody.
	errNoSubject = errors.New("id token has no subject")
	// errSubjectMismatch: UserInfo describes a different account than
	// the ID token (OIDC Core §5.3.2) — a swapped-in access token.
	errSubjectMismatch = errors.New("userinfo subject does not match id token")
	// errUserinfoUnreachable: the UserInfo endpoint gave no claims.
	errUserinfoUnreachable = errors.New("idp userinfo endpoint unreachable")
)

// oidcBroker holds the confidential-client configuration resolved from
// discovery, and is the only thing in the process that talks to the
// IdP. The client secret lives only here, server-side.
type oidcBroker struct {
	issuer       string
	clientID     string
	clientSecret string
	authorizeURL string
	tokenURL     string
	userinfoURL  string
	jwks         *JWKSProvider
	client       *http.Client
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
		client:       &http.Client{Timeout: idpTimeout},
	}
}

// idpIdentity is what the IdP says about an account after a round-trip:
// the subject the session is keyed by, the UserInfo claims the users row
// is provisioned from, and the IdP refresh token to store alongside.
// A zero sub means the IdP vouched for the session without saying
// anything new about the account — see refresh.
type idpIdentity struct {
	sub             string
	info            map[string]any
	idpRefreshToken string
}

// exchange runs the authorization-code grant and resolves who logged
// in: token set, ID-token verification, UserInfo, and the OIDC Core
// §5.3.2 subject check. Every failure is one of the sentinels above, so
// the handler decides the HTTP answer in one place.
func (b *oidcBroker) exchange(ctx context.Context, code, verifier, redirectURI string) (idpIdentity, error) {
	tokens, err := b.tokenRequest(ctx, url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"code_verifier": {verifier},
		"redirect_uri":  {redirectURI},
	})
	if err != nil {
		return idpIdentity{}, err
	}
	if tokens.IDToken == "" {
		return idpIdentity{}, errNoIDToken
	}

	// The ID token is the credential minted *for this broker*: audience
	// is our client id, issuer is the configured IdP, signature is in
	// the discovered JWKS. Everything identity-shaped rides on it.
	idClaims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(tokens.IDToken, idClaims, b.jwks.KeyFunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(b.issuer),
		jwt.WithAudience(b.clientID)); err != nil {
		return idpIdentity{}, errIDTokenInvalid
	}
	sub, err := idClaims.GetSubject()
	if err != nil || sub == "" {
		return idpIdentity{}, errNoSubject
	}

	info, err := b.userinfo(ctx, tokens.AccessToken)
	if err != nil {
		return idpIdentity{}, errUserinfoUnreachable
	}
	// OIDC Core §5.3.2: the UserInfo sub MUST match the ID token's —
	// this is the defense against a swapped-in access token.
	if infoSub, _ := info["sub"].(string); infoSub != sub {
		return idpIdentity{}, errSubjectMismatch
	}
	return idpIdentity{sub: sub, info: info, idpRefreshToken: tokens.RefreshToken}, nil
}

// refresh re-validates a session at the IdP once per refresh, so an
// account disabled or logged out there is cut off at refresh cadence
// rather than never (ADR-007).
//
// Reading the identity back is best-effort and deliberately not an
// error: the IdP has already vouched for the account by honouring the
// grant, and failing the refresh here would discard the rotated IdP
// refresh token the caller must keep. A returned identity therefore
// carries an empty sub when UserInfo said nothing usable, and the
// caller re-stamps only when it did.
func (b *oidcBroker) refresh(ctx context.Context, idpRefreshToken string) (idpIdentity, error) {
	tokens, err := b.tokenRequest(ctx, url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {idpRefreshToken},
	})
	if err != nil {
		return idpIdentity{}, err
	}
	id := idpIdentity{idpRefreshToken: tokens.RefreshToken}
	info, err := b.userinfo(ctx, tokens.AccessToken)
	if err != nil {
		return id, nil
	}
	if sub, _ := info["sub"].(string); sub != "" {
		id.sub, id.info = sub, info
	}
	return id, nil
}

// authorizeConfig is what the client needs to start a login.
func (b *oidcBroker) authorizeConfig() AuthConfigResponse {
	return AuthConfigResponse{AuthorizeURL: b.authorizeURL, ClientID: b.clientID}
}

// idpTokenSet is the IdP's token-endpoint response. Only the broker
// ever sees it; the session tokens handed to the client are JIT-Pack's
// own (see issueSession).
type idpTokenSet struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
}

// tokenRequest posts to the IdP token endpoint as a confidential client
// and decodes the token set, reporting errIDPRejected or
// errIDPUnreachable per classifyTokenResponse.
func (b *oidcBroker) tokenRequest(ctx context.Context, form url.Values) (idpTokenSet, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return idpTokenSet{}, errIDPUnreachable
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// client_secret_basic (RFC 6749 §2.3.1) — the auth method Authelia
	// defaults to for confidential clients. Credentials are form-encoded
	// inside the Basic header per OAuth 2.0, hence the QueryEscape.
	req.SetBasicAuth(url.QueryEscape(b.clientID), url.QueryEscape(b.clientSecret))

	resp, err := b.client.Do(req)
	if err != nil {
		return idpTokenSet{}, errIDPUnreachable
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, idpMaxBody))
	if err != nil {
		return idpTokenSet{}, errIDPUnreachable
	}
	if err := classifyTokenResponse(resp.StatusCode, body); err != nil {
		return idpTokenSet{}, err
	}
	var tokens idpTokenSet
	if err := json.Unmarshal(body, &tokens); err != nil || tokens.AccessToken == "" {
		// A 200 that is not a token set never came from a token
		// endpoint — a captive portal or a misrouted proxy, not a grant.
		return idpTokenSet{}, errIDPUnreachable
	}
	return tokens, nil
}

// userinfo reads the identity claims the IdP holds for the access
// token. Plain JSON per the reference deployment (Authelia,
// userinfo_signed_response_alg "none").
func (b *oidcBroker) userinfo(ctx context.Context, accessToken string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, b.userinfoURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := b.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, idpMaxBody))
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

// classifyTokenResponse decides whether the token endpoint said no or
// was never reached — the distinction that decides whether a session
// survives (ADR-007, spec §2), so it must never collapse into
// rejection. Returns nil for a token set worth decoding.
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
func classifyTokenResponse(statusCode int, body []byte) error {
	if statusCode == http.StatusOK {
		return nil
	}
	var oauthErr oauthErrorResponse
	if err := json.Unmarshal(body, &oauthErr); err != nil || oauthErr.Code == "" {
		return errIDPUnreachable
	}
	if statusCode != http.StatusBadRequest && statusCode != http.StatusUnauthorized {
		return errIDPUnreachable
	}
	if oauthErr.Code != errInvalidGrant {
		if oauthErr.Code == errInvalidClient {
			slog.Error("IdP refused the broker's client credentials — check JITPACK_OIDC_CLIENT_ID and JITPACK_OIDC_CLIENT_SECRET",
				"error", oauthErr.Code, "description", oauthErr.Description)
		}
		return errIDPUnreachable
	}
	return errIDPRejected
}
