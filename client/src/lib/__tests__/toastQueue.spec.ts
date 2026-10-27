/**
 * G-23 / FR-6.2 — top toasts are shown one at a time, in arrival order.
 *
 * `show` is a stand-in whose dismissal the test resolves by hand, so "the
 * toast went away" is an act of the test rather than six seconds of a clock.
 */
import { describe, expect, it } from 'vitest'

import { NOTIFICATION_BURST_LIMIT, createToastQueue, toastGroups } from '../toastQueue'

/** A `show` that records what is on screen and dismisses on request. */
function stage() {
  const shown: string[] = []
  const dismissals: Array<() => void> = []
  const show = (entry: string) =>
    new Promise<void>((resolve) => {
      shown.push(entry)
      dismissals.push(resolve)
    })
  /** Dismiss the toast on screen and let the queue react. */
  const dismiss = async () => {
    dismissals.shift()?.()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { shown, show, dismiss }
}

describe('G-23 toast queue', () => {
  it('shows the first entry at once', () => {
    const { shown, show } = stage()
    const queue = createToastQueue(show)
    queue.enqueue('a')
    expect(shown).toEqual(['a'])
    expect(queue.waiting()).toBe(0)
  })

  it('holds a second entry back while the first is on screen', () => {
    const { shown, show } = stage()
    const queue = createToastQueue(show)
    queue.enqueue('a')
    queue.enqueue('b')
    expect(shown).toEqual(['a'])
    expect(queue.waiting()).toBe(1)
  })

  it('shows the next entry only once the one on screen is dismissed, first in first out', async () => {
    const { shown, show, dismiss } = stage()
    const queue = createToastQueue(show)
    queue.enqueue('a')
    queue.enqueue('b')
    queue.enqueue('c')

    await dismiss()
    expect(shown).toEqual(['a', 'b'])
    await dismiss()
    expect(shown).toEqual(['a', 'b', 'c'])
    expect(queue.waiting()).toBe(0)
  })

  it('shows an entry at once again after the queue has run empty', async () => {
    const { shown, show, dismiss } = stage()
    const queue = createToastQueue(show)
    queue.enqueue('a')
    await dismiss()
    queue.enqueue('b')
    expect(shown).toEqual(['a', 'b'])
  })

  it('moves on past a toast that failed to appear', async () => {
    const shown: string[] = []
    const queue = createToastQueue(async (entry: string) => {
      shown.push(entry)
      if (entry === 'broken') throw new Error('create failed')
    })
    queue.enqueue('broken')
    queue.enqueue('b')
    await Promise.resolve()
    await Promise.resolve()
    expect(shown).toEqual(['broken', 'b'])
  })

  it('reports how many wait behind the toast on screen as they arrive and leave', async () => {
    const { show, dismiss } = stage()
    const heard: number[] = []
    const queue = createToastQueue(show, (n) => heard.push(n))
    queue.enqueue('a')
    queue.enqueue('b')
    queue.enqueue('c')
    await dismiss()
    expect(heard).toEqual([0, 1, 2, 1])
  })
})

describe('G-23 connect burst', () => {
  it(`gives up to ${NOTIFICATION_BURST_LIMIT} notices a toast each, in order`, () => {
    expect(toastGroups(['a', 'b', 'c'])).toEqual([['a'], ['b'], ['c']])
  })

  it(`gathers more than ${NOTIFICATION_BURST_LIMIT} notices into one summary group`, () => {
    expect(toastGroups(['a', 'b', 'c', 'd'])).toEqual([['a', 'b', 'c', 'd']])
  })

  it('announces nothing for an empty fetch', () => {
    expect(toastGroups([])).toEqual([])
  })
})
