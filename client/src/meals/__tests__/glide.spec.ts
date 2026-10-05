/**
 * FR-33.15: the plan closes up around a meal that was moved — every block
 * slides from where it stood to where it stands, so the list never jumps
 * under the eye (the "Mahlzeit verschieben" mockup's own complaint).
 */
import { describe, expect, it } from 'vitest'

import { glideOffsets } from '../glide'

const at = (entries: [string, number][]) => new Map(entries)

describe('glideOffsets (FR-33.15)', () => {
  it('slides a block from where it stood to where it stands', () => {
    const offsets = glideOffsets(at([['day:14', 300]]), at([['day:14', 200]]), new Map())
    expect(offsets.get('day:14')).toBe(100)
  })

  it('lets a block that did not move stand still', () => {
    const offsets = glideOffsets(at([['day:14', 300]]), at([['day:14', 300]]), new Map())
    expect(offsets.has('day:14')).toBe(false)
  })

  it('fades in a block that was not there before', () => {
    const offsets = glideOffsets(new Map(), at([['day:15', 300]]), new Map())
    expect(offsets.get('day:15')).toBe('enter')
  })

  it('moves a meal by its own way only, its day already carrying it the rest', () => {
    // The day slides 100 up; the meal, which moved into it from 250 lower, slides the other 150.
    const offsets = glideOffsets(
      at([
        ['day:15', 300],
        ['meal:m3', 550],
      ]),
      at([
        ['day:15', 200],
        ['meal:m3', 300],
      ]),
      new Map([['meal:m3', 'day:15']]),
    )
    expect(offsets.get('day:15')).toBe(100)
    expect(offsets.get('meal:m3')).toBe(150)
  })

  it('never fades a meal in: one that is new to the screen simply stands', () => {
    const offsets = glideOffsets(
      new Map(),
      at([['meal:m9', 300]]),
      new Map([['meal:m9', 'day:15']]),
    )
    expect(offsets.has('meal:m9')).toBe(false)
  })
})
