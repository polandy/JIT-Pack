package api_test

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// A request body is bounded before it is decoded. maxPushBatch has always
// capped how many mutations one push may carry, but a mutation's fields are
// free-form JSON: one of them could make the server allocate without limit.

// Both probes exceed their endpoint's limit on their own, carried in a field
// that has no length of its own.
const (
	overPushLimit  = 9 << 20
	overSmallLimit = 128 << 10
)

func TestPush_ABodyOverTheLimitIsRefusedAndNotApplied(t *testing.T) {
	srv, st := newTestServerWithStore(t)

	// A single, entirely valid mutation — only its name is absurd. Without
	// the limit the server decodes it, applies it, and answers 200.
	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret),
		map[string]any{"mutations": []any{
			mutation("item-huge", "m-huge", "insert", map[string]any{
				"trip_id": trip,
				"name":    strings.Repeat("x", overPushLimit),
			}, "0000000001000-0000-aaaaaaaa"),
		}})

	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Errorf("status = %d, want 413", resp.StatusCode)
	}
	if code := errorCode(t, raw); code != "payload_too_large" {
		t.Errorf("error code = %q, want payload_too_large", code)
	}
	var rows int
	if err := st.DB().QueryRow(
		`SELECT count(*) FROM trip_items WHERE id = 'item-huge'`).Scan(&rows); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if rows != 0 {
		t.Error("a body refused for its size must not have been applied")
	}
}

// The limit is only safe if it is above what the client can generate. The
// client chunks at maxPushBatch, so the fattest push it can build is a full
// batch of rows with every syncable column set — this pushes exactly that.
func TestPush_AFullFatBatchIsAdmitted(t *testing.T) {
	srv, st := newTestServerWithStore(t)

	const batch = 200
	muts := make([]any, 0, batch)
	for i := range batch {
		id := "fat-" + strings.Repeat("0", 30) + strconv.Itoa(i)
		muts = append(muts, mutation(id, "m-"+id, "insert", map[string]any{
			"trip_id":       trip,
			"name":          strings.Repeat("Regenjacke ", 40),
			"category_name": strings.Repeat("Kleidung ", 20),
			"weight_grams":  1234,
			"value_cents":   9999,
			"quantity":      3,
			"packed_count":  0,
			"state":         "open",
			"mode":          "pack",
			"late_packer":   0,
			"flag_unused":   0,
			"flag_missing":  0,
			"bought_from":   "buy_before",
		}, "0000000001000-0000-aaaaaaaa"))
	}

	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret),
		map[string]any{"mutations": muts})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d (body %s), want 200: a full batch must never be refused for its size",
			resp.StatusCode, raw)
	}
	var rows int
	if err := st.DB().QueryRow(
		`SELECT count(*) FROM trip_items WHERE id LIKE 'fat-%'`).Scan(&rows); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if rows != batch {
		t.Errorf("applied rows = %d, want %d", rows, batch)
	}
}

func TestPutNotificationPrefs_ABodyOverTheLimitIsRefusedAndNotSaved(t *testing.T) {
	srv, st := newTestServerWithStore(t)

	prefs := make(map[string]bool, 4096)
	for i := 0; len(prefs)*30 < overSmallLimit; i++ {
		prefs["k"+strings.Repeat("0", 24)+strconv.Itoa(i)] = true
	}
	resp, raw := doJSON(t, http.MethodPut, srv.URL+"/api/v1/me/notification-prefs",
		token(t, userA, testSecret), prefs)

	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Errorf("status = %d, want 413", resp.StatusCode)
	}
	if code := errorCode(t, raw); code != "payload_too_large" {
		t.Errorf("error code = %q, want payload_too_large", code)
	}
	var stored *string
	if err := st.DB().QueryRow(
		`SELECT notification_prefs FROM users WHERE id = ?`, userA).Scan(&stored); err != nil {
		t.Fatalf("read prefs: %v", err)
	}
	if stored != nil {
		t.Errorf("prefs = %q, want unwritten: a body refused for its size saves nothing", *stored)
	}

	// The control: the same endpoint still takes a real body.
	ok, _ := doJSON(t, http.MethodPut, srv.URL+"/api/v1/me/notification-prefs",
		token(t, userA, testSecret), map[string]bool{"delegation": false})
	if ok.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 for an ordinary prefs body", ok.StatusCode)
	}
}

// The limit has to hold where nobody has proved who they are. In
// Single-User Mode authentication is bypassed at the deployment level, so
// this endpoint answers an anonymous caller (Addendum FR-17.13).
func TestSingleUserDisplayName_ABodyOverTheLimitIsRefusedAndNotSaved(t *testing.T) {
	srv, localID, st := newSingleUserTestServerWithStore(t)

	resp, raw := doJSON(t, http.MethodPut, displayNameURL(srv, localID), "",
		map[string]any{"display_name": strings.Repeat("n", overSmallLimit)})

	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Errorf("status = %d, want 413", resp.StatusCode)
	}
	if code := errorCode(t, raw); code != "payload_too_large" {
		t.Errorf("error code = %q, want payload_too_large", code)
	}
	var name string
	if err := st.DB().QueryRow(
		`SELECT display_name FROM users WHERE id = ?`, localID).Scan(&name); err != nil {
		t.Fatalf("read display name: %v", err)
	}
	// The store refuses a name this long on its own (FR-17.13), so this
	// clause is true either way — the falsifiable half is the code above,
	// which was `validation` before the limit existed.
	if len(name) > 50 {
		t.Errorf("display_name is %d bytes: a body refused for its size saves nothing", len(name))
	}
}

// The two subscription endpoints refuse an incomplete body as well as an
// oversized one. Splitting the two refusals apart — the size limit needs its
// own answer — left the field check its own branch, and neither endpoint had
// ever had that branch driven.
func TestPushSubscriptions_AnIncompleteBodyIsRefused(t *testing.T) {
	subscriptionsURL := func(srv *httptest.Server) string {
		return srv.URL + "/api/v1/push/subscriptions"
	}
	cases := []struct {
		name   string
		method string
		body   map[string]any
	}{
		{"register without an endpoint", http.MethodPost,
			map[string]any{"keys": map[string]any{"p256dh": "k", "auth": "a"}}},
		{"register without keys", http.MethodPost,
			map[string]any{"endpoint": "https://push.example/x"}},
		{"register with half the keys", http.MethodPost,
			map[string]any{"endpoint": "https://push.example/x",
				"keys": map[string]any{"p256dh": "k"}}},
		{"unregister without an endpoint", http.MethodDelete, map[string]any{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := newTestServer(t)
			resp, raw := doJSON(t, tc.method, subscriptionsURL(srv), token(t, userA, testSecret), tc.body)
			if resp.StatusCode != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d (body %s), want 422", resp.StatusCode, raw)
			}
			if code := errorCode(t, raw); code != "validation" {
				t.Errorf("error code = %q, want validation", code)
			}
		})
	}
}
