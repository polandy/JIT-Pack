package api_test

import (
	"net/http"
	"testing"

	"github.com/coder/websocket"
)

// A socket proves two things once, at the dial and at the subscribe frame:
// that the account is active, and that it is a member of the trip. Both
// expire while the socket stays open — a membership by an ordinary master
// mutation, an account by an admin — and until ADR-056 nothing server-side
// could take a subscription away. The consequence was not abstract: the
// trip.changed ping, the G-3 lock events *with the item's name* and the
// presence list all kept arriving at a removed member's phone until they
// happened to close the tab.
//
// Both cases below assert an absence, so both need a positive signal for it.
// Two are used together, because either alone would be false-green:
//
//   - the same event reaching the *remaining* member proves the push
//     happened at all, and
//   - a {"ping": true} answered with a pong proves the revoked socket is
//     alive and was read to its end. The pong arriving as the *next* frame
//     is what says no trip.changed was queued ahead of it — an ordering
//     assertion rather than a deadline, so nothing here waits and hopes.

// wsDrainUntil reads frames until one of the wanted type arrives, and fails
// on the read deadline if it never does. It is the positive half: this
// socket is expected to receive, so a deadline here is a failure and not an
// assertion.
func wsDrainUntil(t *testing.T, ws *websocket.Conn, want string) map[string]any {
	t.Helper()
	for {
		evt := wsReadMsg(t, ws)
		if evt["type"] == want {
			return evt
		}
	}
}

func TestWS_ARevokedMemberStopsReceivingTripEvents(t *testing.T) {
	srv, st := newTestWSServerWithStore(t)

	wsA := wsConnectAuth(t, srv, userA)
	wsB := wsConnectAuth(t, srv, userB)
	wsSendMsg(t, wsA, map[string]any{"subscribe": []string{"trip:" + trip}})
	wsReadMsg(t, wsA) // presence, A alone
	wsSendMsg(t, wsB, map[string]any{"subscribe": []string{"trip:" + trip}})
	wsReadMsg(t, wsB) // presence, A and B — B is a member at this point

	var memberID string
	if err := st.DB().QueryRow(
		`SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ?`, trip, userB,
	).Scan(&memberID); err != nil {
		t.Fatalf("read membership row: %v", err)
	}

	// Revocation as it actually happens: an ordinary master mutation. The
	// hub is not told, and is not meant to be.
	body := map[string]any{"mutations": []any{
		masterMutation("trip_members", memberID, "revoke-b", "delete", nil,
			"0000000009000-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, srv.url+"/api/v1/master/sync",
		token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("revoke push status = %d, body %s", resp.StatusCode, raw)
	}
	var stillAMember int
	if err := st.DB().QueryRow(
		`SELECT count(*) FROM trip_members WHERE trip_id = ? AND user_id = ?`, trip, userB,
	).Scan(&stillAMember); err != nil {
		t.Fatalf("re-read membership: %v", err)
	}
	if stillAMember != 0 {
		t.Fatalf("precondition: %s is still a member, so the case proves nothing", userB)
	}

	// Something happens in the trip.
	body = map[string]any{"mutations": []any{
		mutation("item-after-revoke", "ws-ar-1", "insert",
			map[string]any{"trip_id": trip, "name": "Regenjacke", "quantity": 1},
			"0000000010000-0000-aaaaaaaa"),
	}}
	resp, raw = doJSON(t, http.MethodPost, srv.url+"/api/v1/trips/"+trip+"/sync",
		token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}

	// The remaining member did get it — the push reached the hub.
	wsDrainUntil(t, wsA, "trip.changed")

	// The revoked one did not: its next frame is the answer to its own ping.
	wsSendMsg(t, wsB, map[string]any{"ping": true})
	if evt := wsReadMsg(t, wsB); evt["type"] != "pong" {
		t.Fatalf("revoked member's next frame = %v, want pong — the trip's events "+
			"still reach a socket whose membership is gone", evt["type"])
	}
}

func TestWS_ADeactivatedAccountStopsReceivingTripEvents(t *testing.T) {
	srv, st := newTestWSServerWithStore(t)

	wsA := wsConnectAuth(t, srv, userA)
	wsB := wsConnectAuth(t, srv, userB)
	wsSendMsg(t, wsA, map[string]any{"subscribe": []string{"trip:" + trip}})
	wsReadMsg(t, wsA)
	wsSendMsg(t, wsB, map[string]any{"subscribe": []string{"trip:" + trip}})
	wsReadMsg(t, wsB)

	// FR-23.3, as the admin surface writes it. B stays a member of the trip:
	// membership is not what ends here, which is what makes this a second
	// rule rather than a second spelling of the first.
	if _, err := st.DB().Exec(
		`UPDATE users SET deactivated_at = '2026-09-10T09:00:00Z' WHERE id = ?`, userB); err != nil {
		t.Fatalf("deactivate: %v", err)
	}

	body := map[string]any{"mutations": []any{
		mutation("item-after-deactivate", "ws-ad-1", "insert",
			map[string]any{"trip_id": trip, "name": "Wanderschuhe", "quantity": 1},
			"0000000011000-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, srv.url+"/api/v1/trips/"+trip+"/sync",
		token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}

	wsDrainUntil(t, wsA, "trip.changed")

	wsSendMsg(t, wsB, map[string]any{"ping": true})
	if evt := wsReadMsg(t, wsB); evt["type"] != "pong" {
		t.Fatalf("deactivated account's next frame = %v, want pong — a session that "+
			"can no longer make a request is still being fed over its socket", evt["type"])
	}
}
