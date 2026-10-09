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
 * - **the write path** — a module queues its mutations through the same funnel
 *   as everything else (`writeFunnel.ts`), with this device's clock; the
 *   funnel reads the module's current rows back out of its sinks.
 */
import type { TrackUpload, Mutation, MutationOp } from '@/api/types'
import type { IdeaImage, IdeaTrack, TrackFields } from '@/types/domain'
import type { RowSinks } from './sinks'
import type { Write } from './writeFunnel'
import type { SyncTable } from '@/api/tables'
import type { MutationFields } from './mutations/context'

/**
 * One module's store, as the orchestrator reads and writes it: its sinks,
 * one per table it holds, each with its table's spec (`sinks.ts`, declared in
 * the module's `rows.ts`). Everything else the kernel needs is derived from
 * them — which tables the module holds, how a pulled change lands, the row
 * a write is painted over, and what a deleted trip or traveller takes from
 * the module (`cascade.ts`), including on another device, which hears of a
 * deleted trip by its tombstone alone.
 */
export interface FeatureStore {
  readonly sinks: RowSinks
}

/**
 * The write path a module is given. Deliberately narrow: a module writes rows
 * of its own tables into a trip's partition and nothing else, so it is not
 * handed the packing mutation factory or the stores.
 */
export interface ModuleHost {
  /** Builds a mutation stamped with this device's HLC; `fields` are held to the push whitelist. */
  mutation<T extends SyncTable>(
    op: MutationOp,
    table: T,
    id: string,
    fields?: MutationFields<T>,
  ): Mutation
  /** The device's clock as an ISO instant — the one the HLC reads, for a tap's time. */
  nowIso(): string
  /**
   * Paints the writes, queues them on their trip's feed and drains — the
   * kernel's funnel (`writeFunnel.ts`). A mutation alone is painted from its
   * op over the row the store holds now; a cascade passes its paint along.
   */
  write(...writes: Write[]): void
  /** The bytes of the planner's pictures, which no mutation carries (FR-29.5). */
  pictures: IdeaPictures
  /** The files of the planner's GPX tracks, which no mutation carries (FR-29.17). */
  tracks: TrackFiles
  /** A pasted link's page, read by the server (FR-29.16). */
  linkPreview: LinkPreviews
}

/** FR-29.16's reads, and whether this device can have one at all. */
export interface LinkPreviews {
  /**
   * False in Local Mode, and once the instance has said previews are off —
   * so a screen does not show a read that cannot happen.
   */
  offered(): boolean
  /** What the page says about itself, or null where it could not be read. */
  read(tripId: string, url: string): Promise<LinkPreview | null>
  /**
   * The picture a preview named, as the page serves it — read apart from the
   * words, which need not wait for it. Null where it could not be had.
   */
  picture(tripId: string, imageUrl: string): Promise<Blob | null>
}

/**
 * A page's own title and description, and where its picture is — each may be
 * missing — and the web links it carries, among which a reader finds a shared
 * connection behind a short link (FR-29.18).
 */
export interface LinkPreview {
  title: string | null
  description: string | null
  imageUrl: string | null
  links: string[]
}

/**
 * FR-29.5: an idea picture's bytes, outside the sync envelope (ADR-002). The
 * row that names a picture is created with its bytes — by the server's
 * upload, or on this device in Local Mode — so it is not a mutation; moving
 * or deleting one afterwards is, and goes through `write`.
 */
export interface IdeaPictures {
  /**
   * Scales the source down and stores it as `image`, whose hash is filled in
   * here. Resolves once the row is on this device; rejects when the upload
   * could not be made, and then nothing was written.
   */
  add(image: Omit<IdeaImage, 'image_hash'>, source: Blob): Promise<void>
  /** A displayable URL for the picture, or null while its bytes are not to be had. */
  url(image: IdeaImage): Promise<string | null>
  /** Drops the bytes of deleted pictures where this device holds them. */
  forget(imageIds: readonly string[]): Promise<void>
}

/** What an idea's new track is before its file is read: where it hangs and stands. */
export type IdeaTrackPlace = Pick<IdeaTrack, 'id' | 'trip_id' | 'idea_id' | 'position'>

/**
 * FR-29.17: a GPX track's file, outside the sync envelope (ADR-085) — of an
 * idea's track by default, or of what else carries tracks (`T`, placed by
 * `P`; FR-31.15's excursions). Like a picture, the row that names a track is
 * created with its file — by the server's upload, or on this device in Local
 * Mode — so neither adding nor replacing one is a mutation; renaming,
 * retiming or deleting one is, and goes through `write`.
 */
export interface TrackFiles<
  T extends TrackFields & { trip_id: string } = IdeaTrack,
  P = IdeaTrackPlace,
> {
  /**
   * Stores a new track from what the device read from its file. Resolves
   * once the row is on this device; rejects when the upload could not be
   * made, and then nothing was written.
   */
  add(place: P, upload: TrackUpload): Promise<void>
  /**
   * Puts another file under a track. What the travellers set — the name,
   * the kind, *Mit Kind*, the pauses — stays. Rejects like `add`.
   */
  replace(track: T, upload: TrackUpload): Promise<void>
  /** The file as it was uploaded, or null while it is not to be had. */
  file(track: T): Promise<Blob | null>
  /** Drops the files of deleted tracks where this device holds them. */
  forget(trackIds: readonly string[]): Promise<void>
}
