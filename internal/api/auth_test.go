package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

// Sync-API §2: the server brokers the OIDC code exchange — it forwards
// code+PKCE to the IdP, verifies the returned token against the JWKS,
// JIT-provisions the user, and passes the token set through.

type fakeIDP struct {
	srv        *httptest.Server
	lastForm   url.Values
	tokenValue string
}

func newFakeIDP(t *testing.T, accessToken string) *fakeIDP {
	t.Helper()
	idp := &fakeIDP{tokenValue: accessToken}
	idp.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Errorf("idp parse form: %v", err)
		}
		idp.lastForm = r.PostForm
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":  idp.tokenValue,
			"refresh_token": "refresh-1",
			"expires_in":    3600,
			"token_type":    "bearer",
		})
	}))
	t.Cleanup(idp.srv.Close)
	return idp
}

func newOIDCServer(t *testing.T) (*httptest.Server, *fakeIDP, *store.Store, string) {
	t.Helper()
	key := generateRSAKey(t)
	kid := "idp-key-1"
	jwksSrv := serveJWKS(t, kid, &key.PublicKey)
	provider, err := api.NewJWKSProvider(jwksSrv.URL)
	if err != nil {
		t.Fatalf("NewJWKSProvider: %v", err)
	}
	t.Cleanup(func() { provider.Close() })

	accessToken := rsaToken(t, key, kid, "auth|sarah")
	idp := newFakeIDP(t, accessToken)

	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	apiSrv := api.NewWithJWKS(st, provider)
	apiSrv.EnableOIDCExchange(idp.srv.URL, "jitpack-client", idp.srv.URL+"/authorize")
	srv := httptest.NewServer(apiSrv.Handler())
	t.Cleanup(srv.Close)
	return srv, idp, st, accessToken
}

func TestAuthToken_ExchangesAndProvisions(t *testing.T) {
	srv, idp, st, accessToken := newOIDCServer(t)

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{
		"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}

	// The IdP received the PKCE exchange.
	if idp.lastForm.Get("grant_type") != "authorization_code" ||
		idp.lastForm.Get("code") != "abc" ||
		idp.lastForm.Get("code_verifier") != "ver" ||
		idp.lastForm.Get("client_id") != "jitpack-client" {
		t.Errorf("idp form = %v", idp.lastForm)
	}

	// Token set passed through.
	var out struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if out.AccessToken != accessToken || out.RefreshToken != "refresh-1" || out.ExpiresIn != 3600 {
		t.Errorf("unexpected token set %+v", out)
	}

	// User JIT-provisioned.
	var userID string
	if err := st.DB().QueryRow(`SELECT id FROM users WHERE oidc_subject = 'auth|sarah'`).Scan(&userID); err != nil {
		t.Fatalf("user not provisioned: %v", err)
	}

	// The token works against protected endpoints, attributed to users.id.
	body := map[string]any{"mutations": []any{
		masterMutation("items", "item-oidc", "ao-1", "insert",
			map[string]any{"name": "Stirnlampe"}, "0000000001000-0000-aaaaaaaa"),
	}}
	resp, raw = doJSON(t, http.MethodPost, srv.URL+"/api/v1/sync/master", out.AccessToken, body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push with brokered token: status = %d, body %s", resp.StatusCode, raw)
	}
	var createdBy string
	if err := st.DB().QueryRow(`SELECT created_by FROM items WHERE id = 'item-oidc'`).Scan(&createdBy); err != nil {
		t.Fatal(err)
	}
	if createdBy != userID {
		t.Errorf("created_by = %q, want users.id %q (subject must map to users.id)", createdBy, userID)
	}
}

func TestAuthRefresh_PassesThrough(t *testing.T) {
	srv, idp, _, _ := newOIDCServer(t)

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": "refresh-0",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	if idp.lastForm.Get("grant_type") != "refresh_token" || idp.lastForm.Get("refresh_token") != "refresh-0" {
		t.Errorf("idp form = %v", idp.lastForm)
	}
	var out struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if out.RefreshToken != "refresh-1" {
		t.Errorf("refresh_token = %q, want refresh-1", out.RefreshToken)
	}
}

func TestAuthConfig_ExposesAuthorizeEndpoint(t *testing.T) {
	srv, idp, _, _ := newOIDCServer(t)

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
	if out.AuthorizeURL != idp.srv.URL+"/authorize" || out.ClientID != "jitpack-client" {
		t.Errorf("unexpected config %+v", out)
	}
}

func TestAuthEndpoints_NotConfigured(t *testing.T) {
	srv := newTestServer(t) // HS256 server without OIDC exchange

	resp, _ := doJSON(t, http.MethodPost, srv.URL+"/api/v1/auth/token", "", map[string]any{"code": "x"})
	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("token status = %d, want 501", resp.StatusCode)
	}
	resp, _ = doJSON(t, http.MethodGet, srv.URL+"/api/v1/auth/config", "", nil)
	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("config status = %d, want 501", resp.StatusCode)
	}
}
