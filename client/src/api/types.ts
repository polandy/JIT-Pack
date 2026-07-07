/** Wire types matching Sync-API Spec v1.3 */

import type { HLC } from '@/sync/hlc'

// --- Pull (§4) ---

export interface PullChange {
  seq: number
  table: string
  id: string
  deleted: boolean
  row: Record<string, unknown> | null
}

export interface PullResponse {
  changes: PullChange[]
  next_cursor: number
  has_more: boolean
}

// --- Push (§5) ---

export type MutationOp = 'upsert' | 'insert' | 'delete'

export interface Mutation {
  mutation_id: string
  op: MutationOp
  table: string
  id: string
  fields?: Record<string, unknown>
  hlc: HLC
}

export interface PushRequest {
  client_hlc: HLC
  mutations: Mutation[]
}

export type MutationStatus = 'applied' | 'merged' | 'duplicate' | 'rejected'

export interface MutationConflict {
  field: string
  losing_value: unknown
  winning_value: unknown
}

export interface MutationResult {
  mutation_id: string
  status: MutationStatus
  conflicts?: MutationConflict[]
  error?: string
}

export interface PushResponse {
  results: MutationResult[]
  pull_hint: { next_cursor: number }
}

// --- WebSocket (§7) ---

export type WSEventType =
  | 'trip.changed'
  | 'master.changed'
  | 'item.locked'
  | 'item.unlocked'
  | 'presence'
  | 'notification.created'

export interface WSEvent {
  type: WSEventType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
}

// --- Error (§9) ---

export interface APIError {
  error: {
    code: string
    message: string
    field?: string
  }
}
