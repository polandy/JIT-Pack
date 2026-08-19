package api_test

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

// ADR-007 / Sync-API §2: the server brokers the OIDC login as a
// confidential client — code+PKCE to the IdP, ID token validated against
// the JWKS (signature, issuer, audience), identity from UserInfo — and
// issues its own HS256 session tokens. The IdP token set never reaches
// the client.

// fakeIDP is a minimal Authelia-shaped IdP: discovery, JWKS, token and
// userinfo endpoints on one server. Fields are mutated between requests
// to steer scenarios; tests drive handlers sequentially, so no locking.
type fakeIDP struct {
	t   *testing.T
	srv *httptest.Server
	key *rsa.PrivateKey
	kid string

	clientID     string
	clientSecret string
	sub          string
	userinfo     map[string]any // served claims; "sub" injected unless set

	// Steering knobs.
	idTokenIss     string          // "" → own URL
	idTokenAud     string          // "" → clientID
	idTokenKey     *rsa.PrivateKey // nil → key (set to a stranger's for forgery)
	omitIDToken    bool
	omitIDTokenSub bool
	userinfoStatus int    // 0 → 200; non-zero served verbatim (outage scenarios)
	tokenStatus    int    // 0 → 200; e.g. 400 (rejection) or 503 (outage)
	tokenBody      string // body served with tokenStatus; "" → empty
	tokenCT        string // Content-Type for tokenBody; "" → application/json
	idpRefresh     string // refresh token returned by grants; "" → "idp-refresh-1"

	// Recorded by the handlers.
	lastTokenForm url.Values
	lastBasicUser string
	lastBasicPass string
	accessCounter int
	lastAccess    string // access token most recently issued
}

func newFakeIDP(t *testing.T) *fakeIDP {
	t.Helper()
	idp := &fakeIDP{
		t:            t,
		key:          generateRSAKey(t),
		kid:          "idp-key-1",
		clientID:     "jitpack",
		clientSecret: "confidential",
		sub:          "auth|sarah",
		userinfo:     map[string]any{"name": "Sarah", "email": "sarah@example.com", "email_verified": true},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		writeJSONTo(t, w, map[string]string{
			"issuer":                 idp.srv.URL,
			"authorization_endpoint": idp.srv.URL + "/authorize",
			"token_endpoint":         idp.srv.URL + "/token",
			"jwks_uri":               idp.srv.URL + "/jwks.json",
			"userinfo_endpoint":      idp.srv.URL + "/userinfo",
		})
	})
	mux.HandleFunc("GET /jwks.json", func(w http.ResponseWriter, _ *http.Request) {
		pub := &idp.key.PublicKey
		writeJSONTo(t, w, map[string]any{
			"keys": []map[string]string{{
				"kty": "RSA", "kid": idp.kid, "alg": "RS256",
				"n": base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
				"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
			}},
		})
	})
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Errorf("idp parse form: %v", err)
		}
		idp.lastTokenForm = r.PostForm
		idp.lastBasicUser, idp.lastBasicPass, _ = r.BasicAuth()
		if idp.tokenStatus != 0 {
			ct := idp.tokenCT
			if ct == "" {
				ct = "application/json; charset=utf-8"
			}
			w.Header().Set("Content-Type", ct)
			w.WriteHeader(idp.tokenStatus)
			if _, err := io.WriteString(w, idp.tokenBody); err != nil {
				t.Errorf("idp write body: %v", err)
			}
			return
		}
		idp.accessCounter++
		idp.lastAccess = "idp-access-" + string(rune('0'+idp.accessCounter))
		resp := map[string]any{
			"access_token":  idp.lastAccess,
			"refresh_token": idp.refreshValue(),
			"expires_in":    3600,
			"token_type":    "bearer",
		}
		if !idp.omitIDToken {
			resp["id_token"] = idp.signIDToken()
		}
		writeJSONTo(t, w, resp)
	})
	mux.HandleFunc("GET /userinfo", func(w http.ResponseWriter, r *http.Request) {
		if idp.userinfoStatus != 0 {
			w.WriteHeader(idp.userinfoStatus)
			return
		}
		if r.Header.Get("Authorization") != "Bearer "+idp.lastAccess {
			// The broker must present the access token it was just
			// handed — anything else is a wiring bug.
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		claims := map[string]any{"sub": idp.sub}
		for k, v := range idp.userinfo {
			claims[k] = v
		}
		writeJSONTo(t, w, claims)
	})
	idp.srv = httptest.NewServer(mux)
	t.Cleanup(idp.srv.Close)
	return idp
}

func (f *fakeIDP) refreshValue() string {
	if f.idpRefresh != "" {
		return f.idpRefresh
	}
	return "idp-refresh-1"
}

func (f *fakeIDP) signIDToken() string {
	iss, aud, key := f.srv.URL, f.clientID, f.key
	if f.idTokenIss != "" {
		iss = f.idTokenIss
	}
	if f.idTokenAud != "" {
		aud = f.idTokenAud
	}
	if f.idTokenKey != nil {
		key = f.idTokenKey
	}
	claims := jwt.MapClaims{
		"iss": iss, "aud": aud, "sub": f.sub,
		"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(),
	}
	if f.omitIDTokenSub {
		delete(claims, "sub")
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = f.kid
	signed, err := tok.SignedString(key)
	if err != nil {
		f.t.Fatalf("sign id_token: %v", err)
	}
	return signed
}

func writeJSONTo(t *testing.T, w http.ResponseWriter, v any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		t.Errorf("encode response: %v", err)
	}
}

// newBrokerParts wires an api.Server against the fake IdP the way
// cmd/jitpackd does — discovery, JWKS from the discovered URI,
// EnableOIDC — and exposes the pieces for tests that configure more
// (e.g. the FR-23.1 allowlist).
func newBrokerParts(t *testing.T, idp *fakeIDP) (*httptest.Server, *store.Store, *api.Server) {
	t.Helper()
	d, err := api.FetchDiscovery(idp.srv.URL)
	if err != nil {
		t.Fatalf("FetchDiscovery: %v", err)
	}
	jwks, err := api.NewJWKSProvider(d.JWKSURI)
	if err != nil {
		t.Fatalf("NewJWKSProvider: %v", err)
	}
	t.Cleanup(func() { jwks.Close() })

	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	apiSrv := api.New(st, testSecret)
	apiSrv.EnableOIDC(d, idp.clientID, idp.clientSecret, jwks)
	srv := httptest.NewServer(apiSrv.Handler())
	t.Cleanup(srv.Close)
	return srv, st, apiSrv
}

func newBrokerServer(t *testing.T, idp *fakeIDP) (*httptest.Server, *store.Store) {
	t.Helper()
	srv, st, _ := newBrokerParts(t, idp)
	return srv, st
}

func login(t *testing.T, srvURL string) (access, refresh string) {
	t.Helper()
	resp, raw := doJSON(t, http.MethodPost, srvURL+"/api/v1/auth/token", "", map[string]any{
		"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login: status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	return out.AccessToken, out.RefreshToken
}

func TestAuthToken_BrokersLoginAndIssuesFirstPartySession(t *testing.T) {
	idp := newFakeIDP(t)
	srv, st := newBrokerServer(t, idp)

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{
		"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}

	// Confidential client: secret in the Basic header, never in the form.
	if idp.lastBasicUser != "jitpack" || idp.lastBasicPass != "confidential" {
		t.Errorf("basic auth = %q/%q, want client_secret_basic credentials", idp.lastBasicUser, idp.lastBasicPass)
	}
	if idp.lastTokenForm.Get("client_secret") != "" {
		t.Error("client_secret leaked into the form body")
	}
	if idp.lastTokenForm.Get("grant_type") != "authorization_code" ||
		idp.lastTokenForm.Get("code") != "abc" ||
		idp.lastTokenForm.Get("code_verifier") != "ver" {
		t.Errorf("idp form = %v", idp.lastTokenForm)
	}

	var out struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	// The client gets JIT-Pack's session, not the IdP token set.
	if out.AccessToken == idp.lastAccess {
		t.Error("IdP access token passed through to the client")
	}
	if out.RefreshToken == idp.refreshValue() {
		t.Error("IdP refresh token passed through to the client")
	}
	if out.ExpiresIn != 900 {
		t.Errorf("expires_in = %d, want 900 (15 min session access TTL)", out.ExpiresIn)
	}

	// Session token: HS256 under the server's secret, sub = users.id.
	var userID, displayName, email string
	if err := st.DB().QueryRow(`SELECT id, display_name, COALESCE(email,'') FROM users WHERE oidc_subject = 'auth|sarah'`).
		Scan(&userID, &displayName, &email); err != nil {
		t.Fatalf("user not provisioned: %v", err)
	}
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(out.AccessToken, claims, func(*jwt.Token) (any, error) { return testSecret, nil },
		jwt.WithValidMethods([]string{"HS256"})); err != nil {
		t.Fatalf("session token not HS256 under the session secret: %v", err)
	}
	if sub, _ := claims.GetSubject(); sub != userID {
		t.Errorf("session sub = %q, want users.id %q", sub, userID)
	}
	// Identity came from UserInfo, not from any token claim.
	if displayName != "Sarah" || email != "sarah@example.com" {
		t.Errorf("provisioned identity = %q/%q, want the UserInfo claims", displayName, email)
	}

	// The session works against protected endpoints, attributed to users.id.
	body := map[string]any{"mutations": []any{
		masterMutation("items", "item-oidc", "ao-1", "insert",
			map[string]any{"name": "Stirnlampe"}, "0000000001000-0000-aaaaaaaa"),
	}}
	resp, raw = doJSON(t, http.MethodPost, srv.URL+"/api/v1/sync/master", out.AccessToken, body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push with session token: status = %d, body %s", resp.StatusCode, raw)
	}
	var createdBy string
	if err := st.DB().QueryRow(`SELECT created_by FROM items WHERE id = 'item-oidc'`).Scan(&createdBy); err != nil {
		t.Fatal(err)
	}
	if createdBy != userID {
		t.Errorf("created_by = %q, want %q", createdBy, userID)
	}
}

func TestAuthToken_RejectsInvalidIDToken(t *testing.T) {
	tests := []struct {
		name       string
		mutate     func(*testing.T, *fakeIDP)
		wantStatus int
	}{
		{
			// A token the IdP minted for another application must not
			// log into this one — the cross-app replay this design
			// closes at the only place identity is established.
			name:       "audience of another client",
			mutate:     func(_ *testing.T, f *fakeIDP) { f.idTokenAud = "paperless" },
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "foreign issuer",
			mutate:     func(_ *testing.T, f *fakeIDP) { f.idTokenIss = "https://evil.example.com" },
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "forged signature",
			mutate:     func(t *testing.T, f *fakeIDP) { f.idTokenKey = generateRSAKey(t) },
			wantStatus: http.StatusUnauthorized,
		},
		{
			// Without the openid scope there is no id_token — a config
			// error at the IdP, not an auth failure.
			name:       "no id_token in response",
			mutate:     func(_ *testing.T, f *fakeIDP) { f.omitIDToken = true },
			wantStatus: http.StatusBadGateway,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idp := newFakeIDP(t)
			tc.mutate(t, idp)
			srv, st := newBrokerServer(t, idp)

			resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{
				"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
			})
			if resp.StatusCode != tc.wantStatus {
				t.Errorf("status = %d, want %d (body %s)", resp.StatusCode, tc.wantStatus, raw)
			}
			var n int
			if err := st.DB().QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
				t.Fatal(err)
			}
			if n != 0 {
				t.Errorf("rejected login provisioned %d user(s)", n)
			}
		})
	}
}

func TestAuthToken_RejectsUserinfoSubMismatch(t *testing.T) {
	idp := newFakeIDP(t)
	idp.userinfo["sub"] = "auth|mallory" // overrides the injected sub
	srv, _ := newBrokerServer(t, idp)

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{
		"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
	})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 (OIDC Core §5.3.2 sub mismatch, body %s)", resp.StatusCode, raw)
	}
}

func TestAuthToken_DeactivatedAccountRefused(t *testing.T) {
	idp := newFakeIDP(t)
	srv, st := newBrokerServer(t, idp)

	// First login provisions; then the admin deactivates (FR-23.3).
	login(t, srv.URL)
	var userID string
	if err := st.DB().QueryRow(`SELECT id FROM users WHERE oidc_subject = 'auth|sarah'`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := st.DeactivateUser(t.Context(), userID); err != nil {
		t.Fatal(err)
	}

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{
		"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403 (body %s)", resp.StatusCode, raw)
	}
}

// Authelia answers UserInfo with 200 and the standard claims stripped —
// sub, aud, iss and little else — for an account disabled after its
// token was issued. Resolving the FR-23.1 role from that missing address
// demoted the admin on the spot, silently, on a path documented as
// best-effort. The role must survive a response that says nothing about
// it; only an address the IdP actually supplies may revoke.
func TestAuthRefresh_StrippedUserinfoKeepsAdminRole(t *testing.T) {
	idp := newFakeIDP(t)
	srv, _, apiSrv := newBrokerParts(t, idp)
	apiSrv.SetAdminEmails([]string{"sarah@example.com"})

	access, refresh := login(t, srv.URL)
	isAdmin := func(token string) bool {
		t.Helper()
		resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", token, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("/me: status = %d, body %s", resp.StatusCode, raw)
		}
		var me struct {
			IsInstanceAdmin bool `json:"is_instance_admin"`
		}
		if err := json.Unmarshal(raw, &me); err != nil {
			t.Fatal(err)
		}
		return me.IsInstanceAdmin
	}
	if !isAdmin(access) {
		t.Fatal("login with an allowlisted address must stamp the admin role")
	}

	// Disabled at the IdP: the grant still succeeds, but UserInfo now
	// carries no identity claims at all.
	idp.userinfo = map[string]any{}
	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": refresh,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("refresh: status = %d, body %s", resp.StatusCode, raw)
	}
	var rotated struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(raw, &rotated); err != nil {
		t.Fatal(err)
	}
	if !isAdmin(rotated.AccessToken) {
		t.Error("a UserInfo response without an email claim must not revoke the admin role")
	}

	// An address the IdP does supply still revokes (FR-23.1).
	apiSrv.SetAdminEmails(nil)
	idp.userinfo = map[string]any{"name": "Sarah", "email": "sarah@example.com", "email_verified": true}
	resp, raw = doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": rotated.RefreshToken,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("second refresh: status = %d, body %s", resp.StatusCode, raw)
	}
	if err := json.Unmarshal(raw, &rotated); err != nil {
		t.Fatal(err)
	}
	if isAdmin(rotated.AccessToken) {
		t.Error("removal from the allowlist must still revoke when UserInfo supplies the address")
	}
}

func TestAuthRefresh_RotatesAndReplayDies(t *testing.T) {
	idp := newFakeIDP(t)
	srv, _ := newBrokerServer(t, idp)
	_, refresh1 := login(t, srv.URL)

	// Rotation: the IdP hands out a rotated refresh token of its own.
	idp.idpRefresh = "idp-refresh-2"
	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": refresh1,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("first refresh: status = %d, body %s", resp.StatusCode, raw)
	}
	if idp.lastTokenForm.Get("grant_type") != "refresh_token" || idp.lastTokenForm.Get("refresh_token") != "idp-refresh-1" {
		t.Errorf("idp saw form %v, want the stored IdP refresh token", idp.lastTokenForm)
	}
	var out struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if out.RefreshToken == refresh1 {
		t.Error("refresh token not rotated")
	}

	// A replayed link of the chain is dead (single-use hashes).
	resp, _ = doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": refresh1,
	})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("replayed refresh: status = %d, want 401", resp.StatusCode)
	}

	// The rotated one lives, and the broker now presents the rotated
	// IdP refresh token upstream.
	resp, raw = doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": out.RefreshToken,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("second refresh: status = %d, body %s", resp.StatusCode, raw)
	}
	if idp.lastTokenForm.Get("refresh_token") != "idp-refresh-2" {
		t.Errorf("idp saw %q, want the rotated idp-refresh-2", idp.lastTokenForm.Get("refresh_token"))
	}
}

// TestAuthRefresh_ClassifiesIdPFailures pins the one distinction the
// whole session model rests on (ADR-007, spec §2): only an RFC 6749
// §5.2 `invalid_grant` ends a session; everything else leaves the chain
// intact and answers 502, because behind a reverse proxy an outage is
// far more likely to arrive as a 404 HTML error page than as a 5xx.
// Each case asserts both halves — the immediate answer, and whether the
// same refresh token still works once the IdP is healthy again.
func TestAuthRefresh_ClassifiesIdPFailures(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		contentType string
		body        string
		wantStatus  int  // answer while the IdP is failing
		wantSurvive bool // does the chain still work after recovery?
	}{
		{
			// The bug: Traefik drops Authelia's router with the
			// container, so the token POST hits the catch-all error page.
			name:        "proxy 404 with an HTML error page",
			status:      http.StatusNotFound,
			contentType: "text/html; charset=utf-8",
			body:        "<!doctype html><title>404</title><h1>Not Found</h1>",
			wantStatus:  http.StatusBadGateway,
			wantSurvive: true,
		},
		{
			name:        "proxy 502 while the IdP restarts",
			status:      http.StatusBadGateway,
			contentType: "text/plain; charset=utf-8",
			body:        "Bad Gateway",
			wantStatus:  http.StatusBadGateway,
			wantSurvive: true,
		},
		{
			name:        "IdP 503",
			status:      http.StatusServiceUnavailable,
			wantStatus:  http.StatusBadGateway,
			wantSurvive: true,
		},
		{
			// A route that no longer POSTs to a token endpoint says
			// nothing about the user's grant.
			name:        "405 from a misrouted endpoint",
			status:      http.StatusMethodNotAllowed,
			contentType: "text/plain; charset=utf-8",
			body:        "405 Method Not Allowed",
			wantStatus:  http.StatusBadGateway,
			wantSurvive: true,
		},
		{
			name:        "429 from a rate limiter",
			status:      http.StatusTooManyRequests,
			contentType: "text/plain; charset=utf-8",
			body:        "Too Many Requests",
			wantStatus:  http.StatusBadGateway,
			wantSurvive: true,
		},
		{
			// The only genuine rejection: Authelia's answer once the
			// token is revoked or its login is gone.
			name:        "400 invalid_grant",
			status:      http.StatusBadRequest,
			body:        `{"error":"invalid_grant","error_description":"The provided authorization grant is invalid, expired or revoked."}`,
			wantStatus:  http.StatusUnauthorized,
			wantSurvive: false,
		},
		{
			// The broker's own secret is wrong — broken for every user
			// at once. Deleting sessions would make a config typo
			// unrecoverable for the whole instance.
			name:        "401 invalid_client",
			status:      http.StatusUnauthorized,
			body:        `{"error":"invalid_client","error_description":"The provided client secret did not match the registered client secret."}`,
			wantStatus:  http.StatusBadGateway,
			wantSurvive: true,
		},
		{
			// Same reasoning: a malformed request is the broker's bug.
			name:        "400 invalid_request",
			status:      http.StatusBadRequest,
			body:        `{"error":"invalid_request","error_description":"The request is malformed."}`,
			wantStatus:  http.StatusBadGateway,
			wantSurvive: true,
		},
		{
			// A 4xx that carries no OAuth error body did not come from a
			// token endpoint.
			name:        "400 with an empty body",
			status:      http.StatusBadRequest,
			wantStatus:  http.StatusBadGateway,
			wantSurvive: true,
		},
		{
			name:        "400 with valid JSON but no error field",
			status:      http.StatusBadRequest,
			body:        `{"message":"blocked by policy"}`,
			wantStatus:  http.StatusBadGateway,
			wantSurvive: true,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idp := newFakeIDP(t)
			srv, st := newBrokerServer(t, idp)
			_, refresh := login(t, srv.URL)

			idp.tokenStatus, idp.tokenCT, idp.tokenBody = tc.status, tc.contentType, tc.body
			resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/refresh", "", map[string]any{
				"refresh_token": refresh,
			})
			if resp.StatusCode != tc.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", resp.StatusCode, tc.wantStatus, raw)
			}

			var sessions int
			if err := st.DB().QueryRow(`SELECT COUNT(*) FROM sessions`).Scan(&sessions); err != nil {
				t.Fatal(err)
			}
			if want := map[bool]int{true: 1, false: 0}[tc.wantSurvive]; sessions != want {
				t.Errorf("sessions rows = %d, want %d", sessions, want)
			}

			// The decisive assertion: after the IdP is healthy again,
			// only a real rejection may still be a logout.
			idp.tokenStatus, idp.tokenCT, idp.tokenBody = 0, "", ""
			resp, raw = doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/refresh", "", map[string]any{
				"refresh_token": refresh,
			})
			want := http.StatusUnauthorized
			if tc.wantSurvive {
				want = http.StatusOK
			}
			if resp.StatusCode != want {
				t.Errorf("refresh after recovery: status = %d, want %d (body %s)", resp.StatusCode, want, raw)
			}
		})
	}
}

// TestAuthToken_ClassifiesIdPFailures is the login-side half: the same
// classification decides whether the client is told "the IdP said no"
// (401, re-login) or "the IdP is unreachable" (502, retry later).
func TestAuthToken_ClassifiesIdPFailures(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		contentType string
		body        string
		wantStatus  int
	}{
		{
			name:        "proxy 404 with an HTML error page",
			status:      http.StatusNotFound,
			contentType: "text/html; charset=utf-8",
			body:        "<!doctype html><title>404</title>",
			wantStatus:  http.StatusBadGateway,
		},
		{
			// A spent or forged authorization code.
			name:       "400 invalid_grant",
			status:     http.StatusBadRequest,
			body:       `{"error":"invalid_grant","error_description":"The authorization code has already been used."}`,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "401 invalid_client",
			status:     http.StatusUnauthorized,
			body:       `{"error":"invalid_client","error_description":"Client authentication failed."}`,
			wantStatus: http.StatusBadGateway,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idp := newFakeIDP(t)
			idp.tokenStatus, idp.tokenCT, idp.tokenBody = tc.status, tc.contentType, tc.body
			srv, _ := newBrokerServer(t, idp)

			resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{
				"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
			})
			if resp.StatusCode != tc.wantStatus {
				t.Errorf("status = %d, want %d (body %s)", resp.StatusCode, tc.wantStatus, raw)
			}
		})
	}
}

// A 200 that is not a token set is a captive portal or a misrouted
// proxy, never a grant — and must not read as one.
func TestAuthToken_NonJSONSuccessIsAnOutage(t *testing.T) {
	idp := newFakeIDP(t)
	idp.tokenStatus, idp.tokenCT, idp.tokenBody = http.StatusOK, "text/html; charset=utf-8", "<html>sign in</html>"
	srv, _ := newBrokerServer(t, idp)

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{
		"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
	})
	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 (body %s)", resp.StatusCode, raw)
	}
}

func TestAuthConfig_ExposesDiscoveredAuthorizeEndpoint(t *testing.T) {
	idp := newFakeIDP(t)
	srv, _ := newBrokerServer(t, idp)

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/auth/config", "", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		AuthorizeURL string `json:"authorize_url"`
		ClientID     string `json:"client_id"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if out.AuthorizeURL != idp.srv.URL+"/authorize" || out.ClientID != "jitpack" {
		t.Errorf("unexpected config %+v", out)
	}
}

func TestAuthEndpoints_NotConfigured(t *testing.T) {
	srv := newTestServer(t) // session-secret server without the broker

	resp, _ := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{"code": "x"})
	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("token status = %d, want 501", resp.StatusCode)
	}
	resp, _ = doJSON(t, http.MethodGet, srv.URL+"/api/v1/auth/config", "", nil)
	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("config status = %d, want 501", resp.StatusCode)
	}
}

func TestFetchDiscovery_RejectsIssuerMismatch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSONTo(t, w, map[string]string{
			"issuer":                 "https://somewhere-else.example.com",
			"authorization_endpoint": "x", "token_endpoint": "x", "jwks_uri": "x", "userinfo_endpoint": "x",
		})
	}))
	t.Cleanup(srv.Close)

	if _, err := api.FetchDiscovery(srv.URL); err == nil {
		t.Error("issuer mismatch accepted — the discovery spec makes this check mandatory")
	}
}

// The wire contract's rejection shapes (§2): malformed requests are 422,
// and a server without the broker answers 501 on every auth endpoint.
func TestAuthEndpoints_RejectMalformedRequests(t *testing.T) {
	idp := newFakeIDP(t)
	srv, _ := newBrokerServer(t, idp)

	tests := []struct {
		name string
		path string
		body map[string]any
	}{
		{"token without code", "/api/v1/auth/token", map[string]any{"code_verifier": "v"}},
		{"token with empty body", "/api/v1/auth/token", map[string]any{}},
		{"refresh without token", "/api/v1/auth/refresh", map[string]any{}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp, raw := doJSON(t, http.MethodPost, srv.URL+tc.path, "", tc.body)
			if resp.StatusCode != http.StatusUnprocessableEntity {
				t.Errorf("status = %d, want 422 (body %s)", resp.StatusCode, raw)
			}
		})
	}

	// Refresh mirrors token/config: not configured is 501, not 404.
	plain := newTestServer(t)
	resp, _ := doJSON(t, http.MethodPost, plain.URL+"/api/v1/auth/refresh", "", map[string]any{"refresh_token": "x"})
	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("unconfigured refresh: status = %d, want 501", resp.StatusCode)
	}
}

// An ID token without a subject identifies nobody — the login must fail
// closed instead of provisioning an empty-subject account.
func TestAuthToken_RejectsIDTokenWithoutSubject(t *testing.T) {
	idp := newFakeIDP(t)
	idp.omitIDTokenSub = true
	srv, st := newBrokerServer(t, idp)

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{
		"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
	})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 (body %s)", resp.StatusCode, raw)
	}
	var n int
	if err := st.DB().QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("rejected login provisioned %d user(s)", n)
	}
}

// UserInfo down during login is an outage (502), not an auth failure —
// and it must not leave a half-provisioned user behind.
func TestAuthToken_UserinfoOutageIs502(t *testing.T) {
	idp := newFakeIDP(t)
	idp.userinfoStatus = http.StatusServiceUnavailable
	srv, st := newBrokerServer(t, idp)

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{
		"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
	})
	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 (body %s)", resp.StatusCode, raw)
	}
	var n int
	if err := st.DB().QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("failed login provisioned %d user(s)", n)
	}
}

// A session token without a subject authenticates nobody (invariant 3:
// attribution always resolves to a users.id).
func TestAuthed_TokenWithoutSubjectRejected(t *testing.T) {
	srv := newTestServer(t)

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, err := tok.SignedString(testSecret)
	if err != nil {
		t.Fatal(err)
	}
	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", signed, nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 (body %s)", resp.StatusCode, raw)
	}
}
