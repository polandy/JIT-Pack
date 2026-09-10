/**
 * The one rule this has: `done` is always called. Vue's leave hook keeps a
 * row in the DOM until it is, so every path out of the collapse — reduced
 * motion, a finished transition, no transition at all, a cancelled one — is
 * a path this must prove.
 */
import { describe, it, expect, vi } from 'vitest'

import { collapseRow, type CollapsibleRow } from '../rowCollapse'

function row(
  animations: Promise<unknown>[] | null = [],
): CollapsibleRow & { style: { height: string } } {
  return {
    offsetHeight: 48,
    style: { height: '' },
    getAnimations:
      animations === null ? undefined : () => animations.map((finished) => ({ finished })),
  } as CollapsibleRow & { style: { height: string } }
}

describe('collapseRow', () => {
  it('finishes at once under reduced motion, without touching the height', () => {
    const done = vi.fn()
    const node = row()

    collapseRow(node, done, true)

    expect(done).toHaveBeenCalledTimes(1)
    expect(node.style.height).toBe('')
  })

  it('pins the measured height before driving it to zero', () => {
    const heights: string[] = []
    const node = row([new Promise(() => {})])
    Object.defineProperty(node.style, 'height', {
      get: () => heights[heights.length - 1] ?? '',
      set: (v: string) => heights.push(v),
    })

    collapseRow(node, vi.fn(), false)

    expect(heights).toEqual(['48px', '0'])
  })

  it('waits for the animation it started', async () => {
    const done = vi.fn()
    let finish!: () => void
    collapseRow(row([new Promise<void>((r) => (finish = r))]), done, false)

    expect(done).not.toHaveBeenCalled()
    finish()
    await Promise.resolve()
    await Promise.resolve()

    expect(done).toHaveBeenCalledTimes(1)
  })

  it('finishes when nothing animates — the row that is not laid out', () => {
    // `transitionend` never fires here, which is how a hidden tab used to
    // leave a packed row in the list for the rest of the session.
    const done = vi.fn()

    collapseRow(row([]), done, false)

    expect(done).toHaveBeenCalledTimes(1)
  })

  it('finishes when the animation is cancelled', async () => {
    const done = vi.fn()

    collapseRow(row([Promise.reject(new Error('cancelled'))]), done, false)
    await Promise.resolve()
    await Promise.resolve()

    expect(done).toHaveBeenCalledTimes(1)
  })

  it('finishes where the engine cannot list animations at all', () => {
    const done = vi.fn()

    collapseRow(row(null), done, false)

    expect(done).toHaveBeenCalledTimes(1)
  })
})
