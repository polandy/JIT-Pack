import { describe, expect, it } from 'vitest'

import type { Idea, IdeaComment, IdeaVote } from '@/types/domain'
import {
  IDEA_STATE_DONE,
  IDEA_STATE_DROPPED,
  IDEA_STATE_IDEA,
  IDEA_STATE_SHORTLISTED,
} from '@/types/domain'
import {
  IDEA_ORDER_NEWEST,
  IDEA_ORDER_SCORE,
  IDEA_STEP_PLAN,
  IDEA_STEP_SHORTLIST,
  ideaBoard,
  ideaLeadStep,
  menuMoves,
  ideaDiscussion,
  linkSite,
  nextVote,
  parseLink,
  reopenedState,
  undecidedCount,
  voteTally,
} from '../ideas'

const TRIP = 'trip-sardinien'
const ANDY = 'user-andy'
const SIA = 'user-sia'

function idea(id: string, over: Partial<Idea> = {}): Idea {
  return {
    id,
    trip_id: TRIP,
    author_id: ANDY,
    title: id,
    note: null,
    link: null,
    tag: null,
    rain_proof: false,
    state: 'idea',
    created_at: '2026-06-01T10:00:00.000Z',
    planned_on: null,
    planned_at: null,
    ...over,
  }
}

function vote(ideaId: string, userId: string, value: IdeaVote['vote']): IdeaVote {
  return {
    id: `v-${ideaId}-${userId}`,
    trip_id: TRIP,
    idea_id: ideaId,
    user_id: userId,
    vote: value,
  }
}

function comment(id: string, ideaId: string, createdAt: string | null): IdeaComment {
  return {
    id,
    trip_id: TRIP,
    idea_id: ideaId,
    author_id: SIA,
    body: id,
    created_at: createdAt,
    edited_at: null,
  }
}

const ALL_IDEAS = { state: 'idea', tag: null, rainProof: false } as const

describe('parseLink (FR-29.1)', () => {
  it.each([
    ['blank is no link', '  ', { ok: true, link: null }],
    ['https stays', 'https://gorropu.info/tour', { ok: true, link: 'https://gorropu.info/tour' }],
    ['http stays', 'http://museonivola.it', { ok: true, link: 'http://museonivola.it' }],
    [
      'a bare address reads as https',
      'dorgali-boats.it',
      { ok: true, link: 'https://dorgali-boats.it' },
    ],
    ['a script link is refused', 'javascript:alert(1)', { ok: false }],
    ['a data link is refused', 'data:text/html,hi', { ok: false }],
    ['a word is no address', 'Gorropu', { ok: false }],
  ])('%s', (_name, input, want) => {
    expect(parseLink(input)).toEqual(want)
  })
})

describe('linkSite', () => {
  it('names the host without www', () => {
    expect(linkSite('https://www.cala-gonone-diving.com/kurse?x=1')).toBe('cala-gonone-diving.com')
  })
})

describe('voteTally (FR-29.3)', () => {
  it('counts both sides by name and finds my row', () => {
    const votes = [
      vote('i1', ANDY, 'up'),
      vote('i1', SIA, 'up'),
      vote('i1', 'user-lio', 'down'),
      vote('i2', ANDY, 'down'),
    ]
    const tally = voteTally('i1', votes, ANDY)
    expect(tally.up).toEqual([ANDY, SIA])
    expect(tally.down).toEqual(['user-lio'])
    expect(tally.score).toBe(1)
    expect(tally.mine).toBe('up')
    expect(tally.myRow?.id).toBe('v-i1-user-andy')
  })

  it('reads a withdrawn vote as no vote, but keeps its row for the next tap', () => {
    const tally = voteTally('i1', [vote('i1', ANDY, null)], ANDY)
    expect(tally).toMatchObject({ up: [], down: [], score: 0, mine: null })
    expect(tally.myRow).not.toBeNull()
  })

  it('has no mine without an identity', () => {
    expect(voteTally('i1', [vote('i1', ANDY, 'up')], null)).toMatchObject({
      mine: null,
      myRow: null,
    })
  })
})

describe('nextVote (FR-29.3)', () => {
  it.each([
    [null, 'up', 'up'],
    ['up', 'up', null],
    ['up', 'down', 'down'],
    ['down', 'down', null],
  ] as const)('%s tapped %s leaves %s', (current, tapped, want) => {
    expect(nextVote(current, tapped)).toBe(want)
  })
})

describe('ideaBoard (FR-29.6)', () => {
  const ideas = [
    idea('boot', { tag: 'outing', created_at: '2026-06-01T10:00:00.000Z' }),
    idea('museo', { tag: 'culture', rain_proof: true, created_at: '2026-06-03T10:00:00.000Z' }),
    idea('culurgiones', { tag: 'food', created_at: '2026-06-02T10:00:00.000Z' }),
    idea('gorropu', { tag: 'hiking', state: 'shortlisted' }),
    idea('quad', { state: 'dropped' }),
  ]
  const votes = [
    vote('boot', ANDY, 'up'),
    vote('boot', SIA, 'up'),
    vote('culurgiones', SIA, 'down'),
  ]

  it('counts every segment and shows only the chosen one', () => {
    const board = ideaBoard(ideas, votes, [], ALL_IDEAS, IDEA_ORDER_NEWEST, ANDY)
    expect(board.counts).toEqual({ idea: 3, shortlisted: 1, done: 0, dropped: 1 })
    expect(board.cards.map((c) => c.idea.id)).toEqual(['museo', 'culurgiones', 'boot'])
  })

  it('orders by score, the newest first among equals', () => {
    const board = ideaBoard(ideas, votes, [], ALL_IDEAS, IDEA_ORDER_SCORE, ANDY)
    expect(board.cards.map((c) => c.idea.id)).toEqual(['boot', 'museo', 'culurgiones'])
  })

  it('offers the tags the segment carries, in the set order, and the rain chip only where it matches', () => {
    const board = ideaBoard(ideas, votes, [], ALL_IDEAS, IDEA_ORDER_NEWEST, ANDY)
    expect(board.tags).toEqual(['culture', 'food', 'outing'])
    expect(board.hasRainProof).toBe(true)
    const shortlist = ideaBoard(
      ideas,
      votes,
      [],
      { ...ALL_IDEAS, state: 'shortlisted' },
      IDEA_ORDER_NEWEST,
      ANDY,
    )
    expect(shortlist.tags).toEqual(['hiking'])
    expect(shortlist.hasRainProof).toBe(false)
  })

  it('combines a tag and the rain mark by and (FR-29.12)', () => {
    const rainy = ideaBoard(
      ideas,
      votes,
      [],
      { ...ALL_IDEAS, rainProof: true },
      IDEA_ORDER_NEWEST,
      ANDY,
    )
    expect(rainy.cards.map((c) => c.idea.id)).toEqual(['museo'])
    const none = ideaBoard(
      ideas,
      votes,
      [],
      { state: 'idea', tag: 'food', rainProof: true },
      IDEA_ORDER_NEWEST,
      ANDY,
    )
    expect(none.cards).toEqual([])
  })

  it('drops a chip the segment does not carry instead of emptying the list', () => {
    const board = ideaBoard(
      ideas,
      votes,
      [],
      { state: 'shortlisted', tag: 'food', rainProof: true },
      IDEA_ORDER_NEWEST,
      ANDY,
    )
    expect(board.cards.map((c) => c.idea.id)).toEqual(['gorropu'])
  })

  it('counts each card its discussion', () => {
    const comments = [
      comment('c1', 'boot', null),
      comment('c2', 'boot', null),
      comment('c3', 'museo', null),
    ]
    const board = ideaBoard(ideas, votes, comments, ALL_IDEAS, IDEA_ORDER_SCORE, ANDY)
    expect(Object.fromEntries(board.cards.map((c) => [c.idea.id, c.comments]))).toEqual({
      boot: 2,
      museo: 1,
      culurgiones: 0,
    })
  })

  it('puts an idea written here and not yet stamped first among the newest', () => {
    const board = ideaBoard(
      [...ideas, idea('fresh', { created_at: null })],
      [],
      [],
      ALL_IDEAS,
      IDEA_ORDER_NEWEST,
      ANDY,
    )
    expect(board.cards[0]?.idea.id).toBe('fresh')
  })
})

describe('undecidedCount', () => {
  it('counts the ideas still in Ideen', () => {
    expect(undecidedCount([idea('a'), idea('b', { state: 'shortlisted' }), idea('c')])).toBe(2)
  })
})

describe('ideaDiscussion (FR-29.4)', () => {
  it('reads one idea’s words oldest first, the unsent last', () => {
    const comments = [
      comment('late', 'i1', '2026-06-02T09:00:00.000Z'),
      comment('other', 'i2', '2026-06-01T09:00:00.000Z'),
      comment('pending', 'i1', null),
      comment('early', 'i1', '2026-06-01T09:00:00.000Z'),
    ]
    expect(ideaDiscussion('i1', comments).map((c) => c.id)).toEqual(['early', 'late', 'pending'])
  })
})

describe('FR-29.2: what the detail offers for each state', () => {
  it('FR-29.2: an idea offers the shortlist, a shortlisted one its day, a closed one nothing ahead', () => {
    expect(ideaLeadStep(IDEA_STATE_IDEA)).toBe(IDEA_STEP_SHORTLIST)
    expect(ideaLeadStep(IDEA_STATE_SHORTLISTED)).toBe(IDEA_STEP_PLAN)
    expect(ideaLeadStep(IDEA_STATE_DONE)).toBeNull()
    expect(ideaLeadStep(IDEA_STATE_DROPPED)).toBeNull()
  })

  it('FR-29.2: a done idea reopens onto the shortlist, a dropped one among the ideas, an open one not at all', () => {
    expect(reopenedState(IDEA_STATE_DONE)).toBe(IDEA_STATE_SHORTLISTED)
    expect(reopenedState(IDEA_STATE_DROPPED)).toBe(IDEA_STATE_IDEA)
    expect(reopenedState(IDEA_STATE_IDEA)).toBeNull()
    expect(reopenedState(IDEA_STATE_SHORTLISTED)).toBeNull()
  })

  it('FR-29.2: the ⋮ moves an open idea back or away, and a closed one nowhere', () => {
    expect(menuMoves(IDEA_STATE_IDEA)).toEqual([IDEA_STATE_DROPPED])
    expect(menuMoves(IDEA_STATE_SHORTLISTED)).toEqual([IDEA_STATE_IDEA, IDEA_STATE_DROPPED])
    expect(menuMoves(IDEA_STATE_DONE)).toEqual([])
    expect(menuMoves(IDEA_STATE_DROPPED)).toEqual([])
  })
})
