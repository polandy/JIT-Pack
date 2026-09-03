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
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/store"
)

func newKeepaliveServer(t *testing.T, idle time.Duration) (*Server, *httptest.Server) {
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/ws?token="+signed, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { ws.CloseNow() })
	return ws
}

func TestWS_PingIsAnsweredWithPong(t *testing.T) {
	_, srv := newKeepaliveServer(t, 0) // 0 = the real §9 default
	ws := dialKeepalive(t, srv)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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
func TestWS_IdleConnectionIsClosedAndLeavesPresence(t *testing.T) {
	s, srv := newKeepaliveServer(t, 100*time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	observer := dialKeepalive(t, srv)
	if err := observer.Write(ctx, websocket.MessageText, []byte(`{"subscribe":["trip:trip-k"]}`)); err != nil {
		t.Fatalf("observer subscribe: %v", err)
	}
	if got := readPresenceDevices(t, ctx, observer); got != 1 {
		t.Fatalf("observer alone: devices = %d, want 1", got)
	}

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

	// The idle socket says nothing further. The observer keeps the
	// connection alive with pings, which the server must answer *and* count
	// as activity — otherwise the observer would be reaped along with it.
	// The next presence frame the observer receives is the reaping.
	pinger := make(chan struct{})
	go func() {
		defer close(pinger)
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(20 * time.Millisecond):
			}
			if err := observer.Write(ctx, websocket.MessageText, []byte(`{"ping":true}`)); err != nil {
				return
			}
		}
	}()
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
	cancel()
	<-pinger
}
