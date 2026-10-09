/**
 * The planner's rows as the client holds them (§3.29, ADR-078) — vocabulary
 * of the module's own, beside its catalogue, so its domain rules and its store
 * read them without a kernel file naming them. A picture's and a track's rows
 * stay in `types/domain.ts`: the kernel serves their files (ADR-002, ADR-085).
 */
import { COLUMN_ENUMS, type ColumnEnum } from '@/api/tables'

/**
 * FR-29.2: where an idea stands, set by hand — never by its votes. The order
 * is the board's segments'.
 */
export const IDEA_STATES = COLUMN_ENUMS.ideas.state
export type IdeaState = (typeof IDEA_STATES)[number]
export const IDEA_STATE_IDEA = 'idea' as const satisfies IdeaState
export const IDEA_STATE_SHORTLISTED = 'shortlisted' as const satisfies IdeaState
export const IDEA_STATE_DONE = 'done' as const satisfies IdeaState
export const IDEA_STATE_DROPPED = 'dropped' as const satisfies IdeaState

/**
 * FR-29.10: the closed set of tags an idea may carry, as stable keys —
 * labelled by the catalogue, held by schema.sql's CHECK.
 */
export const IDEA_TAGS = COLUMN_ENUMS.ideas.tag
export type IdeaTag = (typeof IDEA_TAGS)[number]

/** toIdeaTag narrows a wire value; anything outside the set is no tag. */
export function toIdeaTag(value: unknown): IdeaTag | null {
  return IDEA_TAGS.includes(value as IdeaTag) ? (value as IdeaTag) : null
}

/** FR-29.3: one person's vote — 👍 or 👎; a withdrawn vote is null. */
export type IdeaVoteValue = ColumnEnum<'idea_votes', 'vote'>
export const IDEA_VOTE_UP = 'up' as const satisfies IdeaVoteValue
export const IDEA_VOTE_DOWN = 'down' as const satisfies IdeaVoteValue

/** FR-29.1: something the travellers might do on the trip. */
export interface Idea {
  id: string
  trip_id: string
  /** Stamped by the server on the insert (invariant 3). */
  author_id: string
  title: string
  note: string | null
  /** http(s) only — client and server both refuse anything else. */
  link: string | null
  tag: IdeaTag | null
  /** FR-29.12: „Geht auch bei Regen". */
  rain_proof: boolean
  state: IdeaState
  /** When it was written — the client names it, like a comment's. */
  created_at: string | null
  /**
   * FR-29.14: the day it is planned on, `YYYY-MM-DD`, and when on it, `HH:MM`;
   * null for none. A time without a day reads as no time.
   */
  planned_on: string | null
  planned_at: string | null
}

/** FR-29.15/29.18: a day entry is a free one or a journey by public transport. */
export const DAY_ENTRY_KINDS = COLUMN_ENUMS.day_entries.kind
export type DayEntryKind = (typeof DAY_ENTRY_KINDS)[number]
export const DAY_ENTRY_NOTE = 'note' as const satisfies DayEntryKind
export const DAY_ENTRY_CONNECTION = 'connection' as const satisfies DayEntryKind

/** FR-29.18: what a ridden leg travels by, as its map draws it; a walk has none. */
export const LEG_MODES = ['train', 'bus', 'boat'] as const
export type LegMode = (typeof LEG_MODES)[number]
export const LEG_MODE_TRAIN = 'train' as const satisfies LegMode
export const LEG_MODE_BUS = 'bus' as const satisfies LegMode
export const LEG_MODE_BOAT = 'boat' as const satisfies LegMode

/** A place on the map, `[lat, lon]`. */
export type LatLon = [number, number]

/**
 * FR-29.18: one leg of a connection. Times are local `YYYY-MM-DDTHH:MM`, so a
 * night train arrives on its own day; a walk has an empty line. Where the
 * timetable search or a link knew them, the leg also says what it travels by
 * and where its stops lie — the stops passed on the way included — so the
 * connection can be drawn; a leg entered by hand has none of them.
 */
export interface ConnectionLeg {
  from: string
  to: string
  dep: string
  arr: string
  line: string
  mode?: LegMode
  fromAt?: LatLon
  toAt?: LatLon
  /** The stops passed between the two ends, in order. */
  via?: LatLon[]
}

/**
 * FR-29.15: an entry of the day plan's own — what stands on a day that is
 * neither an idea, an excursion nor a task (a table booking) — and the
 * connection it may carry (FR-29.18): an entry is a connection while it has
 * legs, and its `kind` follows them.
 */
/**
 * FR-29.15: one traveller a day-plan entry is for. No rows for an entry means
 * every traveller of the trip.
 */
export interface DayEntryTraveler {
  id: string
  trip_id: string
  day_entry_id: string
  traveler_id: string
}

export interface DayEntry {
  id: string
  trip_id: string
  /** Stamped by the server on the insert (invariant 3). */
  author_id: string
  kind: DayEntryKind
  /** `YYYY-MM-DD`. */
  on_date: string
  /** `HH:MM`, or null for a day without a time; given a connection and no time, its first departure. */
  at_time: string | null
  title: string
  note: string | null
  /** The provider's address a connection was read from, kept for its app; null for none. */
  link: string | null
  /** The legs of the connection it carries, in order; null for none. */
  legs: ConnectionLeg[] | null
  /** The excursion a connection belongs to (FR-29.18), or null/absent for none. */
  excursion_id?: string | null
  /** Which way it is on that excursion — there or back (FR-29.18); null for neither. */
  excursion_role?: ExcursionRole | null
}

/** FR-29.18: a connection of an excursion is its way there or its way back. */
export const EXCURSION_ROLES = COLUMN_ENUMS.day_entries.excursion_role
export type ExcursionRole = (typeof EXCURSION_ROLES)[number]
export const EXCURSION_ROLE_OUT = 'out' as const satisfies ExcursionRole
export const EXCURSION_ROLE_BACK = 'back' as const satisfies ExcursionRole

/**
 * FR-29.3: one person's vote on one idea, a row per (idea, person) so two
 * people voting at once both count (ADR-073's reason for note acks).
 */
export interface IdeaVote {
  id: string
  trip_id: string
  idea_id: string
  /** Stamped by the server on the insert. */
  user_id: string
  vote: IdeaVoteValue | null
}

/** FR-29.4: one entry of an idea's discussion. */
export interface IdeaComment {
  id: string
  trip_id: string
  idea_id: string
  /** Stamped by the server on the insert. */
  author_id: string
  body: string
  created_at: string | null
  /** When its words were last changed — the client's clock; null is never edited. */
  edited_at: string | null
}
