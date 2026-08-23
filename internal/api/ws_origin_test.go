package api_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// The sync WebSocket is accepted with the library's default options,
// which authorize an Origin only when its host — port included — equals
// the request's Host. These two cases pin what that means for whoever
// puts a reverse proxy in front of jitpackd: forwarding the browser's
// Host verbatim works on any port, and dropping the port from it does
// not (see docs/installation.md, "Serving the SPA behind a reverse
// proxy").

// A browser on a non-default port sends its port in the Origin. The
// handshake must still be accepted as long as the Host it arrives with
// is the one the browser addressed.
func TestWS_OriginWithPortIsAcceptedWhenHostMatches(t *testing.T) {
	srv := newTestWSServer(t)
	url := "ws" + strings.TrimPrefix(srv.url, "http") + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// httptest listens on 127.0.0.1:<port>, so srv.url is exactly the
	// origin a browser addressing it would send.
	ws, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Authorization": {"Bearer " + token(t, userA, testSecret)},
			"Origin":        {srv.url},
		},
	})
	if err != nil {
		t.Fatalf("dial with same-origin (port carrying) Origin: %v", err)
	}
	t.Cleanup(func() { ws.CloseNow() })
}

// The production shape of the defect: nginx's $host drops the port, so
// the backend sees Host "localhost" while the browser sent Origin
// "http://localhost:3000". Every REST call still works and only the
// socket is refused — which is why this has to be asserted rather than
// noticed.
func TestWS_OriginRefusedWhenProxyStripsPortFromHost(t *testing.T) {
	srv := newTestWSServer(t)
	host, _, ok := strings.Cut(strings.TrimPrefix(srv.url, "http://"), ":")
	if !ok {
		t.Fatalf("test server url %q carries no port", srv.url)
	}

	req, err := http.NewRequest(http.MethodGet, srv.url+"/ws", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	// req.Host is what reaches the handler as r.Host — the rewrite a
	// port-dropping proxy performs.
	req.Host = host
	req.Header.Set("Origin", srv.url)
	req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("handshake request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 — the same-origin check must reject a Host the browser never addressed", resp.StatusCode)
	}
}
