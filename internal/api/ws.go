package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/coder/websocket"
)

// wsMessage is the client→server envelope (Sync-API Spec §7):
//
//	{"subscribe":   ["trip:<id>", "user:<own-id>"]}
//	{"unsubscribe": ["trip:<id>"]}
//	{"cursor":      {"trip_id": "...", "seq": 123}}
type wsMessage struct {
	Subscribe   []string  `json:"subscribe,omitempty"`
	Unsubscribe []string  `json:"unsubscribe,omitempty"`
	Cursor      *wsCursor `json:"cursor,omitempty"`
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
		_, data, err := ws.Read(r.Context())
		if err != nil {
			return
		}
		var msg wsMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		for _, channel := range msg.Subscribe {
			// user:<id> channels are accepted but carry no events yet
			// (notification.created will use them).
			if tripID, ok := strings.CutPrefix(channel, "trip:"); ok {
				if s.singleUserMode || s.isMember(r, tripID, userID) {
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

// isMember checks trip membership for WebSocket subscribe actions.
func (s *Server) isMember(r *http.Request, tripID, userID string) bool {
	ok, err := s.store.IsTripMember(r.Context(), tripID, userID)
	return err == nil && ok
}
