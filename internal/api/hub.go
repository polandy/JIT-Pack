// Package api — hub.go implements the in-memory WebSocket hub that tracks
// per-trip subscriptions, broadcasts events, and computes presence/in_sync
// state (Sync-API Spec §7).
package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Event is the server→client envelope sent over the WebSocket.
type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// PresenceMember is one entry in the presence facepile.
type PresenceMember struct {
	UserID  string `json:"user_id"`
	InSync  bool   `json:"in_sync"`
}

// conn is a tracked WebSocket connection.
type conn struct {
	ws     *websocket.Conn
	userID string
	// trips this connection is subscribed to.
	trips map[string]bool
	// pullCursors tracks the last known pull cursor per trip.
	pullCursors map[string]int64
}

// HeadSeqFunc returns the current change_log head sequence for a trip.
// Injected so the hub has no direct store dependency.
type HeadSeqFunc func(ctx context.Context, tripID string) (int64, error)

// Hub manages WebSocket connections and their trip subscriptions.
type Hub struct {
	mu    sync.Mutex
	conns map[*conn]struct{}

	headSeq HeadSeqFunc
}

// NewHub creates a hub. headSeq may be nil if in_sync is not needed
// (e.g. in unit tests that only test broadcast).
func NewHub(headSeq HeadSeqFunc) *Hub {
	return &Hub{
		conns:   make(map[*conn]struct{}),
		headSeq: headSeq,
	}
}

// Register adds a connection to the hub.
func (h *Hub) Register(c *conn) {
	h.mu.Lock()
	h.conns[c] = struct{}{}
	h.mu.Unlock()
}

// Unregister removes a connection and broadcasts presence updates for
// all trips it was subscribed to.
func (h *Hub) Unregister(c *conn) {
	h.mu.Lock()
	delete(h.conns, c)
	trips := make([]string, 0, len(c.trips))
	for t := range c.trips {
		trips = append(trips, t)
	}
	h.mu.Unlock()

	for _, tripID := range trips {
		h.broadcastPresence(tripID)
	}
}

// Subscribe adds a trip subscription to a connection.
func (h *Hub) Subscribe(c *conn, tripID string) {
	h.mu.Lock()
	c.trips[tripID] = true
	h.mu.Unlock()

	h.broadcastPresence(tripID)
}

// Unsubscribe removes a trip subscription from a connection.
func (h *Hub) Unsubscribe(c *conn, tripID string) {
	h.mu.Lock()
	delete(c.trips, tripID)
	delete(c.pullCursors, tripID)
	h.mu.Unlock()

	h.broadcastPresence(tripID)
}

// UpdateCursor records the client's latest pull cursor for a trip and
// rebroadcasts presence so in_sync can be recalculated.
func (h *Hub) UpdateCursor(c *conn, tripID string, cursor int64) {
	h.mu.Lock()
	c.pullCursors[tripID] = cursor
	h.mu.Unlock()

	h.broadcastPresence(tripID)
}

// NotifyTripChanged broadcasts a trip.changed event to all connections
// subscribed to the given trip.
func (h *Hub) NotifyTripChanged(tripID string, headSeq int64) {
	evt := Event{
		Type: "trip.changed",
		Data: map[string]any{"trip_id": tripID, "head_seq": headSeq},
	}
	h.broadcast(tripID, evt)
}

// Subscribers returns the number of connections subscribed to a trip.
func (h *Hub) Subscribers(tripID string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for c := range h.conns {
		if c.trips[tripID] {
			n++
		}
	}
	return n
}

// broadcast sends an event to all connections subscribed to a trip.
func (h *Hub) broadcast(tripID string, evt Event) {
	data, err := json.Marshal(evt)
	if err != nil {
		slog.Error("marshal event", "error", err)
		return
	}

	h.mu.Lock()
	targets := make([]*conn, 0)
	for c := range h.conns {
		if c.trips[tripID] {
			targets = append(targets, c)
		}
	}
	h.mu.Unlock()

	for _, c := range targets {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := c.ws.Write(ctx, websocket.MessageText, data); err != nil {
			slog.Debug("write to ws", "user", c.userID, "error", err)
		}
		cancel()
	}
}

// broadcastPresence builds the presence list for a trip and sends it
// to all subscribed connections.
func (h *Hub) broadcastPresence(tripID string) {
	h.mu.Lock()
	// Collect unique users and their best cursor.
	type userState struct {
		userID string
		cursor int64
	}
	users := map[string]*userState{}
	for c := range h.conns {
		if !c.trips[tripID] {
			continue
		}
		if existing, ok := users[c.userID]; ok {
			// Take the highest cursor among the user's connections.
			if c.pullCursors[tripID] > existing.cursor {
				existing.cursor = c.pullCursors[tripID]
			}
		} else {
			users[c.userID] = &userState{
				userID: c.userID,
				cursor: c.pullCursors[tripID],
			}
		}
	}
	h.mu.Unlock()

	// Determine head seq for in_sync computation.
	var headSeq int64
	if h.headSeq != nil {
		var err error
		headSeq, err = h.headSeq(context.Background(), tripID)
		if err != nil {
			slog.Error("head seq for presence", "trip", tripID, "error", err)
		}
	}

	members := make([]PresenceMember, 0, len(users))
	for _, u := range users {
		members = append(members, PresenceMember{
			UserID: u.userID,
			InSync: headSeq == 0 || u.cursor >= headSeq,
		})
	}

	evt := Event{
		Type: "presence",
		Data: map[string]any{
			"trip_id": tripID,
			"members": members,
		},
	}
	h.broadcast(tripID, evt)
}

// newConn creates a tracked connection.
func newConn(ws *websocket.Conn, userID string) *conn {
	return &conn{
		ws:          ws,
		userID:      userID,
		trips:       make(map[string]bool),
		pullCursors: make(map[string]int64),
	}
}
