/** What every area of {@link createMutations} is built over. */

import type { Mutation, MutationOp } from '@/api/types'
import type { NowIso } from '@/lib/clock'

/**
 * What the client writes into an actor column it is not allowed to decide.
 * The server stamps those columns itself — `comments.author_id` and
 * `packing_now_by` among them (`stampActor`, invariant 3) — so the placeholder
 * never reaches a foreign key in Server or Single-User Mode; in Local Mode
 * there is exactly one author and no directory to name.
 */
export const CLIENT_ACTOR_PLACEHOLDER = 'current-user'

/** The raw builder: one mutation with a fresh id and the next HLC. */
export type MakeMutation = (
  op: MutationOp,
  table: string,
  id: string,
  fields?: Record<string, unknown>,
) => Mutation

/** The shared state an area's factory closes over. */
export interface MutationContext {
  make: MakeMutation
  nowIso: NowIso
}
