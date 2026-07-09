package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

// Master-partition endpoints (Sync-API Spec §4/§5): GET/POST
// /api/v1/sync/master, per-user visibility, and the master.changed
// WebSocket event (§7) delivered to the pushing user's devices only
// (lazy discovery for everyone else, §8).

func masterMutation(table, id, mutID, op string, fields map[string]any, hlc string) map[string]any {
	return map[string]any{
		"mutation_id": mutID, "op": op, "table": table,
		"id": id, "fields": fields, "hlc": hlc,
	}
}

func TestMasterPushPull_RoundTrip(t *testing.T) {
	srv := newTestServer(t)
	url := srv.URL + "/api/v1/sync/master"
	body := map[string]any{"mutations": []any{
		masterMutation("items", "item-m1", "mm-1", "insert",
			map[string]any{"name": "Stirnlampe", "unit": "pieces", "is_consumable": 0},
			"0000000001000-0000-aaaaaaaa"),
	}}

	resp, raw := doJSON(t, http.MethodPost, url, token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	var pushOut struct {
		Results []struct {
			Outcome string `json:"outcome"`
		} `json:"results"`
		PullHint struct {
			NextCursor int64 `json:"next_cursor"`
		} `json:"pull_hint"`
	}
	if err := json.Unmarshal(raw, &pushOut); err != nil {
		t.Fatalf("decode push: %v (%s)", err, raw)
	}
	if len(pushOut.Results) != 1 || pushOut.Results[0].Outcome != "applied" {
		t.Fatalf("results = %+v, want one applied", pushOut.Results)
	}

	resp, raw = doJSON(t, http.MethodGet, url+"?cursor=0", token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d, body %s", resp.StatusCode, raw)
	}
	var pullOut struct {
		Changes []struct {
			Table string         `json:"table"`
			ID    string         `json:"id"`
			Row   map[string]any `json:"row"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pullOut); err != nil {
		t.Fatalf("decode pull: %v (%s)", err, raw)
	}
	if len(pullOut.Changes) != 1 {
		t.Fatalf("changes = %d, want 1", len(pullOut.Changes))
	}
	c := pullOut.Changes[0]
	if c.Table != "items" || c.ID != "item-m1" || c.Row["name"] != "Stirnlampe" {
		t.Errorf("unexpected change %+v", c)
	}
	if c.Row["created_by"] != userA {
		t.Errorf("created_by = %v, want %s (server-stamped)", c.Row["created_by"], userA)
	}
}

func TestMasterPull_TemplateVisibilityBetweenUsers(t *testing.T) {
	srv := newTestServer(t)
	url := srv.URL + "/api/v1/sync/master"
	body := map[string]any{"mutations": []any{
		masterMutation("templates", "tpl-priv", "mv-1", "insert",
			map[string]any{"name": "Privat", "is_published": 0}, "0000000001000-0000-aaaaaaaa"),
		masterMutation("templates", "tpl-pub", "mv-2", "insert",
			map[string]any{"name": "Publik", "is_published": 1}, "0000000001001-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, url, token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}

	resp, raw = doJSON(t, http.MethodGet, url+"?cursor=0", token(t, userB, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d, body %s", resp.StatusCode, raw)
	}
	var pullOut struct {
		Changes []struct {
			ID string `json:"id"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pullOut); err != nil {
		t.Fatalf("decode pull: %v (%s)", err, raw)
	}
	if len(pullOut.Changes) != 1 || pullOut.Changes[0].ID != "tpl-pub" {
		t.Errorf("user B sees %+v, want only tpl-pub", pullOut.Changes)
	}
}

// The client creates trips by pushing a trips insert to the master
// partition; the server must grant the creator trip access so the
// trip-partition endpoints work immediately afterwards.
func TestMasterPush_TripInsertGrantsTripAccess(t *testing.T) {
	srv := newTestServer(t)
	body := map[string]any{"mutations": []any{
		masterMutation("trips", "trip-client", "mt-1", "insert",
			map[string]any{"name": "Client-Trip", "end_date": "2026-09-01", "status": "planning"},
			"0000000001000-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/sync/master", token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("master push status = %d, body %s", resp.StatusCode, raw)
	}

	tripBody := map[string]any{"mutations": []any{
		map[string]any{"mutation_id": "mt-2", "op": "insert", "table": "trip_items",
			"id": "item-t1", "fields": map[string]any{"trip_id": "trip-client", "name": "Zelt"},
			"hlc": "0000000001001-0000-aaaaaaaa"},
	}}
	resp, raw = doJSON(t, http.MethodPost, srv.URL+"/api/v1/sync/trips/trip-client",
		token(t, userA, testSecret), tripBody)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("trip push after create status = %d, body %s — creator has no membership?", resp.StatusCode, raw)
	}
}

// §7/§8: master.changed goes to the pushing user's own connections
// (multi-device sync); other users discover shared changes lazily.
func TestWS_MasterChangedNotifiesSameUserOnly(t *testing.T) {
	srv := newTestWSServer(t)
	wsA := wsConnectAuth(t, srv, userA)
	wsB := wsConnectAuth(t, srv, userB)

	body := map[string]any{"mutations": []any{
		masterMutation("categories", "cat-ws", "mw-1", "insert",
			map[string]any{"name": "Technik"}, "0000000001000-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, srv.url+"/api/v1/sync/master",
		token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}

	evt := wsReadMsg(t, wsA)
	if evt["type"] != "master.changed" {
		t.Fatalf("type = %v, want master.changed", evt["type"])
	}
	payload := evt["payload"].(map[string]any)
	if payload["seq"].(float64) < 1 {
		t.Error("seq should be >= 1")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	if _, _, err := wsB.Read(ctx); err == nil {
		t.Error("user B must not receive A's master.changed (lazy discovery, §8)")
	}
}
