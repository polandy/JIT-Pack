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
 * WSEventType is the kind of a WebSocket frame.
 */
export type WSEventType =
  | 'trip.changed'
  | 'master.changed'
  | 'item.locked'
  | 'item.unlocked'
  | 'presence'
  | 'notification.created'

export const WS_EVENT_TYPE = {
  'trip.changed': 'trip.changed',
  'master.changed': 'master.changed',
  'item.locked': 'item.locked',
  'item.unlocked': 'item.unlocked',
  presence: 'presence',
  'notification.created': 'notification.created',
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
