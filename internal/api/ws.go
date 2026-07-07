package api

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/coder/websocket"
)

// wsMessage is the client→server envelope.
type wsMessage struct {
	Action string `json:"action"` // subscribe, unsubscribe, cursor
	TripID string `json:"trip_id"`
	Cursor int64  `json:"cursor,omitempty"`
}

// handleWS upgrades the HTTP connection to WebSocket. Authentication
// uses the same middleware as other endpoints — the user ID is already
// in the context by the time this handler runs.
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
		switch msg.Action {
		case "subscribe":
			if s.singleUserMode || s.isMember(r, msg.TripID, userID) {
				s.hub.Subscribe(c, msg.TripID)
			}
		case "unsubscribe":
			s.hub.Unsubscribe(c, msg.TripID)
		case "cursor":
			s.hub.UpdateCursor(c, msg.TripID, msg.Cursor)
		}
	}
}

// isMember checks trip membership for WebSocket subscribe actions.
func (s *Server) isMember(r *http.Request, tripID, userID string) bool {
	ok, err := s.store.IsTripMember(r.Context(), tripID, userID)
	return err == nil && ok
}
