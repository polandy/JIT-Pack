package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

// The four routes are four registrations of one handler, each binding a table
// to a path variable — so the defect they invite is a copy-paste that deletes
// from the wrong table while answering 200. Driving all four in one table and
// asserting on the *other* rows is what catches that.
//
// Every target here is a row nothing references, deliberately: FR-24.3's
// retire and the FK cascade are real behaviours with their own tests, and a
// row subject to either would make this test answer a question it is not
// asking.
func TestDeleteMasterRow_EachRouteDeletesItsOwnTable(t *testing.T) {
	cases := []struct {
		name  string
		path  string
		table string
		id    string
	}{
		{"tag", "/api/v1/master/tags/tag-1", "tags", "tag-1"},
		{"item", "/api/v1/master/items/it-solo", "items", "it-solo"},
		{"template", "/api/v1/master/templates/tpl-solo", "templates", "tpl-solo"},
		{"templateItem", "/api/v1/master/template-items/tit-1", "template_items", "tit-1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, st := newTestServerWithStore(t)
			seedDeletableMaster(t, st)

			resp, raw := doJSON(t, http.MethodDelete, srv.URL+tc.path, token(t, userA, testSecret), nil)
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
			}

			// Every other seeded row must still be there: a handler bound to
			// the wrong table answers 200 just as convincingly.
			for _, other := range cases {
				want := 1
				if other.table == tc.table {
					want = 0
				}
				var n int
				if err := st.DB().QueryRow(
					`SELECT count(*) FROM `+other.table+` WHERE id = ?`, other.id).Scan(&n); err != nil {
					t.Fatalf("count %s: %v", other.table, err)
				}
				if n != want {
					t.Errorf("%s/%s count = %d, want %d — the route deleted from the wrong table",
						other.table, other.id, n, want)
				}
			}
		})
	}
}

// FR-24.3's retire, seen from outside: the response is a 200 like any other
// delete, and `retired` is the only thing that says the row is still there.
func TestDeleteMasterTemplate_ATripGeneratedFrom_Answers200AndRetiredTrue_FR24_3(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	seedDeletableMaster(t, st)
	if _, err := st.DB().Exec(
		`INSERT INTO trip_items (id, trip_id, name, source_template_id) VALUES ('ti-1', ?, 'Zahnbürste', 'tpl-1')`,
		trip); err != nil {
		t.Fatalf("seed provenance: %v", err)
	}

	resp, raw := doJSON(t, http.MethodDelete, srv.URL+"/api/v1/master/templates/tpl-1",
		token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var out api.MasterDeleteResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}
	if !out.Retired {
		t.Error("retired = false — the caller is told the Vorlage is gone while FR-9.2 keeps it")
	}
	var n int
	if err := st.DB().QueryRow(`SELECT count(*) FROM templates WHERE id = 'tpl-1'`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Error("the Vorlage was removed outright — an archived trip lost its provenance")
	}
}

// The negative half of the same field, so `retired` is not simply always
// true: a row nothing points at is gone, and the response says so.
func TestDeleteMasterItem_NothingReferences_Answers200AndRetiredFalse_FR24_3(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(`INSERT INTO items (id, name) VALUES ('it-lonely', 'Vertipper')`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	resp, raw := doJSON(t, http.MethodDelete, srv.URL+"/api/v1/master/items/it-lonely",
		token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var out api.MasterDeleteResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}
	if out.Retired {
		t.Error("retired = true for a row nothing references")
	}
	if out.PullHint.NextCursor == 0 {
		t.Error("pull_hint.next_cursor = 0 — no device can find out the row went away")
	}
}

// A script working through a list of ids has to be able to tell a row it
// deleted from one that was never there; both answering 200 would report
// success for every typo.
func TestDeleteMasterRow_UnknownID_Is404(t *testing.T) {
	srv, _ := newTestServerWithStore(t)

	resp, raw := doJSON(t, http.MethodDelete, srv.URL+"/api/v1/master/items/it-never-existed",
		token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404, body %s", resp.StatusCode, raw)
	}
	if code := errorCode(t, raw); code != string(api.ErrNotFound) {
		t.Errorf("error code = %q, want %q", code, api.ErrNotFound)
	}
}

// The endpoint writes, so it is behind the same gate every other write is.
func TestDeleteMasterRow_WithoutAToken_Is401AndDeletesNothing(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	seedDeletableMaster(t, st)

	resp, _ := doJSON(t, http.MethodDelete, srv.URL+"/api/v1/master/items/it-1", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
	var n int
	if err := st.DB().QueryRow(`SELECT count(*) FROM items WHERE id = 'it-1'`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Error("the row was deleted by an unauthenticated caller")
	}
}

// seedDeletableMaster puts one row in each deletable table, wired the way the
// app would have them: the position names both the item and the Vorlage.
func seedDeletableMaster(t *testing.T, st *store.Store) {
	t.Helper()
	for _, q := range []string{
		`INSERT INTO tags (id, name) VALUES ('tag-1', 'Sommer')`,
		// it-1 and tpl-1 are the referenced pair: the position holds the
		// item alive and belongs to the Vorlage. it-solo and tpl-solo are
		// the unreferenced ones a plain delete removes.
		`INSERT INTO items (id, name) VALUES ('it-1', 'Zahnbürste')`,
		`INSERT INTO items (id, name) VALUES ('it-solo', 'Vertipper')`,
		`INSERT INTO templates (id, name, kind, owner_id) VALUES ('tpl-1', 'Kulturbeutel', 'group', 'user-a')`,
		`INSERT INTO templates (id, name, kind, owner_id) VALUES ('tpl-solo', 'Leer', 'group', 'user-a')`,
		`INSERT INTO template_items (id, template_id, item_id, quantity) VALUES ('tit-1', 'tpl-1', 'it-1', 1)`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}
}
