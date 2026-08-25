/**
 * The name spaces the master partition holds UNIQUE (FR-1.6 templates,
 * FR-13.1 series): a name already taken must be found on the device, before
 * a mutation is ever enqueued, because the constraint's only other answer is
 * a rejected push.
 */
import { describe, it, expect } from 'vitest'

import { foldName, findNameCollision, renameTarget, type NamedRow } from '../nameCollision'

const rows: NamedRow[] = [
  { id: 't1', name: 'Ferien' },
  { id: 't2', name: 'Frühling' },
  { id: 't3', name: '  Kamera  ' },
]

describe('foldName', () => {
  it('trims and lowercases, because a name is not two names by its capitals', () => {
    expect(foldName('  Sommer ')).toBe('sommer')
    expect(foldName('SOMMER')).toBe('sommer')
  })

  it('keeps diacritics, because the database would accept the unfolded spelling', () => {
    expect(foldName('Frühling')).not.toBe(foldName('Fruhling'))
  })
})

describe('findNameCollision', () => {
  it('finds the exact name the database would refuse', () => {
    expect(findNameCollision('Ferien', rows)?.id).toBe('t1')
  })

  it('finds a name that differs only in case (FR-1.6)', () => {
    expect(findNameCollision('ferien', rows)?.id).toBe('t1')
  })

  it('finds a name whose surrounding whitespace is all that differs', () => {
    expect(findNameCollision('Kamera', rows)?.id).toBe('t3')
  })

  it('does not fold diacritics: the constraint would accept it', () => {
    expect(findNameCollision('Fruhling', rows)).toBeUndefined()
  })

  it('reports no collision for a free name', () => {
    expect(findNameCollision('Winter', rows)).toBeUndefined()
  })

  it('ignores the row being renamed, so a rename to its own name is free', () => {
    expect(findNameCollision('Ferien', rows, 't1')).toBeUndefined()
    expect(findNameCollision('Ferien', rows, 't2')?.id).toBe('t1')
  })

  it('treats an empty name as no collision — emptiness is the caller s gate', () => {
    expect(findNameCollision('   ', rows)).toBeUndefined()
  })
})

describe('renameTarget', () => {
  it('names the new spelling when the patch touches the name', () => {
    expect(renameTarget({ name: 'Sommer' })).toBe('Sommer')
  })

  it('is null for an edit that is not a rename, so it faces no name check', () => {
    expect(renameTarget({ icon: '⛺' })).toBeNull()
    expect(renameTarget({ kind: 'group' })).toBeNull()
  })
})
