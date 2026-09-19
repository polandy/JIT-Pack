/**
 * What a feature module hands the sync layer (FR-30.3, ADR-066).
 *
 * A feature module — `client/src/shopping/` first, the planner of §3.29 next —
 * owns its store, its actions and its screens, and neither it nor the packing
 * code imports the other (`scripts/module-boundary-gate.mjs`). The sync layer
 * still has to reach the module's rows in three places, and it does so through
 * these two shapes, which the composition root (`App.vue`) fills in:
 *
 * - **the pull funnel** routes a pulled row to the store that holds its table;
 * - **the trip cascade** — a deleted trip takes the module's rows with it, and
 *   the server announces none of them, because the trip partition's feed dies
 *   with the trip (`cascade.ts`);
 * - **the write path** — a module queues its mutations through the same outbox
 *   as everything else, with this device's clock.
 */
import type { Mutation, MutationOp, PullChange } from '@/api/types'
import type { CascadeRow } from './cascade'

/** One module's store, as the orchestrator reads and writes it. */
export interface FeatureStore {
  /** The tables this store holds — a subset of `FEATURE_STORE_TABLES`. */
  readonly tables: ReadonlySet<string>
  /** Applies pulled or optimistic changes to the module's rows. */
  applyChanges(changes: PullChange[]): void
  /** The module's rows that go with a deleted trip, leaf-first. */
  tripChildRows(tripId: string): CascadeRow[]
  /**
   * Drops everything the module holds for a trip. Called when a trip's own
   * tombstone arrives — the only news of the delete another device gets.
   */
  forgetTrip(tripId: string): void
}

/** Queues mutations on one partition and applies their optimistic rows. */
export interface QueuedModuleMutation {
  mutation: Mutation
  optimistic?: PullChange | PullChange[]
}

/**
 * The write path a module is given. Deliberately narrow: a module writes rows
 * of its own tables into a trip's partition and nothing else, so it is not
 * handed the packing mutation factory or the stores.
 */
export interface ModuleHost {
  /** Builds a mutation stamped with this device's HLC. */
  mutation(op: MutationOp, table: string, id: string, fields?: Record<string, unknown>): Mutation
  /** Queues the writes for the trip's partition, paints them, and drains. */
  writeTrip(tripId: string, ...muts: QueuedModuleMutation[]): void
}
