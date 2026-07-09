package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func wsConnectAuth(t *testing.T, srv *testWSServer, userID string) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.url, "http") + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Authorization": {"Bearer " + token(t, userID, testSecret)},
		},
	})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { ws.CloseNow() })
	return ws
}

type testWSServer struct {
	url string
}

func newTestWSServer(t *testing.T) *testWSServer {
	t.Helper()
	srv := newTestServer(t)
	return &testWSServer{url: srv.URL}
}

func wsSendMsg(t *testing.T, ws *websocket.Conn, msg any) {
	t.Helper()
	data, _ := json.Marshal(msg)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := ws.Write(ctx, websocket.MessageText, data); err != nil {
		t.Fatalf("ws write: %v", err)
	}
}

func wsReadMsg(t *testing.T, ws *websocket.Conn) map[string]any {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, data, err := ws.Read(ctx)
	if err != nil {
		t.Fatalf("ws read: %v", err)
	}
	var msg map[string]any
	if err := json.Unmarshal(data, &msg); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return msg
}

func TestWS_AuthRequired(t *testing.T) {
	srv := newTestWSServer(t)
	url := "ws" + strings.TrimPrefix(srv.url, "http") + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, resp, err := websocket.Dial(ctx, url, nil)
	if err == nil {
		t.Fatal("expected dial to fail without auth")
	}
	if resp != nil && resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestWS_SubscribeAndReceiveTripChanged(t *testing.T) {
	srv := newTestWSServer(t)
	ws := wsConnectAuth(t, srv, userA)

	// Subscribe to the trip (spec §7 channel list).
	wsSendMsg(t, ws, map[string]any{"subscribe": []string{"trip:" + trip}})

	// Read the initial presence event.
	evt := wsReadMsg(t, ws)
	if evt["type"] != "presence" {
		t.Fatalf("type = %v, want presence", evt["type"])
	}

	// Push a mutation via HTTP — should trigger trip.changed on WS.
	body := map[string]any{"mutations": []any{
		mutation("item-ws-1", "ws-m1", "insert",
			map[string]any{"trip_id": trip, "name": "WS-Test", "quantity": 1},
			"0000000001000-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, srv.url+"/api/v1/sync/trips/"+trip,
		token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}

	// The WS client should receive a trip.changed event.
	evt = wsReadMsg(t, ws)
	if evt["type"] != "trip.changed" {
		t.Fatalf("type = %v, want trip.changed", evt["type"])
	}
	payload := evt["payload"].(map[string]any)
	if payload["trip_id"] != trip {
		t.Errorf("trip_id = %v, want %s", payload["trip_id"], trip)
	}
	if payload["head_seq"].(float64) < 1 {
		t.Error("head_seq should be >= 1")
	}
}

// Spec §7: browsers cannot set headers on WebSocket dials — the token
// must be accepted as ?token= query parameter.
func TestWS_QueryParamAuth(t *testing.T) {
	srv := newTestWSServer(t)
	url := "ws" + strings.TrimPrefix(srv.url, "http") + "/ws?token=" + token(t, userA, testSecret)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ws, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial with query token: %v", err)
	}
	defer ws.CloseNow()

	wsSendMsg(t, ws, map[string]any{"subscribe": []string{"trip:" + trip}})
	evt := wsReadMsg(t, ws)
	if evt["type"] != "presence" {
		t.Fatalf("type = %v, want presence", evt["type"])
	}
}

func TestWS_NonMemberCannotSubscribe(t *testing.T) {
	srv := newTestWSServer(t)
	// user-x is not a trip member.
	ws := wsConnectAuth(t, srv, "user-x")

	wsSendMsg(t, ws, map[string]any{"subscribe": []string{"trip:" + trip}})

	// Should NOT receive any presence event (subscription denied).
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	_, _, err := ws.Read(ctx)
	if err == nil {
		t.Error("non-member should not receive events for this trip")
	}
}

// Presence payload per spec §7: users:[{user_id, device_count, in_sync}].
func TestWS_CursorUpdateTriggersPresence(t *testing.T) {
	srv := newTestWSServer(t)
	ws := wsConnectAuth(t, srv, userA)

	wsSendMsg(t, ws, map[string]any{"subscribe": []string{"trip:" + trip}})
	wsReadMsg(t, ws) // initial presence

	wsSendMsg(t, ws, map[string]any{"cursor": map[string]any{"trip_id": trip, "seq": 999}})

	evt := wsReadMsg(t, ws)
	if evt["type"] != "presence" {
		t.Fatalf("type = %v, want presence", evt["type"])
	}
	payload := evt["payload"].(map[string]any)
	users := payload["users"].([]any)
	if len(users) != 1 {
		t.Fatalf("users = %v, want exactly one", users)
	}
	u := users[0].(map[string]any)
	if u["user_id"] != userA {
		t.Errorf("user_id = %v, want %s", u["user_id"], userA)
	}
	if u["device_count"].(float64) != 1 {
		t.Errorf("device_count = %v, want 1", u["device_count"])
	}
	if u["in_sync"] != true {
		t.Errorf("in_sync = %v, want true (cursor ahead of empty head)", u["in_sync"])
	}
}
