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
 * carrying it is `outcome`, never `status`: a client reading `status`, which
 * no response contains, sees every rejection as undefined and drops it
 * instead of parking it.
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
 * MasterPruneResponse answers FR-5.8's conditional delete of an inventory
 * item (ADR-065).
 *
 * Pruned is false both when something still uses the item and when it was
 * already gone: in either case there is nothing for the caller to do, and
 * the device that asked learns nothing it could act on from the difference.
 */
export interface MasterPruneResponse {
  pruned: boolean
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
  | 'roster'
  | 'notification.created'
  | 'location'
  | 'pong'

export const WS_EVENT_TYPE = {
  'trip.changed': 'trip.changed',
  'master.changed': 'master.changed',
  'item.locked': 'item.locked',
  'item.unlocked': 'item.unlocked',
  presence: 'presence',
  roster: 'roster',
  'notification.created': 'notification.created',
  location: 'location',
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
 * RosterMember is one entry of an EventRoster frame (FR-4.9): a person other
 * than the receiver, and the trips they have open in the packing list right now
 * that the receiver is a member of too. A person with no such trip is not
 * listed at all, which is how the roster keeps to what the receiver may know.
 */
export interface RosterMember {
  user_id: string
  trip_ids: string[]
}

/**
 * LiveLocation is the payload of an EventLocation frame (FR-29.19): where a
 * traveller is, as their device said and the server stamped — UserID and At
 * are the server's, never the client's. Gone ends it, and then carries only
 * the trip and the person. Nothing of it is stored (ADR-087).
 */
export interface LiveLocation {
  trip_id: string
  user_id: string
  lat: number
  lon: number
  accuracy_m: number
  // At is when the server received the fix, RFC3339; empty when Gone.
  at: string
  gone: boolean
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
  // FR-7.9: a co-traveller wrote a new trip note.
  note: boolean
  // FR-7.13: somebody else replied in a thread this user took part in.
  note_reply: boolean
  // FR-7.11: a task this user is to do is due tomorrow or today.
  task_due: boolean
  // FR-30.10: a shopping entry of one of this user's trips is due
  // tomorrow or today.
  shopping_due: boolean
  // FR-31.9: an excursion of one of this user's trips starts tomorrow or
  // today and still has things to pack.
  excursion_due: boolean
  // FR-29.8: a co-traveller put up a new idea.
  idea: boolean
  // FR-29.8: somebody else wrote about an idea this user wrote or wrote
  // about.
  idea_comment: boolean
  // FR-29.8: a co-traveller moved an idea to the shortlist.
  idea_shortlisted: boolean
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
 *
 * MapTiles says whether a device draws a map's background tiles, fetched
 * from swisstopo and OpenStreetMap by the device itself (FR-29.17,
 * ADR-085). False draws a track's line alone, as a device offline does.
 *
 * Timetable says whether a device offers the connection search (FR-29.18,
 * ADR-086), which it asks transport.opendata.ch itself. False leaves the
 * link and the hand fields.
 *
 * RoutingURL is the BRouter a device asks for the path between two points
 * of a route it edits (FR-29.20, ADR-088), asked by the device itself.
 * Empty where the operator turned routing off: the points are then joined
 * by straight lines.
 */
export interface InstanceConfigResponse {
  currency: string
  map_tiles: boolean
  timetable: boolean
  routing_url: string
}

/**
 * LinkPreviewRequest names the page — or, for the picture route, the
 * picture — to be read.
 */
export interface LinkPreviewRequest {
  url: string
}

/**
 * LinkPreviewResponse is what the page says about itself. Every field may
 * be empty. The picture is only named: its bytes are the picture route's,
 * so the words need not wait for them. Links are the page's web links, in
 * its order, for a client that looks for one among them — a shared
 * connection behind a short link (FR-29.18); never null.
 */
export interface LinkPreviewResponse {
  title: string
  description: string
  image_url: string
  links: string[]
}

/**
 * LinkPreviewImageResponse is a page's picture as it was served — base64 of
 * its bytes with their type — for the client to scale like any picture.
 */
export interface LinkPreviewImageResponse {
  image: string
  image_type: string
}

/**
 * TrackKind is what a track is walked or ridden as — a closed vocabulary,
 * held by the idea_tracks and excursion_tracks CHECKs too.
 */
export type TrackKind = 'hike' | 'bike'

export const TRACK_KIND = {
  hike: 'hike',
  bike: 'bike',
} as const

/**
 * TrackUpload is one GPX file for an idea or an excursion, and what the
 * device that chose it read from it (ADR-085): the server stores the file as it is and the rest as the
 * track's row, and reads neither. The heights are null for a file without
 * any; Line is the track thinned to at most 800 points, as a polyline string
 * of precision 5. Replacing a track sends the same shape under its id; the
 * name and the kind are then kept as the travellers set them.
 */
export interface TrackUpload {
  name: string
  file_name: string
  kind: TrackKind
  distance_m: number
  ascent_m: number | null
  descent_m: number | null
  max_ele_m: number | null
  point_count: number
  line: string
  gpx: string
}

/**
 * UpdateState is what M17's About block says about this build. It is a
 * closed vocabulary rather than a pair of booleans because the four cases
 * are mutually exclusive, and a client rendering them by name cannot invent
 * a fifth from a combination that never occurs.
 */
export type UpdateState = 'off' | 'current' | 'available' | 'unreachable'

export const UPDATE_STATE = {
  off: 'off',
  current: 'current',
  available: 'available',
  unreachable: 'unreachable',
} as const

/**
 * InstanceUpdateResponse says whether the instance is behind its upstream
 * releases (FR-23.8). Like InstanceConfigResponse beside it, it is answered
 * without a session and identifies no caller.
 *
 * This is not NFR-4.13's waiting build: that one is client assets this
 * instance already serves, which a device applies itself (FR-19.7). This
 * one can only be acted on by whoever runs the instance.
 */
export interface InstanceUpdateResponse {
  state: UpdateState
  // Current is the version this server binary was built as.
  current: string
  // Latest is the newest release tag upstream reported, as it is
  // written there ("v0.10.0"). Empty until one answer has arrived.
  latest: string
  // ReleaseURL is that release's page — the answer to the question a
  // newer version always raises, which is what changed.
  release_url: string
  // CheckedAt is when the answer this response is built from arrived,
  // RFC 3339. Empty where none ever has.
  checked_at: string
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
  | 'payload_too_large'
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
  | 'link_unreadable'

export const ERROR_CODE = {
  validation: 'validation',
  payload_too_large: 'payload_too_large',
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
  link_unreadable: 'link_unreadable',
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

/**
 * ActivityOp is what a recorded write did to its row.
 */
export type ActivityOp = 'insert' | 'update' | 'delete'

export const ACTIVITY_OP = {
  insert: 'insert',
  update: 'update',
  delete: 'delete',
} as const

/**
 * ActivityEntry is one recorded change: who changed which row, when, and
 * what each field was before and after. Label and Subject are the row's
 * name and the name of what it belongs to, as they were at the time, so an
 * entry stays readable after its row is gone. What the change means is the
 * client's to say (invariant 4).
 */
export interface ActivityEntry {
  id: number
  entity_table: string
  entity_id: string
  op: ActivityOp
  label: string
  subject?: string
  // Changes maps each changed field to its [before, after] pair; an
  // insert's before is null, a delete's after is null and it names every
  // field the row held.
  changes: Record<string, unknown[]> | null
  actor_user_id: string
  created_at: string
}

/**
 * ActivityListResponse is one page of a log, newest first. Before is the
 * cursor that reads the next older page, and 0 once the page reached the
 * log's beginning.
 */
export interface ActivityListResponse {
  entries: ActivityEntry[]
  before: number
}
