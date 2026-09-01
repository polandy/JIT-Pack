/**
 * Generated from internal/api/wire.go by cmd/wiregen. Do not edit.
 *
 * This file is the client's half of the one contract (NFR-4.14): the Go
 * declaration is the source, and `make wire` regenerates it. A hand edit here is
 * undone by the next generation and reported by the CI gate before that.
 */

/**
 * PullChange is one row of the change feed, in change-log order.
 */
export interface PullChange {
  seq: number
  table: string
  id: string
  deleted: boolean
  // Null for a deletion: there is no row left to send.
  row: Record<string, unknown> | null
}

/**
 * PullResponse is one page of the change feed. NextCursor is where the *next*
 * pull starts; it is not a hint and must be stored by the client.
 */
export interface PullResponse {
  changes: PullChange[]
  next_cursor: number
  has_more: boolean
}

/**
 * MutationOp is what a mutation does to its row.
 */
export type MutationOp = 'upsert' | 'insert' | 'delete'

export const MUTATION_OP = {
  upsert: 'upsert',
  insert: 'insert',
  delete: 'delete',
} as const

/**
 * Mutation is one change made on a device, carrying the clock it was made at.
 */
export interface Mutation {
  // Minted once at enqueue and replayed unchanged, so the server can memo a
  // retry instead of applying it twice (NFR-4.1a, Sync-API P-5).
  mutation_id: string
  op: MutationOp
  table: string
  id: string
  // Absent on a delete: there are no fields to carry, and the key is left
  // off rather than sent as null.
  fields?: Record<string, unknown>
  // Hybrid logical clock, format per Sync-API §3.
  hlc: string
}

/**
 * PushRequest is a batch of mutations from one device.
 */
export interface PushRequest {
  client_hlc: string
  mutations: Mutation[]
}

/**
 * MutationOutcome is the server's answer for a single mutation. The wire key
 * carrying it is `outcome`, never `status`: the client once read `status`,
 * which no response has ever contained, so every rejection read as undefined
 * and was dropped instead of parked.
 */
export type MutationOutcome = 'applied' | 'merged' | 'duplicate' | 'rejected'

export const MUTATION_OUTCOME = {
  applied: 'applied',
  merged: 'merged',
  duplicate: 'duplicate',
  rejected: 'rejected',
} as const

/**
 * MutationConflict names one field the merge decided against the pushing
 * device, so the loss can be shown and reverted (NFR-4.2a, ADR-023).
 */
export interface MutationConflict {
  field: string
  losing_value: unknown
  winning_value: unknown
}

/**
 * MutationResult is the per-mutation answer inside a push response.
 */
export interface MutationResult {
  mutation_id: string
  outcome: MutationOutcome
  conflicts?: MutationConflict[]
  error?: string
}

/**
 * PullHint tells the client that new changes exist. It is deliberately not a
 * cursor: taking `next_cursor` from here as the pull position skips everything
 * between the device's own position and this one.
 */
export interface PullHint {
  next_cursor: number
}

/**
 * PushResponse answers a whole batch, one result per mutation, in order.
 */
export interface PushResponse {
  results: MutationResult[]
  pull_hint: PullHint
}

/**
 * MasterDeleteResponse answers a DELETE on a single master row.
 *
 * Retired carries what the status code cannot: FR-24.3 keeps a row the rest
 * of the data still resolves against, so a 200 does not always mean the row
 * is gone. A caller cleaning up has to be able to tell the two apart without
 * pulling the partition back down.
 */
export interface MasterDeleteResponse {
  outcome: MutationOutcome
  retired: boolean
  pull_hint: PullHint
}

/**
 * APITokenExpiry is how long a minted token lives.
 *
 * A closed vocabulary rather than a number of days, so the screen's select,
 * the CLI's flag and the handler's validation read the same four values from
 * one declaration instead of agreeing by hand (§4a).
 */
export type APITokenExpiry = '1h' | '1d' | '7d' | '30d' | '90d' | '365d' | 'never'

export const API_TOKEN_EXPIRY = {
  '1h': '1h',
  '1d': '1d',
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '365d': '365d',
  never: 'never',
} as const

/**
 * APITokenRequest asks for one token. Both fields are required: the server
 * has no default lifetime on purpose, so the choice is made rather than
 * inherited.
 */
export interface APITokenRequest {
  name: string
  expiry: APITokenExpiry
}

/**
 * APITokenResponse is the only response in this API that carries a
 * credential, and the only time the token is ever readable — nothing stores
 * it.
 */
export interface APITokenResponse {
  token: string
  // RFC3339, or empty for a token that does not expire. Always present
  // rather than omitted: an optional field would make every read site
  // branch, and there is exactly one read site.
  expires_at: string
}

/**
 * WSEventType is the kind of a WebSocket frame.
 */
export type WSEventType =
  | 'trip.changed'
  | 'master.changed'
  | 'item.locked'
  | 'item.unlocked'
  | 'presence'
  | 'notification.created'
  | 'pong'

export const WS_EVENT_TYPE = {
  'trip.changed': 'trip.changed',
  'master.changed': 'master.changed',
  'item.locked': 'item.locked',
  'item.unlocked': 'item.unlocked',
  presence: 'presence',
  'notification.created': 'notification.created',
  pong: 'pong',
} as const

/**
 * WSEvent is one frame. Which keys the payload carries is decided by Type —
 * Go cannot express that as a discriminated union, so the payload is declared
 * as what every sender actually passes: an object, or null.
 */
export interface WSEvent {
  type: WSEventType
  payload: Record<string, unknown> | null
}

/**
 * PresenceMember is one entry in the presence facepile (Sync-API §7). It is
 * the payload of an EventPresence frame, one per user currently connected.
 */
export interface PresenceMember {
  user_id: string
  device_count: number
  in_sync: boolean
}

/**
 * ConflictEntry is one audited last-write-wins loser. MutationID and
 * ActorUserID name who lost what: the pair was added with per-field clocks
 * (ADR-022) and the client's hand-written copy of this type never grew them,
 * which is the drift this file exists to make impossible.
 */
export interface ConflictEntry {
  id: string
  entity_table: string
  entity_id: string
  field: string
  losing_value: string
  winning_value: string
  mutation_id: string
  actor_user_id: string
  resolved_at: string
  // True once the losing value has been restored by a revert (ADR-023).
  reverted: boolean
}

/**
 * ConflictListResponse is what both conflict endpoints answer — one query
 * serves the trip partition and the master partition alike.
 */
export interface ConflictListResponse {
  conflicts: ConflictEntry[]
}

/**
 * RevertResponse is the §8 RPC envelope. The revert materialises as an
 * ordinary change-log entry, so the caller learns the new value by pulling
 * from the hint rather than from this body (Sync-API P-1).
 */
export interface RevertResponse {
  ok: boolean
  pull_hint: PullHint
}

/**
 * MeResponse is the caller's own identity. IsInstanceAdmin decides whether the
 * client renders the M20 entry point (FR-23.2); the admin endpoints enforce it
 * regardless of what the client does with it.
 */
export interface MeResponse {
  user_id: string
  display_name: string
  is_instance_admin: boolean
}

/**
 * DirectoryUser is one entry of the instance user directory — name and id
 * only, which is what the M3 sharing step needs (FR-4.5).
 */
export interface DirectoryUser {
  user_id: string
  display_name: string
}

/**
 * UserListResponse is the directory envelope, ordered by name with
 * deactivated accounts excluded (FR-23.3).
 */
export interface UserListResponse {
  users: DirectoryUser[]
}

/**
 * AdminUser is one row of the FR-23.2 account overview. DeactivatedAt is null
 * for an active account rather than absent, because the client renders the two
 * states differently and an absent key would read as "unknown".
 */
export interface AdminUser {
  user_id: string
  display_name: string
  // Absent where the IdP provided none.
  email?: string
  created_at: string
  is_instance_admin: boolean
  deactivated_at: string | null
  trip_count: number
  template_count: number
}

/**
 * AdminUserListResponse is the overview envelope.
 */
export interface AdminUserListResponse {
  users: AdminUser[]
}

/**
 * NotificationEntry is one notification. It is not named Notification because
 * that is a DOM global on the client, and a generated type shadowing it would
 * be a trap rather than a contract.
 */
export interface NotificationEntry {
  id: string
  kind: string
  // The teaser the toast and the OS notification render; the deep link
  // carries the rest. Null where the stored payload was empty.
  payload: Record<string, unknown> | null
  created_at: string
  // Absent while unread.
  read_at?: string
}

/**
 * NotificationListResponse is the list envelope, newest first.
 */
export interface NotificationListResponse {
  notifications: NotificationEntry[]
}

/**
 * NotificationPrefs is the per-kind toggle set (UI-Spec M17). The server
 * answers all three keys always — a kind the stored value omits comes back
 * enabled — so none of them is optional on the wire.
 */
export interface NotificationPrefs {
  delegation: boolean
  mention: boolean
  task: boolean
  // FR-5.7: somebody took over a row this user had claimed.
  lock_taken: boolean
}

/**
 * VAPIDKeyResponse carries the instance's public VAPID key, generated on
 * first use and persisted beside the database.
 */
export interface VAPIDKeyResponse {
  key: string
}

/**
 * AuthConfigResponse tells the client where to send the user to log in. A
 * server without OIDC answers 501 `not_configured` instead, which is how
 * Single-User Mode is discovered (invariant 5).
 */
export interface AuthConfigResponse {
  authorize_url: string
  client_id: string
}

/**
 * InstanceConfigResponse carries what the client must know about the
 * instance before it renders anything, and nothing that identifies a
 * caller — it is answered without a session, in every mode.
 *
 * Currency is an ISO-4217 code, or empty where the operator named none:
 * amounts then stay unit-less, as they were before FR-21.9. It is a label,
 * never a conversion — the stored amount is already in this currency.
 */
export interface InstanceConfigResponse {
  currency: string
}

/**
 * SessionTokens is the first-party session pair the login broker issues.
 * ExpiresIn is the access token's lifetime in seconds.
 */
export interface SessionTokens {
  access_token: string
  refresh_token: string
  expires_in: number
}

/**
 * OKResponse is the body of an action that has nothing to report but its own
 * success. It is one type rather than a map at each call site, so the client
 * cannot be written against a key that is spelled differently in one handler.
 */
export interface OKResponse {
  ok: boolean
}

/**
 * TakeoverResponse is what a takeover answers. Like a revert it is an
 * ordinary change-log entry underneath (ADR-028), so the caller learns the
 * row's new state by pulling from the hint. PreviousHolder is what the
 * screen needs on the way back: the confirmation named the holder before
 * the fact, and the snackbar afterwards names whom it was taken from.
 */
export interface TakeoverResponse {
  ok: boolean
  previous_holder: string
  pull_hint: PullHint
}

/**
 * LockEvent is one recorded takeover. The item is named rather than only
 * referenced because the record has to stay readable after the row it names
 * is deleted — a line saying "took over 4f3a…" answers nothing.
 */
export interface LockEvent {
  id: string
  trip_item_id: string
  item_name: string
  from_user_id: string
  to_user_id: string
  created_at: string
}

/**
 * LockEventListResponse is a trip's takeover record, newest first.
 */
export interface LockEventListResponse {
  lock_events: LockEvent[]
}

/**
 * ErrorCode is the machine-readable half of an error. The client branches on
 * these values, so they are named once here and generated into the client
 * rather than spelled again as literals (CODING_PRINCIPLES §4a).
 */
export type ErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'internal'
  | 'not_configured'
  | 'account_deactivated'
  | 'admin_undeactivatable'
  | 'trip_not_found'
  | 'conflict_not_found'
  | 'notification_not_found'
  | 'already_reverted'
  | 'revert_refused'
  | 'row_deleted'
  | 'claim_not_held'
  | 'claim_is_own'
  | 'idp_error'
  | 'idp_unreachable'

export const ERROR_CODE = {
  validation: 'validation',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  not_found: 'not_found',
  internal: 'internal',
  not_configured: 'not_configured',
  account_deactivated: 'account_deactivated',
  admin_undeactivatable: 'admin_undeactivatable',
  trip_not_found: 'trip_not_found',
  conflict_not_found: 'conflict_not_found',
  notification_not_found: 'notification_not_found',
  already_reverted: 'already_reverted',
  revert_refused: 'revert_refused',
  row_deleted: 'row_deleted',
  claim_not_held: 'claim_not_held',
  claim_is_own: 'claim_is_own',
  idp_error: 'idp_error',
  idp_unreachable: 'idp_unreachable',
} as const

/**
 * APIErrorBody is the inner object of an error response.
 */
export interface APIErrorBody {
  code: ErrorCode
  message: string
  field?: string
}

/**
 * APIError is the one shape every non-2xx response has. No handler writes a
 * bare status: the client parses exactly this, in every mode.
 */
export interface APIError {
  error: APIErrorBody
}
