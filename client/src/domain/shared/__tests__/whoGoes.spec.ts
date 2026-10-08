/** FR-29.15/FR-31.3: one tap on a person in a for-whom row of chips. */
import { describe, expect, it } from 'vitest'

import { toggleWho } from '../whoGoes'

const roster = [{ id: 'andy' }, { id: 'sia' }, { id: 'leo' }]

describe('toggleWho', () => {
  it('names just the person tapped while everybody is chosen', () => {
    expect(toggleWho(null, 'sia', roster)).toEqual(['sia'])
  })

  it('adds and takes one at a time, in roster order', () => {
    expect(toggleWho(['leo'], 'andy', roster)).toEqual(['andy', 'leo'])
    expect(toggleWho(['andy', 'leo'], 'andy', roster)).toEqual(['leo'])
  })

  it('is everybody again once everybody is named, or nobody is', () => {
    expect(toggleWho(['andy', 'sia'], 'leo', roster)).toBeNull()
    expect(toggleWho(['sia'], 'sia', roster)).toBeNull()
  })

  it('drops a name no longer on the roster', () => {
    expect(toggleWho(['gone', 'sia'], 'andy', roster)).toEqual(['andy', 'sia'])
  })
})
