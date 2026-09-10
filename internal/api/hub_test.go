package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// allowAll is the gate every case here passes: these test the hub's
// mechanics, and the one case about the gate itself hands in its own.
func allowAll(context.Context, string, string) bool { return true }

// wsEcho sets up a test server with a hub where clients can connect,
// subscribe, and receive events. Returns the hub and server.
func wsTestServer(t *testing.T, headSeq HeadSeqFunc) (*Hub, *httptest.Server) {
	t.Helper()
	return wsTestServerGated(t, headSeq, allowAll)
}

func wsTestServerGated(t *testing.T, headSeq HeadSeqFunc, mayReceive ReceiveFunc) (*Hub, *httptest.Server) {
	t.Helper()
	hub := NewHub(headSeq, mayReceive)
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

func wsRead(t *testing.T, ws *websocket.Conn) WSEvent {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, data, err := ws.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var evt WSEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}
	return evt
}

func wsReadTimeout(t *testing.T, ws *websocket.Conn, timeout time.Duration) (WSEvent, bool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	_, data, err := ws.Read(ctx)
	if err != nil {
		return WSEvent{}, false
	}
	var evt WSEvent
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
	data := evt.Payload
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

	for _, evt := range []WSEvent{evt1, evt2} {
		if evt.Type != "trip.changed" {
			t.Errorf("type = %q, want trip.changed", evt.Type)
		}
		data := evt.Payload
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
	members := evt.Payload["users"].([]any)
	m := members[0].(map[string]any)
	if m["in_sync"] != false {
		t.Error("expected in_sync=false when cursor < head")
	}

	// Update cursor to head — should now be in sync.
	wsSend(t, ws, map[string]any{"action": "cursor", "trip_id": "trip-1", "cursor": 10})
	evt = wsRead(t, ws)
	members = evt.Payload["users"].([]any)
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

// The gate is asked per send, so the count of who a trip reaches is a
// settled state a revocation can be asserted against — no deadline, no
// second socket. Both halves are here on purpose: a gate that refused
// everybody would satisfy the first clause alone.
func TestHub_SubscribersCountsOnlyTheStillAuthorised(t *testing.T) {
	revoked := map[string]bool{}
	gate := func(_ context.Context, _ string, userID string) bool { return !revoked[userID] }

	hub, srv := wsTestServerGated(t, nil, gate)
	ws1 := wsConnect(t, srv, "andy")
	wsSend(t, ws1, map[string]string{"action": "subscribe", "trip_id": "trip-1"})
	wsRead(t, ws1) // presence
	ws2 := wsConnect(t, srv, "sarah")
	wsSend(t, ws2, map[string]string{"action": "subscribe", "trip_id": "trip-1"})
	wsRead(t, ws1) // presence update
	wsRead(t, ws2) // presence

	if n := hub.Subscribers("trip-1"); n != 2 {
		t.Fatalf("subscribers = %d, want 2 before the revocation", n)
	}

	revoked["sarah"] = true

	if n := hub.Subscribers("trip-1"); n != 1 {
		t.Errorf("subscribers = %d, want 1 — the hub still counts a revoked socket", n)
	}
}

// --- ADR-057: a broadcast waits for no peer ---------------------------------

// fakePeer is a connection that has stopped reading. `Write` parks until the
// test releases it and ignores the context, which is what a socket whose peer
// has vanished looks like from here — the kernel buffer fills, and the write
// neither completes nor fails until something times it out.
type fakePeer struct {
	entered chan struct{} // one token per Write that has begun
	release chan struct{} // closed by the test to let every Write finish
	closed  chan struct{} // closed by CloseNow
	block   bool
	// blockClose makes CloseNow park too, which the real one can do for up
	// to 15 s while it waits for the connection's own goroutines to exit.
	blockClose bool

	mu     sync.Mutex
	frames [][]byte
	got    chan []byte // one token per completed Write
}

func newFakePeer(block bool) *fakePeer {
	return &fakePeer{
		entered: make(chan struct{}, 1024),
		release: make(chan struct{}),
		closed:  make(chan struct{}),
		block:   block,
		got:     make(chan []byte, 1024),
	}
}

func (p *fakePeer) Write(_ context.Context, _ websocket.MessageType, data []byte) error {
	p.entered <- struct{}{}
	if p.block {
		<-p.release
	}
	p.mu.Lock()
	p.frames = append(p.frames, data)
	p.mu.Unlock()
	p.got <- data
	return nil
}

func (p *fakePeer) CloseNow() error {
	close(p.closed)
	if p.blockClose {
		<-p.release
	}
	return nil
}

// TestHub_ABroadcastDoesNotWaitForAStalledPeer is the case ADR-057 exists
// for. Its failure mode against the serial implementation is a *hang*: there,
// the second peer's write is not attempted until the first one's returns, and
// the first one never does — so run it with `-timeout` when proving it.
func TestHub_ABroadcastDoesNotWaitForAStalledPeer(t *testing.T) {
	hub := NewHub(nil, allowAll)
	stalled, reading := newFakePeer(true), newFakePeer(false)
	a, b := newConn(stalled, "u-a"), newConn(reading, "u-b")
	hub.Register(a)
	hub.Register(b)
	defer func() {
		close(stalled.release)
		hub.Unregister(a)
		hub.Unregister(b)
	}()
	hub.Subscribe(a, "t1")
	hub.Subscribe(b, "t1")

	// Both are subscribed, so both are already being written to (presence).
	// Wait until the stalled peer is *inside* a write: from here on it is
	// holding a frame that will not complete.
	<-stalled.entered

	hub.NotifyTripChanged("t1", 7)

	// The reading peer has the event while the other is still parked. No
	// deadline is involved: the channel read is the rendezvous.
	var evt WSEvent
	for {
		frame := <-reading.got
		if err := json.Unmarshal(frame, &evt); err != nil {
			t.Fatalf("unmarshal frame: %v", err)
		}
		if evt.Type == EventTripChanged {
			break
		}
	}
	if got := evt.Payload["head_seq"]; got != float64(7) {
		t.Errorf("head_seq = %v, want 7", got)
	}
}

// TestHub_APeerThatCannotKeepUpIsDisconnected pins the other half of the
// decision: the queue is bounded, and the peer that overruns it is dropped
// rather than waited for or grown for.
func TestHub_APeerThatCannotKeepUpIsDisconnected(t *testing.T) {
	hub := NewHub(nil, allowAll)
	stalled := newFakePeer(true)
	c := newConn(stalled, "u-a")
	hub.Register(c)
	defer func() {
		close(stalled.release)
		hub.Unregister(c)
	}()

	// The pump is parked inside the first write, so the queue is empty and
	// its remaining capacity is exactly wsSendQueue. Without this rendezvous
	// the count below would depend on whether the pump had run yet.
	hub.NotifyMasterChanged("u-a", 1)
	<-stalled.entered

	for i := 0; i < wsSendQueue; i++ {
		hub.NotifyMasterChanged("u-a", int64(i+2))
	}
	select {
	case <-stalled.closed:
		t.Fatal("dropped while the queue could still hold the frame")
	default:
	}

	hub.NotifyMasterChanged("u-a", 999)

	<-stalled.closed // the overrun frame is what disconnects it
}

// A peer that reads keeps every frame, in the order the hub sent them: the
// queue is a buffer, not a sampler, and one pump per connection is what
// makes that true now that the write no longer happens where the event does.
func TestHub_AReadingPeerKeepsEveryFrameInOrder(t *testing.T) {
	hub := NewHub(nil, allowAll)
	peer := newFakePeer(false)
	c := newConn(peer, "u-a")
	hub.Register(c)
	defer hub.Unregister(c)

	const sent = 20
	for i := 0; i < sent; i++ {
		hub.NotifyMasterChanged("u-a", int64(i))
	}

	for i := 0; i < sent; i++ {
		var evt WSEvent
		if err := json.Unmarshal(<-peer.got, &evt); err != nil {
			t.Fatalf("unmarshal frame %d: %v", i, err)
		}
		if got := evt.Payload["seq"]; got != float64(i) {
			t.Fatalf("frame %d carries seq %v, want %d", i, got, i)
		}
	}
	select {
	case <-peer.closed:
		t.Error("a peer that read everything was disconnected")
	default:
	}
}

// Dropping a peer must not do to the broadcast what the drop exists to
// prevent. `CloseNow` is not cheap — the real one waits for the
// connection's own goroutines to exit, up to fifteen seconds — so a drop
// decided on the broadcast path must not be *performed* on it.
func TestHub_DroppingAPeerDoesNotStallTheBroadcastEither(t *testing.T) {
	hub := NewHub(nil, allowAll)
	stalled, reading := newFakePeer(true), newFakePeer(false)
	stalled.blockClose = true
	a, b := newConn(stalled, "u-a"), newConn(reading, "u-b")
	hub.Register(a)
	hub.Register(b)
	defer func() {
		close(stalled.release)
		hub.Unregister(a)
		hub.Unregister(b)
	}()
	hub.Subscribe(a, "t1")
	hub.Subscribe(b, "t1")
	<-stalled.entered // its pump is parked; the queue is empty

	// Fill the queue, then overrun it — the next broadcast is the one that
	// decides to drop it, and it is a broadcast the other peer is in too.
	for i := 0; i < wsSendQueue; i++ {
		hub.NotifyTripChanged("t1", int64(i))
	}
	hub.NotifyTripChanged("t1", 999)
	<-stalled.closed // it was dropped, and CloseNow is now parked

	hub.NotifyTripChanged("t1", 1000)

	for {
		var evt WSEvent
		if err := json.Unmarshal(<-reading.got, &evt); err != nil {
			t.Fatalf("unmarshal frame: %v", err)
		}
		if evt.Type == EventTripChanged && evt.Payload["head_seq"] == float64(1000) {
			return
		}
	}
}
