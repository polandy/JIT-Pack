/** What every area of {@link createMutations} is built over. */

import type { Mutation, MutationOp } from '@/api/types'
import type { PushableColumnOf, SyncTable } from '@/api/tables'
import type { NowIso } from '@/lib/clock'

/**
 * What the client writes into an actor column it is not allowed to decide.
 * The server stamps those columns itself — `comments.author_id` and
 * `packing_now_by` among them (`serverOwned`, invariant 3) — so the placeholder
 * never reaches a foreign key in Server or Single-User Mode; in Local Mode
 * there is exactly one author and no directory to name.
 */
export const CLIENT_ACTOR_PLACEHOLDER = 'current-user'

/**
 * What a mutation may carry for `T`: the columns the server's push whitelist
 * accepts, generated from it (`PUSHABLE_COLUMNS`, ARCH-11). A key outside it
 * is refused by the server and parks the write, so it is a compile error here.
 */
export type MutationFields<T extends SyncTable> = { [C in PushableColumnOf<T>]?: unknown }

/** The raw builder: one mutation with a fresh id and the next HLC. */
export type MakeMutation = <T extends SyncTable>(
  op: MutationOp,
  table: T,
  id: string,
  fields?: MutationFields<T>,
) => Mutation

/** The shared state an area's factory closes over. */
export interface MutationContext {
  make: MakeMutation
  nowIso: NowIso
}
