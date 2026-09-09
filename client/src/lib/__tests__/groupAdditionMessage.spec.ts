/**
 * FR-27.10's report — the sentence a group add answers with. Four outcomes,
 * and each of them says something different about the trip; the branching
 * lives here rather than in M4's template so it can be read as a list of
 * cases instead of a nested ternary in a view.
 */
import { describe, expect, it } from 'vitest'

import { groupAdditionMessage } from '../groupAdditionMessage'

const NAME = 'Makro Fotografie'

describe('groupAdditionMessage (FR-27.10)', () => {
  it('names the group and what it added', () => {
    const message = groupAdditionMessage({
      groupName: NAME,
      added: 3,
      alreadyPresent: [],
      unassignable: [],
    })

    expect(message).toBe('Group “Makro Fotografie” added — 3 positions')
  })

  it('appends what was already there rather than counting it as added', () => {
    const message = groupAdditionMessage({
      groupName: NAME,
      added: 1,
      alreadyPresent: ['Kamera', 'Stativ'],
      unassignable: [],
    })

    expect(message).toBe('Group “Makro Fotografie” added — 1 position, 2 already there')
  })

  it('says a fully present group is already there instead of reporting zero', () => {
    const message = groupAdditionMessage({
      groupName: NAME,
      added: 0,
      alreadyPresent: ['Kamera'],
      unassignable: [],
    })

    expect(message).toBe('Group “Makro Fotografie” is already fully on the list')
  })

  it('distinguishes a group that contributed nothing to this trip (FR-15.2)', () => {
    // Nothing added and nothing recognised: every position was excluded by the
    // trip's own attributes. "added — 0 positions" would be false twice over.
    const message = groupAdditionMessage({
      groupName: NAME,
      added: 0,
      alreadyPresent: [],
      unassignable: [],
    })

    expect(message).toBe('Group “Makro Fotografie” contributes nothing to this trip')
  })

  it('asks for a traveler rather than claiming the group is empty (FR-1.4)', () => {
    // A group of per-person positions on a trip with nobody on it places
    // nothing — but "contributes nothing to this trip" is the wrong sentence:
    // it does contribute, and what is missing is a traveler.
    const message = groupAdditionMessage({
      groupName: NAME,
      added: 0,
      alreadyPresent: [],
      unassignable: ['Kamera', 'Stativ'],
    })

    expect(message).toBe(
      'Group \u201cMakro Fotografie\u201d needs a traveler \u2014 2 positions are per person',
    )
  })

  it('appends the ones still needing a traveler to what it did add', () => {
    const message = groupAdditionMessage({
      groupName: NAME,
      added: 2,
      alreadyPresent: [],
      unassignable: ['Kamera'],
    })

    expect(message).toBe(
      'Group \u201cMakro Fotografie\u201d added \u2014 2 positions, 1 still needs a traveler',
    )
  })

  it('says what is missing rather than what is present when nothing landed', () => {
    // Both halves are true, and only one of them is actionable: "already fully
    // on the list" would send the user looking for a row that is not there.
    const message = groupAdditionMessage({
      groupName: NAME,
      added: 0,
      alreadyPresent: ['Kamera'],
      unassignable: ['Stativ'],
    })

    expect(message).toBe(
      'Group \u201cMakro Fotografie\u201d needs a traveler \u2014 1 position is per person',
    )
  })

  it('says the trip is not ready rather than nothing at all', () => {
    // M4 renders before its partition has been pulled (cold load), so the tap
    // is reachable while the list is still unknown. The add refuses — and a
    // refusal the user cannot see is indistinguishable from a broken button.
    const message = groupAdditionMessage(null)

    expect(message).toBe('Trip data is still loading — please try again in a moment')
  })
})
