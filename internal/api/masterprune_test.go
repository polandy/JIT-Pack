package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"jitpack/internal/api"
)

// FR-5.8 seen from the device: the answer says whether the item went, and a
// used one comes back untouched rather than retired (ADR-065). The store's
// own tests cover each kind of use; these pin the route, the shape and that
// a kept item is not the retire DELETE answers with.
func TestPruneMasterItem_Route_AnswersPrunedPerUse_FR5_8(t *testing.T) {
	cases := []struct {
		name       string
		id         string
		wantPruned bool
		wantRows   int
	}{
		{"an item nothing uses goes", "it-solo", true, 0},
		{"an item a Vorlage uses stays", "it-1", false, 1},
		{"an item that is already gone is not an error", "it-nowhere", false, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, st := newTestServerWithStore(t)
			seedDeletableMaster(t, st)

			resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/master/items/"+tc.id+"/prune",
				token(t, userA, testSecret), nil)
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
			}
			var out api.MasterPruneResponse
			if err := json.Unmarshal(raw, &out); err != nil {
				t.Fatalf("decode: %v (%s)", err, raw)
			}
			if out.Pruned != tc.wantPruned {
				t.Errorf("pruned = %v, want %v", out.Pruned, tc.wantPruned)
			}
			if out.Pruned != (out.PullHint.NextCursor > 0) {
				t.Errorf("next_cursor = %d with pruned = %v — a delete owes a cursor, a no-op none",
					out.PullHint.NextCursor, out.Pruned)
			}
			var rows, retired int
			if err := st.DB().QueryRow(
				`SELECT count(*), count(retired_at) FROM items WHERE id = ?`, tc.id).Scan(&rows, &retired); err != nil {
				t.Fatalf("count: %v", err)
			}
			if rows != tc.wantRows || retired != 0 {
				t.Errorf("rows/retired = %d/%d, want %d/0", rows, retired, tc.wantRows)
			}
		})
	}
}

func TestPruneMasterItem_Route_RequiresAuth(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	seedDeletableMaster(t, st)

	resp, _ := doJSON(t, http.MethodPost, srv.URL+"/api/v1/master/items/it-solo/prune", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}
