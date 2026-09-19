package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"jitpack/internal/store"
)

// FR-30.4 through the push path: an entry bought by one account reaches the
// pull with that account as its buyer — whatever the client claimed — and a
// taken-back purchase reaches it with neither buyer nor time.
func TestPush_ShoppingEntryPurchase_StampsTheBuyer_FR30_4(t *testing.T) {
	srv := newTestServer(t)

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "se-1", "op": "insert", "table": store.TableShoppingEntries, "id": "entry-1",
		"fields": map[string]any{"trip_id": trip, "name": "Milch", "list": "buy_local", "bought": 0},
		"hlc":    "0000000001000-0000-aaaaaaaa",
	})
	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "se-2", "op": "upsert", "table": store.TableShoppingEntries, "id": "entry-1",
		"fields": map[string]any{"bought": 1, "bought_at": "2026-09-19T14:32:00Z", "bought_by_user_id": userB},
		"hlc":    "0000000002000-0000-aaaaaaaa",
	})

	row := pulledRow(t, srv.URL, "entry-1")
	if row["bought_by_user_id"] != userA {
		t.Errorf("bought_by_user_id = %v, want %s — the pusher, not the client's claim", row["bought_by_user_id"], userA)
	}
	if row["bought_at"] != "2026-09-19T14:32:00Z" {
		t.Errorf("bought_at = %v, want the tap time", row["bought_at"])
	}

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "se-3", "op": "upsert", "table": store.TableShoppingEntries, "id": "entry-1",
		"fields": map[string]any{"bought": 0},
		"hlc":    "0000000003000-0000-aaaaaaaa",
	})
	row = pulledRow(t, srv.URL, "entry-1")
	if row["bought_by_user_id"] != nil || row["bought_at"] != nil {
		t.Errorf("record = (%v, %v), want both cleared", row["bought_by_user_id"], row["bought_at"])
	}
}

// pulledRow reads one row of the test trip's partition as a fresh pull
// returns it.
func pulledRow(t *testing.T, srv, id string) map[string]any {
	t.Helper()
	resp, raw := doJSON(t, http.MethodGet, srv+"/api/v1/trips/"+trip+"/sync?cursor=0", token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d", resp.StatusCode)
	}
	var pull struct {
		Changes []struct {
			ID  string         `json:"id"`
			Row map[string]any `json:"row"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pull); err != nil {
		t.Fatal(err)
	}
	for _, c := range pull.Changes {
		if c.ID == id {
			return c.Row
		}
	}
	t.Fatalf("row %s not in the pull", id)
	return nil
}
