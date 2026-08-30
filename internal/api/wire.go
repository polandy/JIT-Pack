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

// --- Master row deletion (ADR-038) ---

// MasterDeleteResponse answers a DELETE on a single master row.
//
// Retired carries what the status code cannot: FR-24.3 keeps a row the rest
// of the data still resolves against, so a 200 does not always mean the row
// is gone. A caller cleaning up has to be able to tell the two apart without
// pulling the partition back down.
type MasterDeleteResponse struct {
	Outcome  MutationOutcome `json:"outcome"`
	Retired  bool            `json:"retired"`
	PullHint PullHint        `json:"pull_hint"`
}

// --- API tokens (FR-23.7, ADR-039) ---

// APITokenExpiry is how long a minted token lives.
//
// A closed vocabulary rather than a number of days, so the screen's select,
// the CLI's flag and the handler's validation read the same four values from
// one declaration instead of agreeing by hand (§4a).
type APITokenExpiry string

// The four lifetimes on offer. `exp` is the only thing that ever ends an
// unmanaged token's life on its own, which is why "never" is a deliberate
// answer here and not the absence of one.
const (
	APITokenExpiry30d   APITokenExpiry = "30d"
	APITokenExpiry90d   APITokenExpiry = "90d"
	APITokenExpiry365d  APITokenExpiry = "365d"
	APITokenExpiryNever APITokenExpiry = "never"
)

// APITokenRequest asks for one token. Both fields are required: the server
// has no default lifetime on purpose, so the choice is made rather than
// inherited.
type APITokenRequest struct {
	Name   string         `json:"name"`
	Expiry APITokenExpiry `json:"expiry"`
}

// APITokenResponse is the only response in this API that carries a
// credential, and the only time the token is ever readable — nothing stores
// it.
type APITokenResponse struct {
	Token string `json:"token"`
	// RFC3339, or empty for a token that does not expire. Always present
	// rather than omitted: an optional field would make every read site
	// branch, and there is exactly one read site.
	ExpiresAt string `json:"expires_at"`
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

// --- Conflict log (Sync-API §8, NFR-4.2a) ---

// ConflictEntry is one audited last-write-wins loser. MutationID and
// ActorUserID name who lost what: the pair was added with per-field clocks
// (ADR-022) and the client's hand-written copy of this type never grew them,
// which is the drift this file exists to make impossible.
type ConflictEntry struct {
	ID           string `json:"id"`
	EntityTable  string `json:"entity_table"`
	EntityID     string `json:"entity_id"`
	Field        string `json:"field"`
	LosingValue  string `json:"losing_value"`
	WinningValue string `json:"winning_value"`
	MutationID   string `json:"mutation_id"`
	ActorUserID  string `json:"actor_user_id"`
	ResolvedAt   string `json:"resolved_at"`
	// True once the losing value has been restored by a revert (ADR-023).
	Reverted bool `json:"reverted"`
}

// ConflictListResponse is what both conflict endpoints answer — one query
// serves the trip partition and the master partition alike.
type ConflictListResponse struct {
	Conflicts []ConflictEntry `json:"conflicts"`
}

// RevertResponse is the §8 RPC envelope. The revert materialises as an
// ordinary change-log entry, so the caller learns the new value by pulling
// from the hint rather than from this body (Sync-API P-1).
type RevertResponse struct {
	OK       bool     `json:"ok"`
	PullHint PullHint `json:"pull_hint"`
}

// --- Identity (Sync-API §8) ---

// MeResponse is the caller's own identity. IsInstanceAdmin decides whether the
// client renders the M20 entry point (FR-23.2); the admin endpoints enforce it
// regardless of what the client does with it.
type MeResponse struct {
	UserID          string `json:"user_id"`
	DisplayName     string `json:"display_name"`
	IsInstanceAdmin bool   `json:"is_instance_admin"`
}

// DirectoryUser is one entry of the instance user directory — name and id
// only, which is what the M3 sharing step needs (FR-4.5).
type DirectoryUser struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
}

// UserListResponse is the directory envelope, ordered by name with
// deactivated accounts excluded (FR-23.3).
type UserListResponse struct {
	Users []DirectoryUser `json:"users"`
}

// --- Admin (Addendum 3.23) ---

// AdminUser is one row of the FR-23.2 account overview. DeactivatedAt is null
// for an active account rather than absent, because the client renders the two
// states differently and an absent key would read as "unknown".
type AdminUser struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
	// Absent where the IdP provided none.
	Email           string  `json:"email,omitempty"`
	CreatedAt       string  `json:"created_at"`
	IsInstanceAdmin bool    `json:"is_instance_admin"`
	DeactivatedAt   *string `json:"deactivated_at"`
	TripCount       int     `json:"trip_count"`
	TemplateCount   int     `json:"template_count"`
}

// AdminUserListResponse is the overview envelope.
type AdminUserListResponse struct {
	Users []AdminUser `json:"users"`
}

// --- Notifications (FR-6.2) ---

// NotificationEntry is one notification. It is not named Notification because
// that is a DOM global on the client, and a generated type shadowing it would
// be a trap rather than a contract.
type NotificationEntry struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	// The teaser the toast and the OS notification render; the deep link
	// carries the rest. Null where the stored payload was empty.
	Payload   map[string]any `json:"payload"`
	CreatedAt string         `json:"created_at"`
	// Absent while unread.
	ReadAt *string `json:"read_at,omitempty"`
}

// NotificationListResponse is the list envelope, newest first.
type NotificationListResponse struct {
	Notifications []NotificationEntry `json:"notifications"`
}

// NotificationPrefs is the per-kind toggle set (UI-Spec M17). The server
// answers all three keys always — a kind the stored value omits comes back
// enabled — so none of them is optional on the wire.
type NotificationPrefs struct {
	Delegation bool `json:"delegation"`
	Mention    bool `json:"mention"`
	Task       bool `json:"task"`
	// FR-5.7: somebody took over a row this user had claimed.
	LockTaken bool `json:"lock_taken"`
}

// --- Web Push (NFR-4.6) ---

// VAPIDKeyResponse carries the instance's public VAPID key, generated on
// first use and persisted beside the database.
type VAPIDKeyResponse struct {
	Key string `json:"key"`
}

// --- Auth (ADR-007) ---

// AuthConfigResponse tells the client where to send the user to log in. A
// server without OIDC answers 501 `not_configured` instead, which is how
// Single-User Mode is discovered (invariant 5).
type AuthConfigResponse struct {
	AuthorizeURL string `json:"authorize_url"`
	ClientID     string `json:"client_id"`
}

// InstanceConfigResponse carries what the client must know about the
// instance before it renders anything, and nothing that identifies a
// caller — it is answered without a session, in every mode.
//
// Currency is an ISO-4217 code, or empty where the operator named none:
// amounts then stay unit-less, as they were before FR-21.9. It is a label,
// never a conversion — the stored amount is already in this currency.
type InstanceConfigResponse struct {
	Currency string `json:"currency"`
}

// SessionTokens is the first-party session pair the login broker issues.
// ExpiresIn is the access token's lifetime in seconds.
type SessionTokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

// --- Acknowledgements ---

// OKResponse is the body of an action that has nothing to report but its own
// success. It is one type rather than a map at each call site, so the client
// cannot be written against a key that is spelled differently in one handler.
type OKResponse struct {
	OK bool `json:"ok"`
}

// --- Takeovers (Sync-API §8, FR-5.7) ---

// TakeoverResponse is what a takeover answers. Like a revert it is an
// ordinary change-log entry underneath (ADR-028), so the caller learns the
// row's new state by pulling from the hint. PreviousHolder is what the
// screen needs on the way back: the confirmation named the holder before
// the fact, and the snackbar afterwards names whom it was taken from.
type TakeoverResponse struct {
	OK             bool     `json:"ok"`
	PreviousHolder string   `json:"previous_holder"`
	PullHint       PullHint `json:"pull_hint"`
}

// LockEvent is one recorded takeover. The item is named rather than only
// referenced because the record has to stay readable after the row it names
// is deleted — a line saying "took over 4f3a…" answers nothing.
type LockEvent struct {
	ID         string `json:"id"`
	TripItemID string `json:"trip_item_id"`
	ItemName   string `json:"item_name"`
	FromUserID string `json:"from_user_id"`
	ToUserID   string `json:"to_user_id"`
	CreatedAt  string `json:"created_at"`
}

// LockEventListResponse is a trip's takeover record, newest first.
type LockEventListResponse struct {
	LockEvents []LockEvent `json:"lock_events"`
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
	ErrClaimNotHeld         ErrorCode = "claim_not_held"
	ErrClaimIsOwn           ErrorCode = "claim_is_own"
	ErrIDPError             ErrorCode = "idp_error"
	ErrIDPUnreachable       ErrorCode = "idp_unreachable"
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

// --- Routes (ADR-027) ---

// The path-variable names. A placeholder is written in a route pattern and read
// back with r.PathValue; naming it once is what keeps the two spellings from
// drifting into a nil id that no compiler and no handler test would notice.
const (
	PathTripID         = "tripID"
	PathConflictID     = "conflictID"
	PathUserID         = "userID"
	PathItemID         = "itemID"
	PathNotificationID = "notificationID"
	PathTagID          = "tagID"
	PathTemplateID     = "templateID"
	PathTemplateItemID = "templateItemID"
)

// Every path this instance serves, declared once. The server registers from
// these constants and cmd/wiregen writes the client's builders from them, so a
// rename is one edit rather than an agreement between two test tables
// (NFR-4.14). The shape rule is ADR-027: a path names its scope first, then the
// resource; the master partition's scope segment is the literal `master`; an
// export names its format as the path's extension.
//
// The version prefix is spelled out on every line rather than concatenated from
// a constant: this is a table, and a reader checking a path against the spec
// should not have to assemble it. Moving to /api/v2 is one pass over one block.
const (
	// Trip scope.
	RouteTripSync           = "/api/v1/trips/{tripID}/sync"
	RouteTripConflicts      = "/api/v1/trips/{tripID}/conflicts"
	RouteTripConflictRevert = "/api/v1/trips/{tripID}/conflicts/{conflictID}/revert"
	RouteTripItemTakeover   = "/api/v1/trips/{tripID}/items/{itemID}/takeover"
	RouteTripLockEvents     = "/api/v1/trips/{tripID}/lock-events"
	RouteTripExportCSV      = "/api/v1/trips/{tripID}/export.csv"

	// Master scope — the partition that belongs to no trip, so its scope
	// segment is a literal rather than an id.
	RouteMasterSync           = "/api/v1/master/sync"
	RouteMasterConflicts      = "/api/v1/master/conflicts"
	RouteMasterConflictRevert = "/api/v1/master/conflicts/{conflictID}/revert"

	// One master row, addressed directly, so deleting it does not mean
	// composing a mutation (ADR-038). The app itself does not call these —
	// it writes through the push above so its writes survive being offline —
	// and both doors run the same FR-24.3 rule underneath.
	RouteMasterTag          = "/api/v1/master/tags/{tagID}"
	RouteMasterItem         = "/api/v1/master/items/{itemID}"
	RouteMasterTemplate     = "/api/v1/master/templates/{templateID}"
	RouteMasterTemplateItem = "/api/v1/master/template-items/{templateItemID}"

	// The caller's own scope. The full export lives here because it is
	// filtered to what the caller may pull, and it names its format.
	RouteMe                  = "/api/v1/me"
	RouteMeNotificationPrefs = "/api/v1/me/notification-prefs"
	RouteMeExport            = "/api/v1/me/export.json"
	RouteMeTokens            = "/api/v1/me/tokens"

	// User scope.
	RouteUsers           = "/api/v1/users"
	RouteUserAvatar      = "/api/v1/users/{userID}/avatar"
	RouteUserDisplayName = "/api/v1/users/{userID}/display-name"

	// Item scope.
	RouteItemImage = "/api/v1/items/{itemID}/image"

	// Notification scope.
	RouteNotifications    = "/api/v1/notifications"
	RouteNotificationRead = "/api/v1/notifications/{notificationID}/read"

	// Web Push scope.
	RoutePushVAPIDKey      = "/api/v1/push/vapid-key"
	RoutePushSubscriptions = "/api/v1/push/subscriptions"

	// Admin scope.
	RouteAdminUsers            = "/api/v1/admin/users"
	RouteAdminDeactivateUser   = "/api/v1/admin/users/{userID}/deactivate"
	RouteAdminReactivateUser   = "/api/v1/admin/users/{userID}/reactivate"
	RouteAdminResetAvatar      = "/api/v1/admin/users/{userID}/avatar"
	RouteAdminResetDisplayName = "/api/v1/admin/users/{userID}/display-name"

	// Instance scope: no caller, no partition.
	RouteAuthToken   = "/api/v1/auth/token"
	RouteAuthRefresh = "/api/v1/auth/refresh"
	RouteAuthConfig  = "/api/v1/auth/config"

	// Instance-wide settings the client renders with (ADR-027: scope
	// first). Deliberately its own path rather than a field on
	// /auth/config, which answers 501 in Single-User Mode and would
	// therefore hide the settings from a mode that has them.
	RouteInstanceConfig = "/api/v1/instance/config"

	// Outside the versioned surface on purpose: the socket carries the
	// versioned frame in its payload, and a health probe is not an API.
	RouteWS     = "/ws"
	RouteHealth = "/health"
)
