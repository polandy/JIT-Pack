package api

// The §9 keepalive contract from the server's side (Sync-API §7/§9):
// a {"ping": true} frame is answered with a pong event, and a connection
// that stays silent past the idle timeout is closed and unregistered —
// which is what keeps the G-10 presence list free of ghost devices.
//
// Internal package on purpose: the idle timeout is shrunk through the
// unexported override, so no exported test-only API exists.

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/store"
)

func newKeepaliveServer(t *testing.T, idle time.Duration, watch idleWatchFunc) (*Server, *httptest.Server) {
	t.Helper()
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	seed := []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-a', 'auth|a', 'Andy')`,
		`INSERT INTO trips (id, name, year, start_date, end_date) VALUES ('trip-k', 'Keepalive 2026', 2026, '2026-07-10', '2026-07-20')`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip-k', 'user-a', 'owner')`,
	}
	for _, q := range seed {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}
	secret := []byte("keepalive-test-secret")
	s := New(st, secret, Options{WSIdle: idle})
	// Set before the server starts serving, and only from inside the
	// package: the seam stays off Options, so no exported test-only API
	// exists for it.
	if watch != nil {
		s.wsIdleWatch = watch
	}
	srv := httptest.NewServer(s.Handler())
	t.Cleanup(srv.Close)
	return s, srv
}

func dialKeepalive(t *testing.T, srv *httptest.Server) *websocket.Conn {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user-a",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, err := tok.SignedString([]byte("keepalive-test-secret"))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	// A backstop on the dial, for the same reason as the one in the idle
	// case below: a loaded machine is not the thing under test, and 5 s of
	// it was what turned a busy run into a red one.
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/ws?token="+signed, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { ws.CloseNow() })
	return ws
}

func TestWS_PingIsAnsweredWithPong(t *testing.T) {
	_, srv := newKeepaliveServer(t, 0, nil) // 0 = the real §9 default
	ws := dialKeepalive(t, srv)

	// A backstop, as above: the pong is an answer to a frame just sent, so a
	// correct build never waits for it.
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	if err := ws.Write(ctx, websocket.MessageText, []byte(`{"ping":true}`)); err != nil {
		t.Fatalf("write ping: %v", err)
	}
	_, data, err := ws.Read(ctx)
	if err != nil {
		t.Fatalf("read pong: %v", err)
	}
	var evt WSEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		t.Fatalf("unmarshal %q: %v", data, err)
	}
	if evt.Type != EventPong {
		t.Fatalf("got event %q, want %q", evt.Type, EventPong)
	}
}

// readPresenceDevices reads frames until a presence event for the trip
// arrives and returns the device count of its single user.
func readPresenceDevices(t *testing.T, ctx context.Context, ws *websocket.Conn) int {
	t.Helper()
	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			t.Fatalf("read presence: %v", err)
		}
		var evt struct {
			Type    WSEventType `json:"type"`
			Payload struct {
				Users []PresenceMember `json:"users"`
			} `json:"payload"`
		}
		if err := json.Unmarshal(data, &evt); err != nil {
			t.Fatalf("unmarshal %q: %v", data, err)
		}
		if evt.Type != EventPresence {
			continue
		}
		if len(evt.Payload.Users) != 1 {
			t.Fatalf("presence users = %d, want 1 (both sockets are user-a)", len(evt.Payload.Users))
		}
		return evt.Payload.Users[0].DeviceCount
	}
}

// The reaped connection is observed from a *second* socket on the same trip:
// Unregister broadcasts presence to the survivors, and that frame is the one
// event ordered after the hub has let go. The reaped socket's own close error
// is not — coder/websocket fails the read on the library side before the
// handler's deferred Unregister has run, so asserting the hub right after it
// raced the handler and lost.
// idleWatcher is a test idleWatchFunc. It hands every read a context it can
// end on command and counts the reads it has been asked to watch, so the two
// things this case is about — a connection falling idle, and a ping renewing
// the deadline — are events the test causes and observes rather than
// durations it waits out. The §9 timeout stays the production constant.
type idleWatcher struct {
	mu      sync.Mutex
	cond    *sync.Cond
	pending map[*conn]context.CancelFunc
	counts  map[*conn]int
	// order is the connections in the order they began their first read,
	// which is the order they were dialled.
	order []*conn
}

func newIdleWatcher() *idleWatcher {
	w := &idleWatcher{
		pending: map[*conn]context.CancelFunc{},
		counts:  map[*conn]int{},
	}
	w.cond = sync.NewCond(&w.mu)
	return w
}

func (w *idleWatcher) watch(ctx context.Context, c *conn, _ time.Duration) (context.Context, context.CancelFunc) {
	watched, cancel := context.WithCancel(ctx)
	w.mu.Lock()
	if w.counts[c] == 0 {
		w.order = append(w.order, c)
	}
	w.counts[c]++
	w.pending[c] = cancel
	w.cond.Broadcast()
	w.mu.Unlock()
	return watched, cancel
}

// nth returns the connection that began its first read nth, 1-based.
func (w *idleWatcher) nth(t *testing.T, n int) *conn {
	t.Helper()
	w.mu.Lock()
	defer w.mu.Unlock()
	if len(w.order) < n {
		t.Fatalf("only %d connection(s) have read, want at least %d", len(w.order), n)
	}
	return w.order[n-1]
}

// awaitReads blocks until c has begun its nth read. ctx's expiry wakes the
// wait as well, so a build that stopped renewing the deadline fails naming
// the read it never began instead of hanging on the condition.
func (w *idleWatcher) awaitReads(t *testing.T, ctx context.Context, c *conn, n int) {
	t.Helper()
	stop := context.AfterFunc(ctx, func() {
		w.mu.Lock()
		defer w.mu.Unlock()
		w.cond.Broadcast()
	})
	defer stop()
	w.mu.Lock()
	defer w.mu.Unlock()
	for w.counts[c] < n {
		if ctx.Err() != nil {
			t.Fatalf("connection began %d read(s), want %d", w.counts[c], n)
		}
		w.cond.Wait()
	}
}

// expire ends the read c is waiting on — what the §9 idle timeout does to a
// peer that has gone silent.
func (w *idleWatcher) expire(t *testing.T, c *conn) {
	t.Helper()
	w.mu.Lock()
	cancel, ok := w.pending[c]
	w.mu.Unlock()
	if !ok {
		t.Fatal("connection has no read to expire")
	}
	cancel()
}

// readUntilPong reads frames until the §9 pong arrives, skipping the presence
// frames that may be queued ahead of it.
func readUntilPong(t *testing.T, ctx context.Context, ws *websocket.Conn) {
	t.Helper()
	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			t.Fatalf("read pong: %v", err)
		}
		var evt WSEvent
		if err := json.Unmarshal(data, &evt); err != nil {
			t.Fatalf("unmarshal %q: %v", data, err)
		}
		if evt.Type == EventPong {
			return
		}
	}
}

func TestWS_IdleConnectionIsClosedAndLeavesPresence(t *testing.T) {
	watcher := newIdleWatcher()
	// 0 keeps the production §9 timeout: the watcher, not a shrunken
	// duration, is what ends a read here.
	s, srv := newKeepaliveServer(t, 0, watcher.watch)
	// A backstop, not a timing constraint: every step below is an event this
	// test causes, so a correct build never waits measurably. It exists so a
	// build that stopped reaping fails with the assertion that noticed
	// instead of hanging until the package timeout.
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()

	observer := dialKeepalive(t, srv)
	if err := observer.Write(ctx, websocket.MessageText, []byte(`{"subscribe":["trip:trip-k"]}`)); err != nil {
		t.Fatalf("observer subscribe: %v", err)
	}
	if got := readPresenceDevices(t, ctx, observer); got != 1 {
		t.Fatalf("observer alone: devices = %d, want 1", got)
	}
	observerConn := watcher.nth(t, 1)

	idle := dialKeepalive(t, srv)
	if err := idle.Write(ctx, websocket.MessageText, []byte(`{"subscribe":["trip:trip-k"]}`)); err != nil {
		t.Fatalf("idle subscribe: %v", err)
	}
	// The observer sees the second device arrive — the settled signal that
	// the idle socket is counted.
	if got := readPresenceDevices(t, ctx, observer); got != 2 {
		t.Fatalf("after idle joined: devices = %d, want 2", got)
	}
	if got := s.hub.Subscribers("trip-k"); got != 2 {
		t.Fatalf("subscribers before idle = %d, want 2", got)
	}
	idleConn := watcher.nth(t, 2)

	// §9: a ping is activity. The positive signal that the deadline was
	// renewed is the observer's *third* watched read — the subscribe frame,
	// the ping frame, and then the fresh one the handler waits on. Without
	// the renewal there would be no third read to wait for.
	if err := observer.Write(ctx, websocket.MessageText, []byte(`{"ping":true}`)); err != nil {
		t.Fatalf("observer ping: %v", err)
	}
	readUntilPong(t, ctx, observer)
	watcher.awaitReads(t, ctx, observerConn, 3)

	// The idle socket said nothing after subscribing, so its second read is
	// the one the timeout ends.
	watcher.awaitReads(t, ctx, idleConn, 2)
	watcher.expire(t, idleConn)

	// The next presence frame the observer receives is the reaping — and the
	// observer is still in it, so answering a ping really did count as
	// activity rather than merely being answered.
	if got := readPresenceDevices(t, ctx, observer); got != 1 {
		t.Fatalf("after idle reaped: devices = %d, want 1", got)
	}
	if got := s.hub.Subscribers("trip-k"); got != 1 {
		t.Fatalf("subscribers after idle close = %d, want 1 (the observer)", got)
	}
	// And the idle side was really closed, not merely forgotten: its unread
	// presence frames drain first, then the close arrives as an error.
	for {
		if _, _, err := idle.Read(ctx); err != nil {
			if ctx.Err() != nil {
				t.Fatalf("idle socket never closed: %v", err)
			}
			break
		}
	}
}
