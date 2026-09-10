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

// ReceiveFunc reports whether a user may still be sent a trip's events.
// Injected for the same reason as HeadSeqFunc, and asked again for every
// send rather than remembered from the subscribe frame (ADR-056): a
// socket outlives both the membership and the account that authorised it.
type ReceiveFunc func(ctx context.Context, tripID, userID string) bool

// Hub manages WebSocket connections and their trip subscriptions.
type Hub struct {
	mu    sync.Mutex
	conns map[*conn]struct{}

	headSeq    HeadSeqFunc
	mayReceive ReceiveFunc
}

// NewHub creates a hub. headSeq may be nil if in_sync is not needed
// (e.g. in unit tests that only test broadcast); mayReceive may not, and
// a nil one admits nobody — an authorization gate that fails open is
// worse than one that fails shut, and total silence is loud in a test.
func NewHub(headSeq HeadSeqFunc, mayReceive ReceiveFunc) *Hub {
	return &Hub{
		conns:      make(map[*conn]struct{}),
		headSeq:    headSeq,
		mayReceive: mayReceive,
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
	evt := WSEvent{
		Type:    EventTripChanged,
		Payload: map[string]any{"trip_id": tripID, "head_seq": headSeq},
	}
	h.broadcast(tripID, evt)
}

// NotifyItemLocked broadcasts the ephemeral G-3 lock event (spec §7).
// The lock is also persisted via the normal mutation; this only lowers
// latency for connected clients.
func (h *Hub) NotifyItemLocked(tripID, itemID, byUser, name string) {
	h.broadcast(tripID, WSEvent{Type: EventItemLocked, Payload: map[string]any{
		"trip_id": tripID, "item_id": itemID, "by_user": byUser, "name": name,
	}})
}

// NotifyItemUnlocked broadcasts the ephemeral G-3 unlock event (spec §7).
func (h *Hub) NotifyItemUnlocked(tripID, itemID, byUser, name string) {
	h.broadcast(tripID, WSEvent{Type: EventItemUnlocked, Payload: map[string]any{
		"trip_id": tripID, "item_id": itemID, "by_user": byUser, "name": name,
	}})
}

// NotifyMasterChanged sends a master.changed event to every connection
// of the given user (Sync-API Spec §7) — the master partition has no
// subscriptions, and other users discover shared changes lazily on
// their next pull (spec §8).
func (h *Hub) NotifyMasterChanged(userID string, seq int64) {
	h.send(h.connsOf(userID), WSEvent{
		Type:    EventMasterChanged,
		Payload: map[string]any{"seq": seq},
	})
}

// NotifyNotificationCreated sends notification.created to every
// connection of the target user (spec §7). Delivery keys off the
// connection's authenticated identity — the user: subscribe frame is
// accepted but redundant, so a client can never miss (or steal) the
// event by (mis)subscribing.
func (h *Hub) NotifyNotificationCreated(userID, notificationID string) {
	h.send(h.connsOf(userID), WSEvent{
		Type:    EventNotificationCreated,
		Payload: map[string]any{"notification_id": notificationID},
	})
}

// connsOf returns all connections authenticated as the given user.
func (h *Hub) connsOf(userID string) []*conn {
	h.mu.Lock()
	defer h.mu.Unlock()
	targets := make([]*conn, 0)
	for c := range h.conns {
		if c.userID == userID {
			targets = append(targets, c)
		}
	}
	return targets
}

// Subscribers returns the number of connections a trip's events would
// reach — subscribed *and* still authorised, which is what makes it a
// settled state a test can assert a revocation against.
func (h *Hub) Subscribers(tripID string) int {
	return len(h.subscribersOf(tripID))
}

// subscribersOf returns the connections a trip's events may go to right
// now. The authorisation runs outside the mutex because it reaches the
// database, and the two steps are separate for that reason alone.
func (h *Hub) subscribersOf(tripID string) []*conn {
	h.mu.Lock()
	subscribed := make([]*conn, 0)
	for c := range h.conns {
		if c.trips[tripID] {
			subscribed = append(subscribed, c)
		}
	}
	h.mu.Unlock()

	allowed := make([]*conn, 0, len(subscribed))
	for _, c := range subscribed {
		if h.mayReceive != nil && h.mayReceive(context.Background(), tripID, c.userID) {
			allowed = append(allowed, c)
		}
	}
	return allowed
}

// broadcast sends an event to every connection a trip may reach.
func (h *Hub) broadcast(tripID string, evt WSEvent) {
	h.send(h.subscribersOf(tripID), evt)
}

// send writes an event to the given connections.
func (h *Hub) send(targets []*conn, evt WSEvent) {
	data, err := json.Marshal(evt)
	if err != nil {
		slog.Error("marshal event", "error", err)
		return
	}
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
	// One authorised set answers both halves: who is listed, and who is
	// told. A revoked member is neither.
	targets := h.subscribersOf(tripID)

	h.mu.Lock()
	// Collect unique users, their device count, and their best cursor.
	type userState struct {
		userID  string
		devices int
		cursor  int64
	}
	users := map[string]*userState{}
	for _, c := range targets {
		if existing, ok := users[c.userID]; ok {
			existing.devices++
			// Take the highest cursor among the user's connections.
			if c.pullCursors[tripID] > existing.cursor {
				existing.cursor = c.pullCursors[tripID]
			}
		} else {
			users[c.userID] = &userState{
				userID:  c.userID,
				devices: 1,
				cursor:  c.pullCursors[tripID],
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
			UserID:      u.userID,
			DeviceCount: u.devices,
			InSync:      headSeq == 0 || u.cursor >= headSeq,
		})
	}

	evt := WSEvent{
		Type: EventPresence,
		Payload: map[string]any{
			"trip_id": tripID,
			"users":   members,
		},
	}
	h.send(targets, evt)
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
