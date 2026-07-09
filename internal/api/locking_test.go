package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

// FR-4.2: actor columns are server-stamped from the authenticated
// pusher — clients cannot spoof them, and placeholder values (the
// client does not know its user id before OIDC) never hit FK
// constraints.

func pushOne(t *testing.T, srv string, user string, mut map[string]any) {
	t.Helper()
	body := map[string]any{"mutations": []any{mut}}
	resp, raw := doJSON(t, http.MethodPost, srv+"/api/v1/sync/trips/"+trip, token(t, user, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Results []struct {
			Outcome string `json:"outcome"`
			Error   string `json:"error"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Results) != 1 || (out.Results[0].Outcome != "applied" && out.Results[0].Outcome != "merged") {
		t.Fatalf("results = %+v, want applied/merged", out.Results)
	}
}

func TestPush_StampsCommentAuthor(t *testing.T) {
	srv := newTestServer(t)

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "sa-1", "op": "insert", "table": "comments", "id": "com-1",
		"fields": map[string]any{
			"trip_id": trip, "trip_item_id": nil, "author_id": "current-user",
			"body": "Hallo", "is_task": 0,
		},
		"hlc": "0000000001000-0000-aaaaaaaa",
	})

	resp, raw := doJSON(t, http.MethodGet, pushURL(srv)+"?cursor=0", token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d", resp.StatusCode)
	}
	var pull struct {
		Changes []struct {
			Table string         `json:"table"`
			Row   map[string]any `json:"row"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pull); err != nil {
		t.Fatal(err)
	}
	if len(pull.Changes) != 1 || pull.Changes[0].Row["author_id"] != userA {
		t.Fatalf("author_id = %v, want %s", pull.Changes[0].Row["author_id"], userA)
	}
}

func TestPush_PackingNow_StampsLockerAndEmitsLockEvents(t *testing.T) {
	srv := newTestWSServer(t)

	// user-b listens on the trip channel.
	ws := wsConnectAuth(t, srv, userB)
	wsSendMsg(t, ws, map[string]any{"subscribe": []string{"trip:" + trip}})
	if evt := wsReadMsg(t, ws); evt["type"] != "presence" {
		t.Fatalf("expected initial presence, got %v", evt["type"])
	}

	pushOne(t, srv.url, userA, map[string]any{
		"mutation_id": "pn-1", "op": "insert", "table": "trip_items", "id": "item-pn",
		"fields": map[string]any{
			"trip_id": trip, "name": "Zelt", "quantity": 1,
			"state": "packing_now", "packing_now_by": "current-user",
		},
		"hlc": "0000000001000-0000-aaaaaaaa",
	})

	// item.locked before the trip.changed ping (ephemeral fast path).
	evt := wsReadMsg(t, ws)
	if evt["type"] != "item.locked" {
		t.Fatalf("type = %v, want item.locked", evt["type"])
	}
	payload := evt["payload"].(map[string]any)
	if payload["item_id"] != "item-pn" || payload["by_user"] != userA || payload["name"] != "Zelt" {
		t.Errorf("unexpected lock payload %+v", payload)
	}
	if evt := wsReadMsg(t, ws); evt["type"] != "trip.changed" {
		t.Fatalf("expected trip.changed after lock, got %v", evt["type"])
	}

	// Completing the pack stamps the packer and unlocks.
	pushOne(t, srv.url, userA, map[string]any{
		"mutation_id": "pn-2", "op": "upsert", "table": "trip_items", "id": "item-pn",
		"fields": map[string]any{
			"state": "packed", "packed_count": 1,
			"packing_now_by": nil, "packing_now_at": nil,
		},
		"hlc": "0000000002000-0000-aaaaaaaa",
	})

	evt = wsReadMsg(t, ws)
	if evt["type"] != "item.unlocked" {
		t.Fatalf("type = %v, want item.unlocked", evt["type"])
	}
	if evt["payload"].(map[string]any)["item_id"] != "item-pn" {
		t.Error("unlock payload missing item_id")
	}

	// Synced row carries the stamped actor columns.
	resp, raw := doJSON(t, http.MethodGet, srv.url+"/api/v1/sync/trips/"+trip+"?cursor=0",
		token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d", resp.StatusCode)
	}
	var pull struct {
		Changes []struct {
			Row map[string]any `json:"row"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pull); err != nil {
		t.Fatal(err)
	}
	row := pull.Changes[0].Row
	if row["packer_user_id"] != userA {
		t.Errorf("packer_user_id = %v, want %s (FR-4.2)", row["packer_user_id"], userA)
	}
	if row["packing_now_by"] != nil {
		t.Errorf("packing_now_by = %v, want cleared", row["packing_now_by"])
	}
}

func TestPush_PackingNow_SetsLockTimestamp(t *testing.T) {
	srv := newTestServer(t)

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "ts-1", "op": "insert", "table": "trip_items", "id": "item-ts",
		"fields": map[string]any{
			"trip_id": trip, "name": "Zelt", "state": "packing_now",
		},
		"hlc": "0000000001000-0000-aaaaaaaa",
	})

	resp, raw := doJSON(t, http.MethodGet, pushURL(srv)+"?cursor=0", token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatal("pull failed")
	}
	var pull struct {
		Changes []struct {
			Row map[string]any `json:"row"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pull); err != nil {
		t.Fatal(err)
	}
	at, _ := pull.Changes[0].Row["packing_now_at"].(string)
	if at == "" {
		t.Fatal("packing_now_at must be server-stamped when absent")
	}
	if parsed, err := time.Parse(time.RFC3339, at); err != nil || time.Since(parsed) > time.Minute {
		t.Errorf("packing_now_at = %q, want a fresh RFC3339 timestamp", at)
	}
}
