/**
 * M31's shortlist as the planner contributes it (§3.33, ADR-066 amendment 3):
 * the trip's shortlisted ideas, by id and title — no idea in another state,
 * and none of another trip.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { TABLE } from '@/api/tables'
import { ideaShortlist } from '@/planner'
import { usePlannerStore } from '../store'
import { IDEA_STATES, IDEA_STATE_SHORTLISTED, type IdeaState } from '../types'

beforeEach(() => setActivePinia(createPinia()))

function pulledIdea(id: string, tripId: string, state: IdeaState, seq: number) {
  return {
    seq,
    table: TABLE.ideas,
    id,
    deleted: false,
    row: { trip_id: tripId, author_id: 'u1', title: `Idee ${id}`, state, rain_proof: 0 },
  }
}

describe('ideaShortlist (M31)', () => {
  it('names only the trip’s shortlisted ideas', () => {
    usePlannerStore().applyChanges([
      ...IDEA_STATES.map((state, i) => pulledIdea(`i-${state}`, 't1', state, i + 1)),
      pulledIdea('elsewhere', 't2', IDEA_STATE_SHORTLISTED, 99),
    ])
    expect(ideaShortlist()('t1')).toEqual([
      { id: `i-${IDEA_STATE_SHORTLISTED}`, title: `Idee i-${IDEA_STATE_SHORTLISTED}` },
    ])
  })
})
