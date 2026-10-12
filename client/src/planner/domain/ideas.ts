/**
 * The idea board's rules (§3.29, FR-29.1–29.6, FR-29.10, FR-29.12) — pure,
 * so Local Mode keeps every one and a spec needs no component to reach them.
 *
 * The board reads three row sets of one trip: the ideas, the votes on them
 * (a row per idea and person, FR-29.3) and their discussion (FR-29.4). What
 * it shows is derived here — the segment an idea stands in, its tallies,
 * the order, the filters — and nothing of it is stored.
 */
import type { Idea, IdeaComment, IdeaState, IdeaTag, IdeaVote, IdeaVoteValue } from '../types'
import {
  IDEA_STATE_DONE,
  IDEA_STATE_DROPPED,
  IDEA_STATE_IDEA,
  IDEA_STATE_SHORTLISTED,
  IDEA_STATES,
  IDEA_TAGS,
  IDEA_VOTE_DOWN,
  IDEA_VOTE_UP,
} from '../types'

// --- the link (FR-29.1) ---

/** The schemes a link may carry — it is rendered as an href. */
const LINK_SCHEMES = ['http:', 'https:'] as const

/** A scheme as the URL parser reads one: letters, then a colon. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** What a typed link turned into: the value to store, or a refusal. */
export type LinkInput = { ok: true; link: string | null } | { ok: false }

/**
 * A link as it is stored. Blank is no link. A bare address (`gorropu.info`)
 * is what people paste from a conversation, so it is read as https; any
 * scheme but http(s) is refused rather than rewritten, because a
 * `javascript:` link corrected into something clickable is still somebody's
 * attempt to put script behind an href.
 */
export function parseLink(input: string): LinkInput {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: true, link: null }
  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false }
  }
  if (!(LINK_SCHEMES as readonly string[]).includes(url.protocol) || !url.hostname.includes('.')) {
    return { ok: false }
  }
  return { ok: true, link: candidate }
}

/** The link's site as a card names it — the host, without a leading `www.`. */
export function linkSite(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link
  }
}

// --- votes (FR-29.3) ---

/** One idea's votes, as the card and the sheet show them. */
export interface VoteTally {
  /** Who is for it, by user id, in the order the rows came. */
  up: string[]
  /** Who is against it. */
  down: string[]
  /** 👍 minus 👎 — the board's first order. */
  score: number
  /** My vote, or null for none cast or one withdrawn. */
  mine: IdeaVoteValue | null
  /** My row, cast or withdrawn — the one a new tap updates rather than duplicates. */
  myRow: IdeaVote | null
}

/** The tally of one idea. A withdrawn vote is a row with no vote, and counts for nothing. */
export function voteTally(
  ideaId: string,
  votes: readonly IdeaVote[],
  myUserId: string | null,
): VoteTally {
  const tally: VoteTally = { up: [], down: [], score: 0, mine: null, myRow: null }
  for (const vote of votes) {
    if (vote.idea_id !== ideaId) continue
    if (myUserId !== null && vote.user_id === myUserId) {
      tally.myRow = vote
      tally.mine = vote.vote
    }
    if (vote.vote === IDEA_VOTE_UP) tally.up.push(vote.user_id)
    else if (vote.vote === IDEA_VOTE_DOWN) tally.down.push(vote.user_id)
  }
  tally.score = tally.up.length - tally.down.length
  return tally
}

/** What a tap on 👍 or 👎 leaves: tapping the vote already cast withdraws it. */
export function nextVote(
  current: IdeaVoteValue | null,
  tapped: IdeaVoteValue,
): IdeaVoteValue | null {
  return current === tapped ? null : tapped
}

// --- the board (FR-29.6) ---

/** The board's two orders; by votes only where votes are shown (FR-29.3's G-8). */
export type IdeaOrder = 'score' | 'newest'
export const IDEA_ORDER_SCORE = 'score' as const satisfies IdeaOrder
export const IDEA_ORDER_NEWEST = 'newest' as const satisfies IdeaOrder

/** One card on the board, with what it shows beside the idea itself. */
export interface IdeaCard {
  idea: Idea
  tally: VoteTally
  comments: number
}

/** What narrows the board: one segment, and within it a tag and the rain mark, combined by *and*. */
export interface BoardFilter {
  state: IdeaState
  tag: IdeaTag | null
  rainProof: boolean
}

/** The board as the screen renders it. */
export interface Board {
  /** How many ideas stand in each segment, whatever the chips say. */
  counts: Record<IdeaState, number>
  /** The tags carried in the current segment, in the set's order — the only chips offered. */
  tags: IdeaTag[]
  /** Whether the current segment holds a rain-proof idea — the ☂ chip's condition. */
  hasRainProof: boolean
  /** The segment's cards after the chips, in the order asked for. */
  cards: IdeaCard[]
}

/** Newest first; an idea with no stamp yet sorts as the newest, since it was just written here. */
function newerFirst(a: Idea, b: Idea): number {
  const at = a.created_at ?? '￿'
  const bt = b.created_at ?? '￿'
  return bt.localeCompare(at) || a.id.localeCompare(b.id)
}

/**
 * The board of one trip. The chips offer only what the segment holds, so a
 * chip left chosen from another segment matches nothing and is dropped here
 * rather than emptying the list without saying why.
 */
export function ideaBoard(
  ideas: readonly Idea[],
  votes: readonly IdeaVote[],
  comments: readonly IdeaComment[],
  filter: BoardFilter,
  order: IdeaOrder,
  myUserId: string | null,
): Board {
  const counts = Object.fromEntries(IDEA_STATES.map((state) => [state, 0])) as Record<
    IdeaState,
    number
  >
  for (const idea of ideas) counts[idea.state] += 1

  const segment = ideas.filter((idea) => idea.state === filter.state)
  const carried = new Set(segment.map((idea) => idea.tag))
  const tags = IDEA_TAGS.filter((tag) => carried.has(tag))
  const hasRainProof = segment.some((idea) => idea.rain_proof)
  const tag = filter.tag !== null && carried.has(filter.tag) ? filter.tag : null
  const rainProof = filter.rainProof && hasRainProof

  const commentCounts = new Map<string, number>()
  for (const comment of comments) {
    commentCounts.set(comment.idea_id, (commentCounts.get(comment.idea_id) ?? 0) + 1)
  }

  const cards = segment
    .filter((idea) => (tag === null || idea.tag === tag) && (!rainProof || idea.rain_proof))
    .map((idea) => ({
      idea,
      tally: voteTally(idea.id, votes, myUserId),
      comments: commentCounts.get(idea.id) ?? 0,
    }))
    .sort((a, b) =>
      order === IDEA_ORDER_SCORE
        ? b.tally.score - a.tally.score || newerFirst(a.idea, b.idea)
        : newerFirst(a.idea, b.idea),
    )

  return { counts, tags, hasRainProof, cards }
}

/** The switcher's number: the ideas nobody has decided on yet (FR-21.21's count). */
export function undecidedCount(ideas: readonly Idea[]): number {
  return ideas.filter((idea) => idea.state === IDEA_STATE_IDEA).length
}

// --- the detail's moves (FR-29.2) ---

/** The step the detail puts first: onto the shortlist, or onto a day. */
export type IdeaLeadStep = 'shortlist' | 'plan'
export const IDEA_STEP_SHORTLIST = 'shortlist' as const satisfies IdeaLeadStep
export const IDEA_STEP_PLAN = 'plan' as const satisfies IdeaLeadStep

/** What an open idea goes on to; a done or dropped one has no step ahead. */
export function ideaLeadStep(state: IdeaState): IdeaLeadStep | null {
  if (state === IDEA_STATE_IDEA) return IDEA_STEP_SHORTLIST
  if (state === IDEA_STATE_SHORTLISTED) return IDEA_STEP_PLAN
  return null
}

/**
 * Where a closed idea goes when it is opened again: a done one was almost
 * always on the shortlist and keeps its day there; a dropped one is weighed
 * again among the ideas. Null for an idea that is still open.
 */
export function reopenedState(state: IdeaState): IdeaState | null {
  if (state === IDEA_STATE_DONE) return IDEA_STATE_SHORTLISTED
  if (state === IDEA_STATE_DROPPED) return IDEA_STATE_IDEA
  return null
}

/** The seldom moves the detail's ⋮ holds: back off the shortlist, and away. */
export function menuMoves(state: IdeaState): IdeaState[] {
  if (state === IDEA_STATE_SHORTLISTED) return [IDEA_STATE_IDEA, IDEA_STATE_DROPPED]
  if (state === IDEA_STATE_IDEA) return [IDEA_STATE_DROPPED]
  return []
}

/** One idea's discussion, oldest first — read as a conversation, like a note's replies. */
export function ideaDiscussion(ideaId: string, comments: readonly IdeaComment[]): IdeaComment[] {
  return comments
    .filter((comment) => comment.idea_id === ideaId)
    .sort(
      (a, b) =>
        (a.created_at ?? '￿').localeCompare(b.created_at ?? '￿') || a.id.localeCompare(b.id),
    )
}
