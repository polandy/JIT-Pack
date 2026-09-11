/**
 * The shared spine every extracted action group receives, so a group can be
 * imported, read and tested without constructing the whole orchestrator
 * (R-4). `useSyncOrchestrator` stays the single public facade: it builds one
 * context and spreads each group's actions into its own return shape.
 *
 * The context grows as groups move out — a field is added when a group that
 * needs it arrives, never before.
 */
import type { Mutation, PullChange } from '@/api/types'
import type { createMutations } from '@/sync/mutations'
import type { NameGuards } from './names'
import type { IndexedDBPersistence } from '@/local/persistence'
import type { NowIso } from '@/lib/clock'
import type { CascadeRow } from '@/sync/cascade'
import type {
  Container,
  DestinationProfile,
  GeneratedPosition,
  ItemDependency,
  ItemTodo,
  CategorisedMasterItem,
  MasterItem,
  Tag,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  Traveler,
  Trip,
  TripItem,
  TripMember,
  TripSeries,
  TripTemplateSource,
} from '@/types/domain'

/**
 * What the action groups read off the trip store — and nothing else.
 *
 * Declared here, at the consumer, rather than as `ReturnType<typeof
 * useTripStore>`: a group that reads four getters had to be handed the whole
 * store, so the only thing that could stand in for it was the store itself,
 * and every seam spec began by starting pinia. The pinia store satisfies this
 * structurally, so the production wiring is unchanged and a fake is now a
 * plausible object literal.
 *
 * The rule for growing it is the context's own: a member is added when a
 * group that reads it arrives, never before — an interface that lists
 * everything the store has is the store type again, under a new name.
 */
export interface TripReads {
  readonly tripList: Trip[]
  getTrip(id: string): Trip | undefined
  getItems(tripId: string): TripItem[]
  getTravelers(tripId: string): Traveler[]
  /** The trip's synced membership roster (FR-4.5) — who linked_user_id may name (FR-2.5, ADR-058). */
  getMembers(tripId: string): TripMember[]
  getContainers(tripId: string): Container[]
  getTodos(tripId: string): ItemTodo[]
  getTemplateSources(tripId: string): TripTemplateSource[]
  getGeneratedPositions(tripId: string): GeneratedPosition[]
  /** The three `cascade.ts` asks for, since a group hands it this store. */
  childRows(tripId: string): CascadeRow[]
  itemChildRows(tripItemId: string): CascadeRow[]
  templateSourceRows(templateId: string): CascadeRow[]
}

/** What the action groups read off the master store — and nothing else. */
export interface MasterReads {
  readonly tagList: Tag[]
  readonly itemList: MasterItem[]
  /** The same rows carrying their FR-24.2 grouping key — what anything that
   * generates trip items reads (`CategorisedMasterItem`). */
  readonly categorisedItemList: CategorisedMasterItem[]
  readonly activeItemList: MasterItem[]
  readonly templateList: Template[]
  readonly activeTemplateList: Template[]
  readonly includeList: TemplateInclude[]
  readonly dependencyList: ItemDependency[]
  readonly templateItemTaskList: TemplateItemTask[]
  readonly seriesList: TripSeries[]
  getItem(id: string): MasterItem | undefined
  getItemTags(itemId: string): Tag[]
  getTemplate(id: string): Template | undefined
  getTemplateItems(templateId: string): TemplateItem[]
  getDestinationProfile(seriesId: string): DestinationProfile | undefined
  /** `cascade.ts`'s, for the same reason as `TripReads.childRows`. */
  childRows(table: string, id: string): CascadeRow[]
}

/**
 * One queued write: the mutation itself plus the rows it optimistically
 * paints.
 *
 * Usually one row, and a delete that cascades is why it may be several. The
 * server derives a trip's child tombstones from the schema and sends them
 * with the one delete it was given (`internal/store/master.go`,
 * `cascadeChildren`); a client that must mirror that cascade has the same
 * shape to express — one mutation, several changes — and expressing it as
 * several *mutations* would push deletes the server never asked for.
 */
export interface QueuedMutation {
  mutation: Mutation
  optimistic?: PullChange | PullChange[]
}

/**
 * enqueueAndDrain applies the optimistic changes, queues the mutations for
 * the named partition and kicks a drain. Several mutations passed in one call
 * stay one batch in the queue.
 */
export type EnqueueAndDrain = (
  type: 'trip' | 'master',
  id: string | null,
  ...muts: QueuedMutation[]
) => void

/**
 * enqueue applies the optimistic changes and queues the mutations for the
 * named partition, without pushing. It is what a cascade writing across both
 * partitions uses — every row through the funnel, one push at the end.
 */
export type Enqueue = (
  type: 'trip' | 'master',
  id: string | null,
  ...muts: QueuedMutation[]
) => void

/**
 * drainPartitions pushes what a cascade queued: the master partition first,
 * then the named trips in order — the order the server's foreign keys
 * dictate. Fire-and-forget, and inert in Local Mode.
 */
export type DrainPartitions = (tripIds: string[]) => void

export interface SyncContext {
  tripStore: TripReads
  masterStore: MasterReads
  mutations: ReturnType<typeof createMutations>
  enqueueAndDrain: EnqueueAndDrain
  enqueue: Enqueue
  drainPartitions: DrainPartitions
  names: NameGuards
  /**
   * The device's own store in Local Mode, null wherever a server answers.
   * A group reads it to know whether what this device holds is the whole
   * picture — FR-24.3's reference count is exact only where it is (ADR-032).
   */
  local: IndexedDBPersistence | null
  /**
   * Today, as the device reckons it. Injected rather than read from the
   * clock so a group that decides by date — FR-27.4 only offers a group's
   * changes to a trip that has not started — is testable without one.
   */
  today: () => string
  /**
   * The moment a row is stamped with, as an ISO string. The same clock
   * `today` and the HLC read, so a retired row's `retired_at` and the HLC
   * that carries it cannot disagree about when the delete happened.
   */
  nowIso: NowIso
  /**
   * Whether this trip's own rows are on the device. The guard that keeps a
   * group from reading "not pulled yet" as "empty trip" (ADR-016), which is
   * the one way a refresh could duplicate the list it exists to keep right.
   */
  tripDataLoaded: (tripId: string) => boolean
  /**
   * Every trip row this device holds, across every trip — what FR-24.3's
   * reference count is taken over.
   *
   * A context read rather than each group's own walk of the trip store, so
   * the master group asks *what this device knows* without also knowing how
   * a trip's rows are stored. Complete in Local Mode only: Server Mode pulls
   * a trip partition as the trip is opened (ADR-032), which is what `local`
   * above lets a caller weigh.
   */
  knownTripItems: () => TripItem[]
}

/**
 * The walk `SyncContext.knownTripItems` is built from, written once so the
 * orchestrator and the seam double a spec binds a group to cannot disagree
 * about what "every row this device holds" enumerates.
 */
export function knownTripItemsOf(tripStore: TripReads): TripItem[] {
  return tripStore.tripList.flatMap((trip) => tripStore.getItems(trip.id))
}
