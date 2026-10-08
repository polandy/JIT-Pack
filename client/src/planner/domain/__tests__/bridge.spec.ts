import { describe, expect, it } from 'vitest'

import {
  IDEA_RESULT_EXCURSION,
  IDEA_RESULT_SHOPPING,
  IDEA_RESULT_TASK,
  type IdeaResult,
} from '@/domain/ideaBridge'
import {
  IDEA_STATE_DONE,
  IDEA_STATE_DROPPED,
  IDEA_STATE_IDEA,
  IDEA_STATE_SHORTLISTED,
} from '@/types/domain'
import { offeredResults } from '../bridge'

function result(kind: IdeaResult['kind'], key = kind): IdeaResult {
  return { key, kind, title: key, done: false, path: '/' }
}

/*
 * FR-29.13: only an idea on the shortlist offers to become something; an
 * excursion is made once, a task or a shopping entry as often as needed.
 */
describe('offeredResults (FR-29.13)', () => {
  it('offers all three on the shortlist while nothing came of it', () => {
    expect(offeredResults(IDEA_STATE_SHORTLISTED, [])).toEqual([
      IDEA_RESULT_EXCURSION,
      IDEA_RESULT_TASK,
      IDEA_RESULT_SHOPPING,
    ])
  })

  it('stops offering the excursion once there is one', () => {
    expect(offeredResults(IDEA_STATE_SHORTLISTED, [result(IDEA_RESULT_EXCURSION)])).toEqual([
      IDEA_RESULT_TASK,
      IDEA_RESULT_SHOPPING,
    ])
  })

  it('keeps offering a task and a shopping entry after one of each', () => {
    expect(
      offeredResults(IDEA_STATE_SHORTLISTED, [
        result(IDEA_RESULT_TASK),
        result(IDEA_RESULT_SHOPPING),
      ]),
    ).toEqual([IDEA_RESULT_EXCURSION, IDEA_RESULT_TASK, IDEA_RESULT_SHOPPING])
  })

  it.each([IDEA_STATE_IDEA, IDEA_STATE_DONE, IDEA_STATE_DROPPED])(
    'offers nothing in %s',
    (state) => {
      expect(offeredResults(state, [])).toEqual([])
    },
  )
})
