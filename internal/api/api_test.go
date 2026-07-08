package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

var testSecret = []byte("test-secret-please-rotate-0000000")

const (
	userA = "user-a"
	userB = "user-b"
	trip  = "trip-samedan"
)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	seed := []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-a', 'auth|a', 'Andy')`,
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-b', 'auth|b', 'Sarah')`,
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-x', 'auth|x', 'Stranger')`,
		`INSERT INTO trips (id, name, start_date, end_date) VALUES ('trip-samedan', 'Samedan 2026', '2026-07-10', '2026-07-20')`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip-samedan', 'user-a', 'owner')`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip-samedan', 'user-b', 'editor')`,
	}
	for _, q := range seed {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}
	srv := httptest.NewServer(api.New(st, testSecret).Handler())
	t.Cleanup(srv.Close)
	return srv
}

func token(t *testing.T, sub string, secret []byte) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": sub,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, err := tok.SignedString(secret)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func doJSON(t *testing.T, method, url, bearer string, body any) (*http.Response, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req, err := http.NewRequest(method, url, &buf)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	var out bytes.Buffer
	if _, err := out.ReadFrom(resp.Body); err != nil {
		t.Fatalf("read body: %v", err)
	}
	return resp, out.Bytes()
}

func pushURL(srv *httptest.Server) string {
	return srv.URL + "/api/v1/sync/trips/" + trip
}

func mutation(id, mutID, op string, fields map[string]any, hlc string) map[string]any {
	return map[string]any{
		"mutation_id": mutID, "op": op, "table": "trip_items",
		"id": id, "fields": fields, "hlc": hlc,
	}
}

func TestAuth_MissingToken_Unauthorized(t *testing.T) {
	srv := newTestServer(t)

	resp, _ := doJSON(t, http.MethodGet, pushURL(srv)+"?cursor=0", "", nil)

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestAuth_WrongSignature_Unauthorized(t *testing.T) {
	srv := newTestServer(t)
	forged := token(t, userA, []byte("attacker-secret-0000000000000000"))

	resp, _ := doJSON(t, http.MethodGet, pushURL(srv)+"?cursor=0", forged, nil)

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// FR-4.5: authenticated but not a trip member → forbidden.
func TestPush_NonMember_Forbidden(t *testing.T) {
	srv := newTestServer(t)
	body := map[string]any{"mutations": []any{
		mutation("item-1", "m1", "insert", map[string]any{"trip_id": trip, "name": "Hack"}, "0000000001000-0000-aaaaaaaa"),
	}}

	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, "user-x", testSecret), body)

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403 (body %s)", resp.StatusCode, raw)
	}
}

func TestPushPull_RoundTrip(t *testing.T) {
	srv := newTestServer(t)
	body := map[string]any{"mutations": []any{
		mutation("item-1", "m1", "insert",
			map[string]any{"trip_id": trip, "name": "Unterhosen", "quantity": 5},
			"0000000001000-0000-aaaaaaaa"),
	}}

	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	var pushOut struct {
		Results []struct {
			MutationID string `json:"mutation_id"`
			Outcome    string `json:"outcome"`
		} `json:"results"`
		PullHint struct {
			NextCursor int64 `json:"next_cursor"`
		} `json:"pull_hint"`
	}
	if err := json.Unmarshal(raw, &pushOut); err != nil {
		t.Fatalf("decode push response: %v (%s)", err, raw)
	}
	if len(pushOut.Results) != 1 || pushOut.Results[0].Outcome != "applied" {
		t.Fatalf("results = %+v, want one applied", pushOut.Results)
	}
	if pushOut.PullHint.NextCursor == 0 {
		t.Error("pull_hint.next_cursor = 0, want > 0")
	}

	resp, raw = doJSON(t, http.MethodGet, pushURL(srv)+"?cursor=0", token(t, userB, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d, body %s", resp.StatusCode, raw)
	}
	var pullOut struct {
		Changes []struct {
			Table   string         `json:"table"`
			ID      string         `json:"id"`
			Deleted bool           `json:"deleted"`
			Row     map[string]any `json:"row"`
		} `json:"changes"`
		NextCursor int64 `json:"next_cursor"`
		HasMore    bool  `json:"has_more"`
	}
	if err := json.Unmarshal(raw, &pullOut); err != nil {
		t.Fatalf("decode pull response: %v (%s)", err, raw)
	}
	if len(pullOut.Changes) != 1 {
		t.Fatalf("changes = %d, want 1", len(pullOut.Changes))
	}
	c := pullOut.Changes[0]
	if c.ID != "item-1" || c.Row["name"] != "Unterhosen" || c.Row["quantity"] != float64(5) {
		t.Errorf("unexpected change %+v", c)
	}
}

// Sync-API Spec §5: mutations are applied in order, atomically per
// mutation — a rejected one does not roll back or block the others.
func TestPush_InvalidMutationRejectedPerMutation_OthersApply(t *testing.T) {
	srv := newTestServer(t)
	body := map[string]any{"mutations": []any{
		map[string]any{"mutation_id": "bad", "op": "upsert", "table": "users",
			"id": "user-a", "fields": map[string]any{"display_name": "Mallory"}, "hlc": "0000000001000-0000-aaaaaaaa"},
		mutation("item-1", "good", "insert",
			map[string]any{"trip_id": trip, "name": "Socken"}, "0000000001000-0001-aaaaaaaa"),
	}}

	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Results []struct {
			MutationID string `json:"mutation_id"`
			Outcome    string `json:"outcome"`
			Error      string `json:"error"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
	if out.Results[0].Outcome != "rejected" || out.Results[0].Error == "" {
		t.Errorf("first result = %+v, want rejected with error", out.Results[0])
	}
	if out.Results[1].Outcome != "applied" {
		t.Errorf("second result = %+v, want applied", out.Results[1])
	}
}
