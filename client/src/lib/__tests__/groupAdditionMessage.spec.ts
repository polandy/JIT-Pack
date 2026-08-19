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
    const message = groupAdditionMessage({ groupName: NAME, added: 3, alreadyPresent: [] })

    expect(message).toBe('Group “Makro Fotografie” added — 3 positions')
  })

  it('appends what was already there rather than counting it as added', () => {
    const message = groupAdditionMessage({
      groupName: NAME,
      added: 1,
      alreadyPresent: ['Kamera', 'Stativ'],
    })

    expect(message).toBe('Group “Makro Fotografie” added — 1 position, 2 already there')
  })

  it('says a fully present group is already there instead of reporting zero', () => {
    const message = groupAdditionMessage({ groupName: NAME, added: 0, alreadyPresent: ['Kamera'] })

    expect(message).toBe('Group “Makro Fotografie” is already fully on the list')
  })

  it('distinguishes a group that contributed nothing to this trip (FR-15.2)', () => {
    // Nothing added and nothing recognised: every position was excluded by the
    // trip's own attributes. "added — 0 positions" would be false twice over.
    const message = groupAdditionMessage({ groupName: NAME, added: 0, alreadyPresent: [] })

    expect(message).toBe('Group “Makro Fotografie” contributes nothing to this trip')
  })

  it('says the trip is not ready rather than nothing at all', () => {
    // M4 renders before its partition has been pulled (cold load), so the tap
    // is reachable while the list is still unknown. The add refuses — and a
    // refusal the user cannot see is indistinguishable from a broken button.
    const message = groupAdditionMessage(null)

    expect(message).toBe('Trip data is still loading — please try again in a moment')
  })
})
