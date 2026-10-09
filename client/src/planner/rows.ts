/**
 * The planner's rows on the wire (§3.29, ADR-066 amendment 2): how each is
 * read from a pulled row and rebuilt for an optimistic one, and what its
 * delete follows. The store hands these specs to the kernel on its sinks, so
 * no kernel file names the tables' codecs. A picture's and a track's codec
 * are the kernel's, which serves their files (ADR-002, ADR-085).
 */
import { TABLE } from '@/api/tables'
import { dbBool, jsonColumn, parseJsonColumn } from '@/sync/columns'
import { ideaImageRow, ideaTrackRow } from '@/sync/rows'
import {
  alsoWith,
  goesWith,
  MODULE_ROWS,
  rowToIdeaImage,
  rowToIdeaTrack,
  type RowSpecs,
} from '@/sync/tableRegistry'
import {
  DAY_ENTRY_CONNECTION,
  DAY_ENTRY_NOTE,
  IDEA_STATE_IDEA,
  toIdeaTag,
  type ConnectionLeg,
  type DayEntry,
  type DayEntryTraveler,
  type ExcursionRole,
  type Idea,
  type IdeaComment,
  type IdeaVote,
} from './types'

function rowToIdea(id: string, row: Record<string, unknown>): Idea {
  return {
    id,
    trip_id: row['trip_id'] as string,
    author_id: row['author_id'] as string,
    title: row['title'] as string,
    note: (row['note'] as string) ?? null,
    link: (row['link'] as string) ?? null,
    tag: toIdeaTag(row['tag']),
    rain_proof: Boolean(row['rain_proof']),
    state: (row['state'] as Idea['state']) ?? IDEA_STATE_IDEA,
    created_at: (row['created_at'] as string) ?? null,
    planned_on: (row['planned_on'] as string) ?? null,
    planned_at: (row['planned_at'] as string) ?? null,
  }
}

function rowToDayEntry(id: string, row: Record<string, unknown>): DayEntry {
  return {
    id,
    trip_id: row['trip_id'] as string,
    author_id: row['author_id'] as string,
    kind: row['kind'] === DAY_ENTRY_CONNECTION ? DAY_ENTRY_CONNECTION : DAY_ENTRY_NOTE,
    on_date: row['on_date'] as string,
    at_time: (row['at_time'] as string) ?? null,
    title: row['title'] as string,
    note: (row['note'] as string) ?? null,
    link: (row['link'] as string) ?? null,
    legs: parseLegs(row['legs']),
    excursion_id: (row['excursion_id'] as string) ?? null,
    excursion_role: (row['excursion_role'] as ExcursionRole | null) ?? null,
  }
}

/**
 * FR-29.18: a connection's legs from their JSON column. Anything that is not
 * a list of legs reads as none, so a malformed row is an entry without legs
 * rather than a screen that cannot render.
 */
function parseLegs(raw: unknown): ConnectionLeg[] | null {
  const parsed = parseJsonColumn<unknown>(raw, null)
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isLeg)) return null
  return parsed
}

function isLeg(value: unknown): value is ConnectionLeg {
  if (typeof value !== 'object' || value === null) return false
  const leg = value as Record<string, unknown>
  return (['from', 'to', 'dep', 'arr', 'line'] as const).every(
    (key) => typeof leg[key] === 'string',
  )
}

function rowToIdeaVote(id: string, row: Record<string, unknown>): IdeaVote {
  return {
    id,
    trip_id: row['trip_id'] as string,
    idea_id: row['idea_id'] as string,
    user_id: row['user_id'] as string,
    vote: (row['vote'] as IdeaVote['vote']) ?? null,
  }
}

function rowToIdeaComment(id: string, row: Record<string, unknown>): IdeaComment {
  return {
    id,
    trip_id: row['trip_id'] as string,
    idea_id: row['idea_id'] as string,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    created_at: (row['created_at'] as string) ?? null,
    edited_at: (row['edited_at'] as string) ?? null,
  }
}

function rowToDayEntryTraveler(id: string, row: Record<string, unknown>): DayEntryTraveler {
  return {
    id,
    trip_id: row['trip_id'] as string,
    day_entry_id: row['day_entry_id'] as string,
    traveler_id: row['traveler_id'] as string,
  }
}

/** FR-29.1: an idea. */
export function ideaRow(idea: Idea): Record<string, unknown> {
  return {
    trip_id: idea.trip_id,
    author_id: idea.author_id,
    title: idea.title,
    note: idea.note,
    link: idea.link,
    tag: idea.tag,
    rain_proof: dbBool(idea.rain_proof),
    state: idea.state,
    created_at: idea.created_at,
    planned_on: idea.planned_on,
    planned_at: idea.planned_at,
  }
}

/** FR-29.15: an entry of the day plan's own. */
export function dayEntryRow(entry: DayEntry): Record<string, unknown> {
  return {
    trip_id: entry.trip_id,
    author_id: entry.author_id,
    kind: entry.kind,
    on_date: entry.on_date,
    at_time: entry.at_time,
    title: entry.title,
    note: entry.note,
    link: entry.link,
    legs: jsonColumn(entry.legs),
    excursion_id: entry.excursion_id ?? null,
    excursion_role: entry.excursion_role ?? null,
  }
}

/** FR-29.15: one traveller a day-plan entry is for. */
export function dayEntryTravelerRow(row: DayEntryTraveler): Record<string, unknown> {
  return {
    trip_id: row.trip_id,
    day_entry_id: row.day_entry_id,
    traveler_id: row.traveler_id,
  }
}

/** FR-29.3: one person's vote on one idea. */
export function ideaVoteRow(vote: IdeaVote): Record<string, unknown> {
  return {
    trip_id: vote.trip_id,
    idea_id: vote.idea_id,
    user_id: vote.user_id,
    vote: vote.vote,
  }
}

/** FR-29.4: one entry of an idea's discussion. */
export function ideaCommentRow(comment: IdeaComment): Record<string, unknown> {
  return {
    trip_id: comment.trip_id,
    idea_id: comment.idea_id,
    author_id: comment.author_id,
    body: comment.body,
    created_at: comment.created_at,
    edited_at: comment.edited_at,
  }
}

/** The module's tables, specified — the sinks of `store.ts` carry them. */
export const PLANNER_ROWS = {
  [TABLE.ideas]: { ...MODULE_ROWS, parse: rowToIdea, encode: ideaRow },
  [TABLE.ideaVotes]: {
    ...MODULE_ROWS,
    parse: rowToIdeaVote,
    encode: ideaVoteRow,
    cascadeParents: alsoWith(goesWith('idea_id', TABLE.ideas)),
  },
  [TABLE.ideaComments]: {
    ...MODULE_ROWS,
    parse: rowToIdeaComment,
    encode: ideaCommentRow,
    cascadeParents: alsoWith(goesWith('idea_id', TABLE.ideas)),
  },
  [TABLE.ideaImages]: {
    ...MODULE_ROWS,
    parse: rowToIdeaImage,
    encode: ideaImageRow,
    cascadeParents: alsoWith(goesWith('idea_id', TABLE.ideas)),
  },
  [TABLE.ideaTracks]: {
    ...MODULE_ROWS,
    parse: rowToIdeaTrack,
    encode: ideaTrackRow,
    cascadeParents: alsoWith(goesWith('idea_id', TABLE.ideas)),
  },
  [TABLE.dayEntries]: { ...MODULE_ROWS, parse: rowToDayEntry, encode: dayEntryRow },
  [TABLE.dayEntryTravelers]: {
    ...MODULE_ROWS,
    parse: rowToDayEntryTraveler,
    encode: dayEntryTravelerRow,
    // FR-29.15: a traveller taken off the trip is off the day plan's entries.
    cascadeParents: alsoWith(
      goesWith('day_entry_id', TABLE.dayEntries),
      goesWith('traveler_id', TABLE.travelers),
    ),
  },
} satisfies RowSpecs
