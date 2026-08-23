// This file is the contract between the server and the client (NFR-4.14).
//
// It is the single declaration of the sync envelopes, the WebSocket frame and
// the error vocabulary; `make wire` regenerates client/src/api/types.ts
// from it, and the CI gate fails the build when the two drift apart. Adding a
// field here and forgetting the client is therefore no longer possible — which
// is the defect class this file exists to close (ADR-026).
//
// Prose about *why* the protocol behaves as it does stays in
// dev-docs/Sync_API_Spec_v1.3.md; what lives here is the shape.

package api

// --- Pull (Sync-API §4) ---

// PullChange is one row of the change feed, in change-log order.
type PullChange struct {
	Seq     int64  `json:"seq"`
	Table   string `json:"table"`
	ID      string `json:"id"`
	Deleted bool   `json:"deleted"`
	// Null for a deletion: there is no row left to send.
	Row map[string]any `json:"row"`
}

// PullResponse is one page of the change feed. NextCursor is where the *next*
// pull starts; it is not a hint and must be stored by the client.
type PullResponse struct {
	Changes    []PullChange `json:"changes"`
	NextCursor int64        `json:"next_cursor"`
	HasMore    bool         `json:"has_more"`
}

// --- Push (Sync-API §5) ---

// MutationOp is what a mutation does to its row.
type MutationOp string

// The three operations a push may carry.
const (
	OpUpsert MutationOp = "upsert"
	OpInsert MutationOp = "insert"
	OpDelete MutationOp = "delete"
)

// Mutation is one change made on a device, carrying the clock it was made at.
type Mutation struct {
	// Minted once at enqueue and replayed unchanged, so the server can memo a
	// retry instead of applying it twice (NFR-4.1a, Sync-API P-5).
	MutationID string     `json:"mutation_id"`
	Op         MutationOp `json:"op"`
	Table      string     `json:"table"`
	ID         string     `json:"id"`
	// Absent on a delete: there are no fields to carry, and the key is left
	// off rather than sent as null.
	Fields map[string]any `json:"fields,omitempty"`
	// Hybrid logical clock, format per Sync-API §3.
	HLC string `json:"hlc"`
}

// PushRequest is a batch of mutations from one device.
type PushRequest struct {
	ClientHLC string     `json:"client_hlc"`
	Mutations []Mutation `json:"mutations"`
}

// MutationOutcome is the server's answer for a single mutation. The wire key
// carrying it is `outcome`, never `status`: the client once read `status`,
// which no response has ever contained, so every rejection read as undefined
// and was dropped instead of parked.
type MutationOutcome string

// The four outcomes a mutation can have.
const (
	OutcomeApplied   MutationOutcome = "applied"
	OutcomeMerged    MutationOutcome = "merged"
	OutcomeDuplicate MutationOutcome = "duplicate"
	OutcomeRejected  MutationOutcome = "rejected"
)

// MutationConflict names one field the merge decided against the pushing
// device, so the loss can be shown and reverted (NFR-4.2a, ADR-023).
type MutationConflict struct {
	Field        string `json:"field"`
	LosingValue  any    `json:"losing_value"`
	WinningValue any    `json:"winning_value"`
}

// MutationResult is the per-mutation answer inside a push response.
type MutationResult struct {
	MutationID string             `json:"mutation_id"`
	Outcome    MutationOutcome    `json:"outcome"`
	Conflicts  []MutationConflict `json:"conflicts,omitempty"`
	Error      string             `json:"error,omitempty"`
}

// PullHint tells the client that new changes exist. It is deliberately not a
// cursor: taking `next_cursor` from here as the pull position skips everything
// between the device's own position and this one.
type PullHint struct {
	NextCursor int64 `json:"next_cursor"`
}

// PushResponse answers a whole batch, one result per mutation, in order.
type PushResponse struct {
	Results  []MutationResult `json:"results"`
	PullHint PullHint         `json:"pull_hint"`
}

// --- WebSocket (Sync-API §7) ---

// WSEventType is the kind of a WebSocket frame.
type WSEventType string

// Every frame the hub sends. A client that receives an unknown type ignores it.
const (
	EventTripChanged         WSEventType = "trip.changed"
	EventMasterChanged       WSEventType = "master.changed"
	EventItemLocked          WSEventType = "item.locked"
	EventItemUnlocked        WSEventType = "item.unlocked"
	EventPresence            WSEventType = "presence"
	EventNotificationCreated WSEventType = "notification.created"
)

// WSEvent is one frame. Which keys the payload carries is decided by Type —
// Go cannot express that as a discriminated union, so the payload is declared
// as what every sender actually passes: an object, or null.
type WSEvent struct {
	Type    WSEventType    `json:"type"`
	Payload map[string]any `json:"payload"`
}

// PresenceMember is one entry in the presence facepile (Sync-API §7). It is
// the payload of an EventPresence frame, one per user currently connected.
type PresenceMember struct {
	UserID      string `json:"user_id"`
	DeviceCount int    `json:"device_count"`
	InSync      bool   `json:"in_sync"`
}

// --- Errors (Sync-API §9) ---

// ErrorCode is the machine-readable half of an error. The client branches on
// these values, so they are named once here and generated into the client
// rather than spelled again as literals (CODING_PRINCIPLES §4a).
type ErrorCode string

// Every code the server sends.
const (
	ErrValidation           ErrorCode = "validation"
	ErrUnauthorized         ErrorCode = "unauthorized"
	ErrForbidden            ErrorCode = "forbidden"
	ErrNotFound             ErrorCode = "not_found"
	ErrInternal             ErrorCode = "internal"
	ErrNotConfigured        ErrorCode = "not_configured"
	ErrAccountDeactivated   ErrorCode = "account_deactivated"
	ErrAdminUndeactivatable ErrorCode = "admin_undeactivatable"
	ErrTripNotFound         ErrorCode = "trip_not_found"
	ErrConflictNotFound     ErrorCode = "conflict_not_found"
	ErrNotificationNotFound ErrorCode = "notification_not_found"
	ErrAlreadyReverted      ErrorCode = "already_reverted"
	ErrRevertRefused        ErrorCode = "revert_refused"
	ErrRowDeleted           ErrorCode = "row_deleted"
	ErrIdPError             ErrorCode = "idp_error"
	ErrIdPUnreachable       ErrorCode = "idp_unreachable"
)

// APIErrorBody is the inner object of an error response.
type APIErrorBody struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Field   string    `json:"field,omitempty"`
}

// APIError is the one shape every non-2xx response has. No handler writes a
// bare status: the client parses exactly this, in every mode.
type APIError struct {
	Error APIErrorBody `json:"error"`
}
