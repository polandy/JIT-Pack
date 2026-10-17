// The WebSocket half of the contract (Sync-API §7, NFR-4.14): the frames the
// hub sends, the payload each one carries, and the frame a client sends back.
// cmd/wiregen reads it together with wire.go; see that file's header.

package api

// --- Server → client ---

// WSEventType is the kind of a WebSocket frame.
type WSEventType string

// Every frame the hub sends. A client that receives an unknown type ignores it.
const (
	EventTripChanged   WSEventType = "trip.changed"
	EventMasterChanged WSEventType = "master.changed"
	EventItemLocked    WSEventType = "item.locked"
	EventItemUnlocked  WSEventType = "item.unlocked"
	EventPresence      WSEventType = "presence"
	// EventRoster tells a connection who else is working on a trip it shares
	// (FR-4.9). Sent to every connection, not only to a trip's subscribers:
	// it answers a question about the account, asked from any screen.
	EventRoster              WSEventType = "roster"
	EventNotificationCreated WSEventType = "notification.created"
	// EventLocation is one person's live position on a trip, or its end
	// (FR-29.19, ADR-087). Sent to the trip's other subscribers only.
	EventLocation WSEventType = "location"
	// EventPong answers a client {"ping": true} frame (Sync-API §7/§9).
	// It carries no payload: its arrival is the information — the client's
	// liveness watchdog eats it, nothing else reads it.
	EventPong WSEventType = "pong"
)

// WSEvent is one frame. Which payload it carries is decided by Type, as
// wsEventPayloads declares; the client's type is the discriminated union
// cmd/wiregen builds from that table.
type WSEvent struct {
	Type    WSEventType `json:"type"`
	Payload any         `json:"payload"`
}

// wsEventPayloads names the payload of every frame type — nil for none.
// cmd/wiregen reads it as source and refuses a type it does not name, and
// TestWSEventPayloads_EveryFrameCarriesItsDeclaredPayload holds the hub's
// frame builders to it.
var wsEventPayloads = map[WSEventType]any{
	EventTripChanged:         TripChangedPayload{},
	EventMasterChanged:       MasterChangedPayload{},
	EventItemLocked:          ItemLockPayload{},
	EventItemUnlocked:        ItemLockPayload{},
	EventPresence:            PresencePayload{},
	EventRoster:              RosterPayload{},
	EventNotificationCreated: NotificationCreatedPayload{},
	EventLocation:            LiveLocation{},
	EventPong:                nil,
}

// TripChangedPayload says a trip's change feed has grown to HeadSeq. A ping,
// not the change: the client pulls.
type TripChangedPayload struct {
	TripID  string `json:"trip_id"`
	HeadSeq int64  `json:"head_seq"`
}

// MasterChangedPayload says the receiver's master feed has grown to Seq.
type MasterChangedPayload struct {
	Seq int64 `json:"seq"`
}

// ItemLockPayload is the ephemeral G-3 claim on a row, or its release: who
// holds it and the row's name.
type ItemLockPayload struct {
	TripID string `json:"trip_id"`
	ItemID string `json:"item_id"`
	ByUser string `json:"by_user"`
	Name   string `json:"name"`
}

// PresencePayload is the facepile of one trip: every user connected to it.
type PresencePayload struct {
	TripID string `json:"trip_id"`
	// HeadSeq is the trip head every member's in-sync verdict was judged
	// against (0: no head known, everyone counts as in sync). It is what tells
	// "everyone has caught up to this write" from the same verdict before it.
	HeadSeq int64            `json:"head_seq"`
	Users   []PresenceMember `json:"users"`
}

// RosterPayload is everyone the receiver shares a trip with who has one open
// (FR-4.9).
type RosterPayload struct {
	Users []RosterMember `json:"users"`
}

// NotificationCreatedPayload names a new notification; the row itself comes
// through the list endpoint.
type NotificationCreatedPayload struct {
	NotificationID string `json:"notification_id"`
}

// PresenceMember is one entry in the presence facepile (Sync-API §7). It is
// the payload of an EventPresence frame, one per user currently connected.
type PresenceMember struct {
	UserID      string `json:"user_id"`
	DeviceCount int    `json:"device_count"`
	InSync      bool   `json:"in_sync"`
}

// RosterMember is one entry of an EventRoster frame (FR-4.9): a person other
// than the receiver, and the trips they have open in the packing list right now
// that the receiver is a member of too. A person with no such trip is not
// listed at all, which is how the roster keeps to what the receiver may know.
type RosterMember struct {
	UserID  string   `json:"user_id"`
	TripIDs []string `json:"trip_ids"`
}

// LiveLocation is the payload of an EventLocation frame (FR-29.19): where a
// traveller is, as their device said and the server stamped — UserID and At
// are the server's, never the client's. Gone ends it, and then carries only
// the trip and the person. Nothing of it is stored (ADR-087).
type LiveLocation struct {
	TripID    string  `json:"trip_id"`
	UserID    string  `json:"user_id"`
	Lat       float64 `json:"lat"`
	Lon       float64 `json:"lon"`
	AccuracyM float64 `json:"accuracy_m"`
	// At is when the server received the fix, RFC3339; empty when Gone.
	At   string `json:"at"`
	Gone bool   `json:"gone"`
}

// --- Client → server ---

// WSChannelTripPrefix starts a trip's channel name in a subscribe frame:
// "trip:<id>". A "user:<id>" channel is accepted and ignored — a user's own
// frames follow the connection's identity.
const WSChannelTripPrefix = "trip:"

// WSClientFrame is the one frame a client sends; each key present is one
// instruction:
//
//	{"subscribe":   ["trip:<id>"]}
//	{"unsubscribe": ["trip:<id>"]}
//	{"cursor":      {"trip_id": "...", "seq": 123}}
//	{"location":    {"trip_id": "...", "lat": 46.5, "lon": 9.8, "accuracy_m": 12}}
//	{"location":    {"trip_id": "...", "stop": true}}
type WSClientFrame struct {
	Subscribe   []string  `json:"subscribe,omitempty"`
	Unsubscribe []string  `json:"unsubscribe,omitempty"`
	Cursor      *WSCursor `json:"cursor,omitempty"`
	// Viewing names the trip the packing list is open on, "trip_id": "" for
	// none (FR-4.9).
	Viewing *WSViewing `json:"viewing,omitempty"`
	// Ping is the client's keepalive (Sync-API §9), answered with an
	// EventPong frame. App-level on purpose: a browser cannot send
	// protocol pings, and the client needs a frame it can *see* to know
	// the connection is still two-way.
	Ping bool `json:"ping,omitempty"`
	// Location shares where the sender is on a trip, or stops sharing it
	// (FR-29.19).
	Location *WSLocation `json:"location,omitempty"`
}

// WSLocation is a position to share, or Stop. The server only decodes it, so
// omitempty shapes nothing but the client's type: a stop carries no fix.
type WSLocation struct {
	TripID    string  `json:"trip_id"`
	Lat       float64 `json:"lat,omitempty"`
	Lon       float64 `json:"lon,omitempty"`
	AccuracyM float64 `json:"accuracy_m,omitempty"`
	Stop      bool    `json:"stop,omitempty"`
}

// WSViewing names the trip open in the packing list, "" for none.
type WSViewing struct {
	TripID string `json:"trip_id"`
}

// WSCursor reports how far the sender has pulled a trip, for in_sync (§7).
type WSCursor struct {
	TripID string `json:"trip_id"`
	Seq    int64  `json:"seq"`
}
