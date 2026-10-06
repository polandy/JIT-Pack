package api_test

import (
	"net/http"
	"testing"
)

// A push answers one result per mutation, but its side effects — the G-3
// lock events and the FR-6.2 notifications — run after it, over the batch
// again. A mutation refused before the store sees it (a malformed clock, an
// over-long mark) must not move any other mutation's verdict onto its
// neighbour: a refused write announcing a lock, an applied one losing its
// notification.
func TestPush_EarlyRefusal_DoesNotShiftSideEffects(t *testing.T) {
	srv := newTestWSServer(t)
	seedItem(t, srv.inner, "item-1", "Zelt")
	seedItem(t, srv.inner, "item-2", "Socken")

	ws := wsConnectAuth(t, srv, userB)
	wsSendMsg(t, ws, map[string]any{"subscribe": []string{"trip:" + trip}})
	if evt := wsReadMsg(t, ws); evt["type"] != "presence" {
		t.Fatalf("expected initial presence, got %v", evt["type"])
	}

	takeOn := map[string]any{"packer_user_id": userB, "state": "packing_now"}
	body := map[string]any{"mutations": []any{
		// Refused by the API before the store: the clock is unorderable.
		mutation("item-1", "m-bad-hlc", "upsert", map[string]any{"quantity": 3}, "~"),
		// Applied: it earns user-b's notification and the lock.
		mutation("item-1", "m-applied", "upsert", takeOn, "0000000002000-0000-aaaaaaaa"),
		// Refused by the store: its container is gone. It earns nothing.
		mutation("item-2", "m-refused", "upsert",
			map[string]any{"packer_user_id": userB, "state": "packing_now", "container_id": "gone-container"},
			"0000000003000-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, pushURL(srv.inner), token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d (body %s)", resp.StatusCode, raw)
	}
	results := decodeResults(t, raw)
	want := []string{"rejected", "applied", "rejected"}
	if len(results) != len(want) {
		t.Fatalf("results = %+v, want %v", results, want)
	}
	for i, w := range want {
		if results[i].Outcome != w {
			t.Fatalf("result %d = %q, want %q (%+v)", i, results[i].Outcome, w, results)
		}
	}

	evt := wsReadMsg(t, ws)
	if evt["type"] != "item.locked" {
		t.Fatalf("first event = %v, want item.locked", evt["type"])
	}
	if payload, _ := evt["payload"].(map[string]any); payload["item_id"] != "item-1" {
		t.Errorf("locked item = %v, want item-1 — the refused write announced the lock", payload["item_id"])
	}
	if evt := wsReadMsg(t, ws); evt["type"] != "trip.changed" {
		t.Fatalf("second event = %v, want trip.changed — a second lock event was sent", evt["type"])
	}

	got := listNotifications(t, srv.inner, userB, "")
	if len(got.Notifications) != 1 {
		t.Fatalf("user-b notifications = %d, want 1 (%+v)", len(got.Notifications), got.Notifications)
	}
	if item := got.Notifications[0].Payload["item_id"]; item != "item-1" {
		t.Errorf("notified item = %v, want item-1 — the refused write earned the applied one's notification", item)
	}
}
