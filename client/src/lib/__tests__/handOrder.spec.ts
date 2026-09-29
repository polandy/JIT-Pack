import { describe, expect, it } from 'vitest'

import { byHand, dropInto, nextPosition, renumber } from '../handOrder'

interface Row {
  id: string
  position: number | null
}

const row = (id: string, position: number | null = null): Row => ({ id, position })
const ids = (rows: readonly Row[] | null) => rows?.map((r) => r.id) ?? null
const same = (a: Row, b: Row) => a.id === b.id
const positionOf = (r: Row) => r.position

describe('byHand (FR-30.13, FR-7.17)', () => {
  it('keeps a group nobody placed in the order it came in', () => {
    expect(ids(byHand([row('b'), row('a'), row('c')], positionOf))).toEqual(['b', 'a', 'c'])
  })

  it('reads the never-placed first and the placed after them by number', () => {
    const rows = [row('p2', 2), row('n1'), row('p0', 0), row('n2')]
    expect(ids(byHand(rows, positionOf))).toEqual(['n1', 'n2', 'p0', 'p2'])
  })

  it('keeps two rows at one number in the order they came in', () => {
    expect(ids(byHand([row('b', 1), row('a', 1)], positionOf))).toEqual(['b', 'a'])
  })
})

describe('nextPosition', () => {
  it.each([
    { name: 'nothing placed yet', positions: [null, undefined], want: 0 },
    { name: 'after the highest', positions: [3, null, 7, 1], want: 8 },
    { name: 'an empty group', positions: [], want: 0 },
  ])('$name', ({ positions, want }) => {
    expect(nextPosition(positions)).toBe(want)
  })
})

describe('dropInto', () => {
  const group = [row('a'), row('b'), row('c'), row('d')]

  it.each([
    { name: 'down past two rows', moved: 'a', gap: 3, want: ['b', 'c', 'a', 'd'] },
    { name: 'to the very end', moved: 'a', gap: 4, want: ['b', 'c', 'd', 'a'] },
    { name: 'up to the top', moved: 'd', gap: 0, want: ['d', 'a', 'b', 'c'] },
    { name: 'up by one', moved: 'c', gap: 1, want: ['a', 'c', 'b', 'd'] },
  ])('moves a row $name', ({ moved, gap, want }) => {
    const lifted = group.find((r) => r.id === moved)!
    expect(ids(dropInto(group, group, lifted, gap, same))).toEqual(want)
  })

  it.each([
    { name: 'the gap above it', gap: 1 },
    { name: 'the gap below it', gap: 2 },
  ])('moves nothing when let go in $name', ({ gap }) => {
    expect(dropInto(group, group, group[1]!, gap, same)).toBeNull()
  })

  it('takes a row from another group in at the gap', () => {
    expect(ids(dropInto(group, group, row('x'), 2, same))).toEqual(['a', 'b', 'x', 'c', 'd'])
  })

  it('takes a row into an empty group', () => {
    expect(ids(dropInto([], [], row('x'), 0, same))).toEqual(['x'])
  })

  it('lands next to the drawn neighbour when the screen draws fewer rows', () => {
    // b and d are held elsewhere on screen (the Fällig block, a filter): the
    // gap between a and c is after a, and d keeps its place after c.
    const shown = [group[0]!, group[2]!]
    expect(ids(dropInto(group, shown, row('x'), 1, same))).toEqual(['a', 'b', 'x', 'c', 'd'])
    expect(ids(dropInto(group, shown, row('x'), 2, same))).toEqual(['a', 'b', 'c', 'x', 'd'])
  })

  it('places a row lifted from somewhere the group does not draw', () => {
    // d stands in the Fällig block, and is dropped at the top of its own group.
    const shown = group.slice(0, 3)
    expect(ids(dropInto(group, shown, group[3]!, 0, same))).toEqual(['d', 'a', 'b', 'c'])
  })
})

describe('renumber', () => {
  it('numbers a never-placed group whole', () => {
    const writes = renumber([row('a'), row('b')], positionOf)
    expect(writes.map((w) => [w.item.id, w.position])).toEqual([
      ['a', 0],
      ['b', 1],
    ])
  })

  it('writes only what changes', () => {
    const ordered = [row('a', 0), row('c', 2), row('b', 1), row('d', 3)]
    expect(renumber(ordered, positionOf).map((w) => [w.item.id, w.position])).toEqual([
      ['c', 1],
      ['b', 2],
    ])
  })
})
