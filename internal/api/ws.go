package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
)

// wsIdleTimeout is how long a connection may stay silent before the server
// closes it (Sync-API §9: "idle timeout 5 min with client ping"). The client
// pings well inside this, so a connection that falls idle is one whose peer
// is gone — a phone that changed networks, a killed tab — and reaping it is
// what keeps the hub's presence list (G-10) free of ghost devices.
const wsIdleTimeout = 5 * time.Minute

// wsMessage is the client→server envelope (Sync-API Spec §7):
//
//	{"subscribe":   ["trip:<id>", "user:<own-id>"]}
//	{"unsubscribe": ["trip:<id>"]}
//	{"cursor":      {"trip_id": "...", "seq": 123}}
type wsMessage struct {
	Subscribe   []string  `json:"subscribe,omitempty"`
	Unsubscribe []string  `json:"unsubscribe,omitempty"`
	Cursor      *wsCursor `json:"cursor,omitempty"`
	// Ping is the client's keepalive (Sync-API §9), answered with an
	// EventPong frame. App-level on purpose: a browser cannot send
	// protocol pings, and the client needs a frame it can *see* to know
	// the connection is still two-way.
	Ping bool `json:"ping,omitempty"`
}

type wsCursor struct {
	TripID string `json:"trip_id"`
	Seq    int64  `json:"seq"`
}

// wsAuth wraps authed for the WebSocket route: browsers cannot set
// headers on WebSocket dials, so the token is also accepted as a
// ?token= query parameter (spec §7).
func (s *Server) wsAuth(next http.HandlerFunc) http.HandlerFunc {
	authed := s.authed(next)
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			if tok := r.URL.Query().Get("token"); tok != "" {
				r.Header.Set("Authorization", "Bearer "+tok)
			}
		}
		authed(w, r)
	}
}

// handleWS upgrades the HTTP connection to WebSocket. The user ID is
// already in the context by the time this handler runs.
func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)

	ws, err := websocket.Accept(w, r, nil)
	if err != nil {
		slog.Error("ws accept", "error", err)
		return
	}

	c := newConn(ws, userID)
	s.hub.Register(c)
	defer func() {
		s.hub.Unregister(c)
		ws.CloseNow()
	}()

	for {
		data, err := readWithIdleTimeout(r.Context(), ws, s.wsIdle())
		if err != nil {
			return
		}
		var msg wsMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if msg.Ping {
			s.hub.send([]*conn{c}, WSEvent{Type: EventPong})
		}
		for _, channel := range msg.Subscribe {
			// user:<id> frames are accepted but redundant:
			// notification.created is delivered by the connection's
			// authenticated identity (hub.NotifyNotificationCreated).
			if tripID, ok := strings.CutPrefix(channel, "trip:"); ok {
				if s.isMember(r, tripID, userID) {
					s.hub.Subscribe(c, tripID)
				}
			}
		}
		for _, channel := range msg.Unsubscribe {
			if tripID, ok := strings.CutPrefix(channel, "trip:"); ok {
				s.hub.Unsubscribe(c, tripID)
			}
		}
		if msg.Cursor != nil {
			s.hub.UpdateCursor(c, msg.Cursor.TripID, msg.Cursor.Seq)
		}
	}
}

// readWithIdleTimeout reads one frame, giving the peer at most idle to say
// anything at all. The deadline is per read, so any frame — a subscription,
// a cursor report, the keepalive ping — resets it.
func readWithIdleTimeout(ctx context.Context, ws *websocket.Conn, idle time.Duration) ([]byte, error) {
	readCtx, cancel := context.WithTimeout(ctx, idle)
	defer cancel()
	_, data, err := ws.Read(readCtx)
	return data, err
}

// wsIdle is the connection idle timeout, overridable so a test does not
// have to hold a socket for five minutes to see it reaped.
func (s *Server) wsIdle() time.Duration {
	if s.wsIdleOverride > 0 {
		return s.wsIdleOverride
	}
	return wsIdleTimeout
}

// isMember checks trip membership for WebSocket subscribe actions. A
// failed lookup is a refusal rather than a subscription, and the mode's
// own answer — Single-User Mode has no membership at all — comes from
// the identity, not from a branch here.
func (s *Server) isMember(r *http.Request, tripID, userID string) bool {
	ok, err := s.identity.isMember(r.Context(), tripID, userID)
	return err == nil && ok
}
