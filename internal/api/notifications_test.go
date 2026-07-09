package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// FR-6.2 end-to-end over real HTTP: delegation, @mention, and task
// triggers detected in push batches; fetch/read/prefs endpoints.

type notificationList struct {
	Notifications []struct {
		ID        string         `json:"id"`
		Kind      string         `json:"kind"`
		Payload   map[string]any `json:"payload"`
		CreatedAt string         `json:"created_at"`
		ReadAt    *string        `json:"read_at"`
	} `json:"notifications"`
}

func listNotifications(t *testing.T, srv *httptest.Server, user string, query string) notificationList {
	t.Helper()
	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/notifications"+query, token(t, user, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d (body %s)", resp.StatusCode, raw)
	}
	var out notificationList
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	return out
}

func pushAs(t *testing.T, srv *httptest.Server, user string, mutations ...map[string]any) {
	t.Helper()
	anyMuts := make([]any, len(mutations))
	for i, m := range mutations {
		anyMuts[i] = m
	}
	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, user, testSecret),
		map[string]any{"mutations": anyMuts})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d (body %s)", resp.StatusCode, raw)
	}
}

func seedItem(t *testing.T, srv *httptest.Server, id, name string) {
	t.Helper()
	pushAs(t, srv, userA, mutation(id, "seed-"+id, "insert",
		map[string]any{"trip_id": trip, "name": name}, "0000000001000-0000-aaaaaaaa"))
}

func TestNotifications_DelegationNotifiesTarget(t *testing.T) {
	srv := newTestServer(t)
	seedItem(t, srv, "item-1", "Zelt")

	// user-a delegates the item to user-b (FR-4.3).
	pushAs(t, srv, userA, mutation("item-1", "m-delegate", "upsert",
		map[string]any{"packer_user_id": userB}, "0000000002000-0000-aaaaaaaa"))

	got := listNotifications(t, srv, userB, "")
	if len(got.Notifications) != 1 {
		t.Fatalf("user-b notifications = %d, want 1", len(got.Notifications))
	}
	n := got.Notifications[0]
	if n.Kind != "delegation" {
		t.Errorf("kind = %q, want delegation", n.Kind)
	}
	if n.Payload["trip_id"] != trip || n.Payload["item_id"] != "item-1" ||
		n.Payload["actor_id"] != userA || n.Payload["actor_name"] != "Andy" ||
		n.Payload["item_name"] != "Zelt" {
		t.Errorf("payload = %+v", n.Payload)
	}

	// The actor gets nothing.
	if own := listNotifications(t, srv, userA, ""); len(own.Notifications) != 0 {
		t.Errorf("actor notifications = %d, want 0", len(own.Notifications))
	}
}

func TestNotifications_SelfPackDoesNotNotify(t *testing.T) {
	srv := newTestServer(t)
	seedItem(t, srv, "item-1", "Zelt")

	// Packing stamps packer_user_id = actor (stampActor) — never a delegation.
	pushAs(t, srv, userB, mutation("item-1", "m-pack", "upsert",
		map[string]any{"state": "packed", "packed_count": 1}, "0000000002000-0000-bbbbbbbb"))

	if got := listNotifications(t, srv, userB, ""); len(got.Notifications) != 0 {
		t.Errorf("notifications = %d, want 0", len(got.Notifications))
	}
}

func TestNotifications_MentionInComment(t *testing.T) {
	srv := newTestServer(t)
	seedItem(t, srv, "item-1", "Zelt")

	pushAs(t, srv, userA, map[string]any{
		"mutation_id": "m-comment", "op": "insert", "table": "comments", "id": "c-1",
		"fields": map[string]any{
			"trip_id": trip, "trip_item_id": "item-1",
			"body": "Hey @sarah, bitte Heringe prüfen", "is_task": 0,
		},
		"hlc": "0000000002000-0000-aaaaaaaa",
	})

	got := listNotifications(t, srv, userB, "?unread=1")
	if len(got.Notifications) != 1 {
		t.Fatalf("mentions = %d, want 1", len(got.Notifications))
	}
	n := got.Notifications[0]
	if n.Kind != "mention" {
		t.Errorf("kind = %q, want mention", n.Kind)
	}
	if n.Payload["comment_id"] != "c-1" || n.Payload["item_name"] != "Zelt" {
		t.Errorf("payload = %+v", n.Payload)
	}
	if preview, _ := n.Payload["preview"].(string); preview == "" {
		t.Error("payload must carry a body preview")
	}
}

func TestNotifications_TaskOnDelegatedItem_SingleNotification(t *testing.T) {
	srv := newTestServer(t)
	seedItem(t, srv, "item-1", "Zelt")
	pushAs(t, srv, userA, mutation("item-1", "m-delegate", "upsert",
		map[string]any{"packer_user_id": userB}, "0000000002000-0000-aaaaaaaa"))

	// Task comment that ALSO mentions the packer: task wins, exactly one
	// notification for the comment.
	pushAs(t, srv, userA, map[string]any{
		"mutation_id": "m-task", "op": "insert", "table": "comments", "id": "c-2",
		"fields": map[string]any{
			"trip_id": trip, "trip_item_id": "item-1",
			"body": "@Sarah Ventil kaputt, ersetzen", "is_task": 1, "task_state": "open",
		},
		"hlc": "0000000003000-0000-aaaaaaaa",
	})

	got := listNotifications(t, srv, userB, "")
	// 1 delegation + 1 task, no separate mention.
	if len(got.Notifications) != 2 {
		t.Fatalf("notifications = %d, want 2 (delegation + task)", len(got.Notifications))
	}
	kinds := map[string]bool{}
	for _, n := range got.Notifications {
		kinds[n.Kind] = true
	}
	if !kinds["delegation"] || !kinds["task"] {
		t.Errorf("kinds = %v, want delegation+task", kinds)
	}
}

func TestNotifications_PrefsSuppressAndRoundTrip(t *testing.T) {
	srv := newTestServer(t)
	seedItem(t, srv, "item-1", "Zelt")

	resp, _ := doJSON(t, http.MethodPut, srv.URL+"/api/v1/me/notification-prefs",
		token(t, userB, testSecret), map[string]bool{"delegation": false})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("put prefs status = %d", resp.StatusCode)
	}

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me/notification-prefs",
		token(t, userB, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get prefs status = %d", resp.StatusCode)
	}
	var prefs map[string]bool
	if err := json.Unmarshal(raw, &prefs); err != nil {
		t.Fatal(err)
	}
	if prefs["delegation"] || !prefs["mention"] || !prefs["task"] {
		t.Errorf("prefs = %v, want delegation off, rest on", prefs)
	}

	pushAs(t, srv, userA, mutation("item-1", "m-delegate", "upsert",
		map[string]any{"packer_user_id": userB}, "0000000002000-0000-aaaaaaaa"))

	if got := listNotifications(t, srv, userB, ""); len(got.Notifications) != 0 {
		t.Errorf("suppressed kind produced %d notifications", len(got.Notifications))
	}
}

func TestNotifications_MarkRead(t *testing.T) {
	srv := newTestServer(t)
	seedItem(t, srv, "item-1", "Zelt")
	pushAs(t, srv, userA, mutation("item-1", "m-delegate", "upsert",
		map[string]any{"packer_user_id": userB}, "0000000002000-0000-aaaaaaaa"))

	id := listNotifications(t, srv, userB, "").Notifications[0].ID

	// Another user cannot mark it.
	resp, _ := doJSON(t, http.MethodPost, srv.URL+"/api/v1/notifications/"+id+"/read",
		token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("foreign mark-read status = %d, want 404", resp.StatusCode)
	}

	resp, _ = doJSON(t, http.MethodPost, srv.URL+"/api/v1/notifications/"+id+"/read",
		token(t, userB, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("own mark-read status = %d, want 200", resp.StatusCode)
	}
	if got := listNotifications(t, srv, userB, "?unread=1"); len(got.Notifications) != 0 {
		t.Errorf("unread after read = %d, want 0", len(got.Notifications))
	}
}

func TestNotifications_WSNotificationCreated(t *testing.T) {
	srv := newTestWSServer(t)
	seedItem(t, srv.inner, "item-1", "Zelt")

	// user-b connects (no subscription needed — delivery is by identity).
	ws := wsConnectAuth(t, srv, userB)

	pushAs(t, srv.inner, userA, mutation("item-1", "m-delegate", "upsert",
		map[string]any{"packer_user_id": userB}, "0000000002000-0000-aaaaaaaa"))

	evt := wsReadMsg(t, ws)
	if evt["type"] != "notification.created" {
		t.Fatalf("event type = %v, want notification.created", evt["type"])
	}
	payload, _ := evt["payload"].(map[string]any)
	if id, _ := payload["notification_id"].(string); id == "" {
		t.Errorf("payload = %+v, want notification_id", payload)
	}
}

// FR-17.3: Single-User Mode has no second party — the FR-6.2 detection
// must not run at all, even if a push carries a foreign packer_user_id.
func TestNotifications_SingleUserMode_Inert(t *testing.T) {
	srv, _ := newSingleUserTestServer(t)

	body := map[string]any{"mutations": []any{
		mutation("item-1", "m1", "insert",
			map[string]any{"trip_id": trip, "name": "Zelt"}, "0000000001000-0000-aaaaaaaa"),
	}}
	resp, _ := doJSON(t, http.MethodPost, pushURL(srv), "", body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d", resp.StatusCode)
	}

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/notifications", "", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d", resp.StatusCode)
	}
	var out notificationList
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Notifications) != 0 {
		t.Errorf("notifications = %d, want 0", len(out.Notifications))
	}
}
