package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// FR-5.7 over real HTTP: a claim ends because a person ended it, and the
// person it was taken from hears about it.

// claimRow has userA start packing a row, which is the only state a
// takeover applies to. It goes through push so the claim is stamped the
// way a real one is (invariant 3).
func claimRow(t *testing.T, srv string) {
	t.Helper()
	pushOne(t, srv, userA, map[string]any{
		"mutation_id": "to-seed", "op": "insert", "table": "trip_items", "id": "ti-1",
		"fields": map[string]any{"trip_id": trip, "name": "Zelt", "quantity": 1, "state": "packing_now"},
		"hlc":    "0000000001000-0000-aaaaaaaa",
	})
}

func takeOver(t *testing.T, srv, user, itemID string) (*http.Response, []byte) {
	t.Helper()
	return doJSON(t, http.MethodPost,
		srv+"/api/v1/trips/"+trip+"/items/"+itemID+"/takeover", token(t, user, testSecret), nil)
}

func TestTakeover_ClaimsTheRowForTheTakerAndNotifiesTheHolder(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	claimRow(t, srv.URL)

	resp, raw := takeOver(t, srv.URL, userB, "ti-1")

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("takeover status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		OK       bool `json:"ok"`
		PullHint struct {
			NextCursor int64 `json:"next_cursor"`
		} `json:"pull_hint"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if !out.OK || out.PullHint.NextCursor == 0 {
		t.Fatalf("response = %+v, want ok with a cursor to pull from", out)
	}

	// The claim moved rather than ended: the row is the taker's.
	var state, by string
	if err := st.DB().QueryRow(
		`SELECT state, packing_now_by FROM trip_items WHERE id = 'ti-1'`).Scan(&state, &by); err != nil {
		t.Fatal(err)
	}
	if state != "packing_now" || by != userB {
		t.Errorf("row = %s/%s, want packing_now/%s", state, by, userB)
	}

	// The whole difference between a lock that can be broken and one that
	// is not a lock: the holder is told (FR-6.2).
	got := listNotifications(t, srv, userA, "")
	if len(got.Notifications) != 1 {
		t.Fatalf("holder got %d notifications, want 1", len(got.Notifications))
	}
	n := got.Notifications[0]
	if n.Kind != "lock_taken" {
		t.Errorf("kind = %q, want lock_taken", n.Kind)
	}
	if n.Payload["item_name"] != "Zelt" || n.Payload["actor_name"] != "Sarah" {
		t.Errorf("payload = %+v, want the row and the taker named", n.Payload)
	}
	if n.Payload["trip_id"] != trip || n.Payload["item_id"] != "ti-1" {
		t.Errorf("payload = %+v, want an FR-6.3 deep link", n.Payload)
	}

	// Nobody else is told — a takeover concerns two people.
	if other := listNotifications(t, srv, userB, ""); len(other.Notifications) != 0 {
		t.Errorf("taker got %d notifications, want 0", len(other.Notifications))
	}
}

// The M17 toggle covers this kind like every other: switching it off
// stops the notification at the source rather than hiding it.
func TestTakeover_HonoursTheHoldersNotificationPreference(t *testing.T) {
	srv, _ := newTestServerWithStore(t)
	claimRow(t, srv.URL)

	resp, raw := doJSON(t, http.MethodPut, srv.URL+"/api/v1/me/notification-prefs",
		token(t, userA, testSecret),
		map[string]any{"delegation": true, "mention": true, "task": true, "lock_taken": false})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("prefs status = %d, body %s", resp.StatusCode, raw)
	}

	if resp, raw := takeOver(t, srv.URL, userB, "ti-1"); resp.StatusCode != http.StatusOK {
		t.Fatalf("takeover status = %d, body %s", resp.StatusCode, raw)
	}

	if got := listNotifications(t, srv, userA, ""); len(got.Notifications) != 0 {
		t.Errorf("suppressed kind produced %d notifications", len(got.Notifications))
	}
}

func TestTakeover_Refusals(t *testing.T) {
	tests := []struct {
		name     string
		user     string
		item     string
		setup    func(t *testing.T, srvURL string)
		status   int
		wantCode string
	}{
		{
			name: "a row nobody is packing", user: userB, item: "ti-1",
			setup: func(t *testing.T, srvURL string) {
				pushOne(t, srvURL, userA, map[string]any{
					"mutation_id": "to-open", "op": "insert", "table": "trip_items", "id": "ti-1",
					"fields": map[string]any{"trip_id": trip, "name": "Zelt", "quantity": 1, "state": "open"},
					"hlc":    "0000000001000-0000-aaaaaaaa",
				})
			},
			status: http.StatusConflict, wantCode: "claim_not_held",
		},
		{
			name: "my own claim", user: userA, item: "ti-1", setup: claimRow,
			status: http.StatusConflict, wantCode: "claim_is_own",
		},
		{
			name: "a row that does not exist", user: userB, item: "ti-nope", setup: claimRow,
			status: http.StatusNotFound, wantCode: "not_found",
		},
		{
			// Membership, not the lock: a stranger may not reach the trip
			// at all, so the takeover never gets to judge the claim.
			name: "somebody who is not a member", user: "user-x", item: "ti-1", setup: claimRow,
			status: http.StatusForbidden, wantCode: "forbidden",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv, st := newTestServerWithStore(t)
			tt.setup(t, srv.URL)

			resp, raw := takeOver(t, srv.URL, tt.user, tt.item)

			if resp.StatusCode != tt.status {
				t.Fatalf("status = %d, want %d (body %s)", resp.StatusCode, tt.status, raw)
			}
			var out struct {
				Error struct {
					Code string `json:"code"`
				} `json:"error"`
			}
			if err := json.Unmarshal(raw, &out); err != nil {
				t.Fatal(err)
			}
			if out.Error.Code != tt.wantCode {
				t.Errorf("code = %q, want %q", out.Error.Code, tt.wantCode)
			}
			// A refusal records nothing and tells nobody.
			var events int
			if err := st.DB().QueryRow(`SELECT count(*) FROM lock_events`).Scan(&events); err != nil {
				t.Fatal(err)
			}
			if events != 0 {
				t.Errorf("lock_events = %d after a refusal, want 0", events)
			}
		})
	}
}
