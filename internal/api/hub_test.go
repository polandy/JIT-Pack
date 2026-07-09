package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// wsEcho sets up a test server with a hub where clients can connect,
// subscribe, and receive events. Returns the hub and server.
func wsTestServer(t *testing.T, headSeq HeadSeqFunc) (*Hub, *httptest.Server) {
	t.Helper()
	hub := NewHub(headSeq)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws", func(w http.ResponseWriter, r *http.Request) {
		ws, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Logf("accept: %v", err)
			return
		}
		c := newConn(ws, r.URL.Query().Get("user"))
		hub.Register(c)
		defer func() {
			hub.Unregister(c)
			ws.CloseNow()
		}()
		// Read loop: handle subscribe/unsubscribe/cursor commands.
		for {
			_, data, err := ws.Read(r.Context())
			if err != nil {
				return
			}
			var msg struct {
				Action string `json:"action"`
				TripID string `json:"trip_id"`
				Cursor int64  `json:"cursor"`
			}
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}
			switch msg.Action {
			case "subscribe":
				hub.Subscribe(c, msg.TripID)
			case "unsubscribe":
				hub.Unsubscribe(c, msg.TripID)
			case "cursor":
				hub.UpdateCursor(c, msg.TripID, msg.Cursor)
			}
		}
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return hub, srv
}

func wsConnect(t *testing.T, srv *httptest.Server, userID string) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws?user=" + userID
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { ws.CloseNow() })
	return ws
}

func wsSend(t *testing.T, ws *websocket.Conn, msg any) {
	t.Helper()
	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := ws.Write(ctx, websocket.MessageText, data); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func wsRead(t *testing.T, ws *websocket.Conn) Event {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, data, err := ws.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var evt Event
	if err := json.Unmarshal(data, &evt); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}
	return evt
}

func wsReadTimeout(t *testing.T, ws *websocket.Conn, timeout time.Duration) (Event, bool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	_, data, err := ws.Read(ctx)
	if err != nil {
		return Event{}, false
	}
	var evt Event
	if err := json.Unmarshal(data, &evt); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}
	return evt, true
}

func TestHub_Subscribe_ReceivesPresence(t *testing.T) {
	_, srv := wsTestServer(t, nil)
	ws := wsConnect(t, srv, "andy")

	wsSend(t, ws, map[string]string{"action": "subscribe", "trip_id": "trip-1"})

	evt := wsRead(t, ws)
	if evt.Type != "presence" {
		t.Fatalf("type = %q, want presence", evt.Type)
	}
	data := evt.Payload.(map[string]any)
	if data["trip_id"] != "trip-1" {
		t.Errorf("trip_id = %v, want trip-1", data["trip_id"])
	}
	members := data["users"].([]any)
	if len(members) != 1 {
		t.Fatalf("members = %d, want 1", len(members))
	}
	m := members[0].(map[string]any)
	if m["user_id"] != "andy" {
		t.Errorf("user_id = %v, want andy", m["user_id"])
	}
}

func TestHub_TripChanged_BroadcastToSubscribers(t *testing.T) {
	hub, srv := wsTestServer(t, nil)
	ws1 := wsConnect(t, srv, "andy")
	ws2 := wsConnect(t, srv, "sarah")

	// Both subscribe to trip-1.
	wsSend(t, ws1, map[string]string{"action": "subscribe", "trip_id": "trip-1"})
	wsRead(t, ws1) // presence for andy

	wsSend(t, ws2, map[string]string{"action": "subscribe", "trip_id": "trip-1"})
	// Both get presence (andy+sarah).
	wsRead(t, ws1) // presence update
	wsRead(t, ws2) // presence for ws2

	// Server pushes a trip.changed event.
	hub.NotifyTripChanged("trip-1", 42)

	evt1 := wsRead(t, ws1)
	evt2 := wsRead(t, ws2)

	for _, evt := range []Event{evt1, evt2} {
		if evt.Type != "trip.changed" {
			t.Errorf("type = %q, want trip.changed", evt.Type)
		}
		data := evt.Payload.(map[string]any)
		if data["head_seq"] != float64(42) {
			t.Errorf("head_seq = %v, want 42", data["head_seq"])
		}
	}
}

func TestHub_Unsubscribe_StopsReceiving(t *testing.T) {
	hub, srv := wsTestServer(t, nil)
	ws := wsConnect(t, srv, "andy")

	wsSend(t, ws, map[string]string{"action": "subscribe", "trip_id": "trip-1"})
	wsRead(t, ws) // presence

	wsSend(t, ws, map[string]string{"action": "unsubscribe", "trip_id": "trip-1"})
	// Drain any pending presence from unsubscribe (empty list)
	for {
		evt, ok := wsReadTimeout(t, ws, 200*time.Millisecond)
		if !ok {
			break
		}
		if evt.Type != "presence" {
			t.Fatalf("unexpected event type %q after unsubscribe", evt.Type)
		}
	}

	// Now send a trip.changed — should NOT be received.
	hub.NotifyTripChanged("trip-1", 10)

	_, received := wsReadTimeout(t, ws, 200*time.Millisecond)
	if received {
		t.Error("received event after unsubscribe")
	}
}

func TestHub_InSync_Computation(t *testing.T) {
	headSeqs := map[string]int64{"trip-1": 10}
	headFn := func(_ context.Context, tripID string) (int64, error) {
		return headSeqs[tripID], nil
	}

	_, srv := wsTestServer(t, headFn)
	ws := wsConnect(t, srv, "andy")

	// Subscribe with no cursor (0) — head is 10, so not in sync.
	wsSend(t, ws, map[string]string{"action": "subscribe", "trip_id": "trip-1"})
	evt := wsRead(t, ws)
	members := evt.Payload.(map[string]any)["users"].([]any)
	m := members[0].(map[string]any)
	if m["in_sync"] != false {
		t.Error("expected in_sync=false when cursor < head")
	}

	// Update cursor to head — should now be in sync.
	wsSend(t, ws, map[string]any{"action": "cursor", "trip_id": "trip-1", "cursor": 10})
	evt = wsRead(t, ws)
	members = evt.Payload.(map[string]any)["users"].([]any)
	m = members[0].(map[string]any)
	if m["in_sync"] != true {
		t.Error("expected in_sync=true when cursor >= head")
	}
}

func TestHub_Subscribers_Count(t *testing.T) {
	hub, srv := wsTestServer(t, nil)

	if n := hub.Subscribers("trip-1"); n != 0 {
		t.Fatalf("subscribers = %d, want 0", n)
	}

	ws1 := wsConnect(t, srv, "andy")
	wsSend(t, ws1, map[string]string{"action": "subscribe", "trip_id": "trip-1"})
	wsRead(t, ws1) // presence

	ws2 := wsConnect(t, srv, "sarah")
	wsSend(t, ws2, map[string]string{"action": "subscribe", "trip_id": "trip-1"})
	wsRead(t, ws1) // presence update
	wsRead(t, ws2) // presence

	if n := hub.Subscribers("trip-1"); n != 2 {
		t.Errorf("subscribers = %d, want 2", n)
	}
}

func TestHub_MultipleTrips_Isolation(t *testing.T) {
	hub, srv := wsTestServer(t, nil)
	ws1 := wsConnect(t, srv, "andy")
	ws2 := wsConnect(t, srv, "sarah")

	wsSend(t, ws1, map[string]string{"action": "subscribe", "trip_id": "trip-1"})
	wsRead(t, ws1)
	wsSend(t, ws2, map[string]string{"action": "subscribe", "trip_id": "trip-2"})
	wsRead(t, ws2)

	hub.NotifyTripChanged("trip-2", 5)

	// ws2 should receive, ws1 should not.
	evt := wsRead(t, ws2)
	if evt.Type != "trip.changed" {
		t.Errorf("ws2 type = %q, want trip.changed", evt.Type)
	}

	_, received := wsReadTimeout(t, ws1, 200*time.Millisecond)
	if received {
		t.Error("ws1 received event for trip-2")
	}
}
