package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// Instance user management over HTTP (Addendum 3.23): adminOnly gating,
// the deactivation lifecycle incl. the authed 403, and the /me flag.

func TestAdmin_RequiresInstanceAdminRole(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(`UPDATE users SET is_instance_admin = 1 WHERE id = 'user-a'`); err != nil {
		t.Fatal(err)
	}

	resp, _ := doJSON(t, http.MethodGet, srv.URL+"/api/v1/admin/users", token(t, userB, testSecret), nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("non-admin status = %d, want 403", resp.StatusCode)
	}

	resp, _ = doJSON(t, http.MethodGet, srv.URL+"/api/v1/admin/users", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("unauthenticated status = %d, want 401", resp.StatusCode)
	}

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/admin/users", token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("admin status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Users []struct {
			UserID          string  `json:"user_id"`
			DisplayName     string  `json:"display_name"`
			CreatedAt       string  `json:"created_at"`
			IsInstanceAdmin bool    `json:"is_instance_admin"`
			DeactivatedAt   *string `json:"deactivated_at"`
			TripCount       int     `json:"trip_count"`
		} `json:"users"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
	if len(out.Users) != 3 {
		t.Fatalf("overview users = %d, want 3", len(out.Users))
	}
	andy := out.Users[0]
	if andy.DisplayName != "Andy" || !andy.IsInstanceAdmin || andy.CreatedAt == "" || andy.TripCount != 1 {
		t.Errorf("andy row = %+v", andy)
	}
}

func TestAdmin_DeactivationLifecycle(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(`UPDATE users SET is_instance_admin = 1 WHERE id = 'user-a'`); err != nil {
		t.Fatal(err)
	}
	adminTok := token(t, userA, testSecret)

	// Sarah works today.
	resp, _ := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", token(t, userB, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pre-deactivation /me status = %d", resp.StatusCode)
	}

	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/admin/users/user-b/deactivate", adminTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("deactivate status = %d, body %s", resp.StatusCode, raw)
	}

	// FR-23.3: every authenticated request fails with the distinct code.
	resp, raw = doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", token(t, userB, testSecret), nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("deactivated /me status = %d, want 403", resp.StatusCode)
	}
	var apiErr struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &apiErr); err != nil || apiErr.Error.Code != "account_deactivated" {
		t.Errorf("error code = %q (%s), want account_deactivated", apiErr.Error.Code, raw)
	}

	// ...and vanishes from the member picker (FR-23.3).
	resp, raw = doJSON(t, http.MethodGet, srv.URL+"/api/v1/users", adminTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatal(resp.StatusCode)
	}
	var dir struct {
		Users []struct {
			UserID string `json:"user_id"`
		} `json:"users"`
	}
	if err := json.Unmarshal(raw, &dir); err != nil {
		t.Fatal(err)
	}
	for _, u := range dir.Users {
		if u.UserID == "user-b" {
			t.Error("deactivated account must not appear in GET /users")
		}
	}

	resp, _ = doJSON(t, http.MethodPost, srv.URL+"/api/v1/admin/users/user-b/reactivate", adminTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("reactivate status = %d", resp.StatusCode)
	}
	resp, _ = doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", token(t, userB, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("post-reactivation /me status = %d, want 200", resp.StatusCode)
	}
}

func TestAdmin_DeactivateEdgeCases(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(`UPDATE users SET is_instance_admin = 1 WHERE id IN ('user-a', 'user-b')`); err != nil {
		t.Fatal(err)
	}
	adminTok := token(t, userA, testSecret)

	// Fellow admins cannot be deactivated (FR-23.3).
	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/admin/users/user-b/deactivate", adminTok, nil)
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("deactivate admin status = %d, want 409 (%s)", resp.StatusCode, raw)
	}

	resp, _ = doJSON(t, http.MethodPost, srv.URL+"/api/v1/admin/users/nobody/deactivate", adminTok, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("deactivate missing status = %d, want 404", resp.StatusCode)
	}
}

// FR-23.4: profile intervention clears avatar and display name; the
// name re-stamps from the IdP at the next login (store-level test).
func TestAdmin_ProfileIntervention(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	seed := []string{
		`UPDATE users SET is_instance_admin = 1 WHERE id = 'user-a'`,
		`UPDATE users SET avatar_image = X'FFD8FF', avatar_mime = 'image/jpeg' WHERE id = 'user-b'`,
	}
	for _, q := range seed {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	adminTok := token(t, userA, testSecret)

	resp, _ := doJSON(t, http.MethodDelete, srv.URL+"/api/v1/admin/users/user-b/avatar", adminTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("reset avatar status = %d", resp.StatusCode)
	}
	resp, _ = doJSON(t, http.MethodDelete, srv.URL+"/api/v1/admin/users/user-b/display-name", adminTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("reset display name status = %d", resp.StatusCode)
	}

	var name string
	var img any
	if err := st.DB().QueryRow(`SELECT display_name, avatar_image FROM users WHERE id = 'user-b'`).Scan(&name, &img); err != nil {
		t.Fatal(err)
	}
	if name != "" || img != nil {
		t.Errorf("profile not reset: name=%q img=%v", name, img)
	}
}

func TestMe_IncludesInstanceAdmin(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(`UPDATE users SET is_instance_admin = 1 WHERE id = 'user-a'`); err != nil {
		t.Fatal(err)
	}

	check := func(tok string, want bool) {
		t.Helper()
		resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", tok, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("/me status = %d", resp.StatusCode)
		}
		var me struct {
			IsInstanceAdmin bool `json:"is_instance_admin"`
		}
		if err := json.Unmarshal(raw, &me); err != nil {
			t.Fatal(err)
		}
		if me.IsInstanceAdmin != want {
			t.Errorf("is_instance_admin = %v, want %v", me.IsInstanceAdmin, want)
		}
	}
	check(token(t, userA, testSecret), true)
	check(token(t, userB, testSecret), false)
}
