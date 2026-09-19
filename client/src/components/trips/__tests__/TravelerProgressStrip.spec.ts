// @vitest-environment jsdom
/**
 * FR-25.29 — the per-traveler strip over M4's list.
 *
 * The arithmetic and the fold are `domain/travelerProgress.ts`'s and are pinned
 * there. What only this component answers is pinned here: one face per shown
 * traveler with its count, the pressed state read from the person facet, the
 * value a tap hands back, the shared line's presence, and the fold's two doors.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import TravelerProgressStrip from '../TravelerProgressStrip.vue'
import { NO_VALUE } from '@/domain/packingView'
import { TRAVELER_FOLD_CAP, type TravelerProgress } from '@/domain/travelerProgress'
import type { Traveler } from '@/types/domain'

const traveler = (id: string, name: string): Traveler => ({
  id,
  trip_id: 't1',
  name,
  linked_user_id: null,
})

function progress(
  shares: Array<[string, string, number, number]>,
  shared = { done: 0, total: 0 },
): TravelerProgress {
  return {
    travelers: shares.map(([id, name, done, total]) => ({
      traveler: traveler(id, name),
      done,
      total,
    })),
    shared,
  }
}

const THREE = progress([
  ['anna', 'Anna', 1, 4],
  ['ben', 'Ben', 3, 3],
  ['mia', 'Mia', 0, 0],
])

const mountStrip = (p: TravelerProgress, selected: string[] = []) =>
  mount(TravelerProgressStrip, { props: { progress: p, selected } })

// Keyed by name, as the e2e suite knows travelers only by what it typed.
const face = (w: ReturnType<typeof mountStrip>, name: string) =>
  w.get(`[data-testid="m4-traveler-progress-${name}"]`)

describe('TravelerProgressStrip (FR-25.29)', () => {
  it('draws one face per traveler, each with its own count', () => {
    const w = mountStrip(THREE)

    expect(face(w, 'Anna').text()).toContain('1 of 4')
    expect(face(w, 'Ben').text()).toContain('done')
    expect(face(w, 'Mia').text()).toContain('nothing to pack')
  })

  it('lays three travelers out as three columns', () => {
    const w = mountStrip(THREE)
    const faces = w.get('.faces').element as HTMLElement
    expect(faces.style.getPropertyValue('--columns')).toBe('3')
  })

  it('marks the traveler the person facet is narrowed to, and only them', () => {
    const w = mountStrip(THREE, ['ben'])
    expect(face(w, 'Ben').attributes('aria-pressed')).toBe('true')
    expect(face(w, 'Anna').attributes('aria-pressed')).toBe('false')
  })

  it('hands the tapped traveler back to the screen', async () => {
    const w = mountStrip(THREE)
    await face(w, 'Mia').trigger('click')
    expect(w.emitted('select')).toEqual([['mia']])
  })

  it('offers the shared rows as a line of their own, handing back the no-value', async () => {
    const w = mountStrip(THREE, [])
    expect(w.find('[data-testid="m4-traveler-progress-shared"]').exists()).toBe(false)

    const withShared = mountStrip(progress([['anna', 'Anna', 0, 1]], { done: 2, total: 5 }))
    const line = withShared.get('[data-testid="m4-traveler-progress-shared"]')
    expect(line.text()).toContain('2 of 5')
    await line.trigger('click')
    expect(withShared.emitted('select')).toEqual([[NO_VALUE]])
  })

  it('folds a large party behind one slot and unfolds it on a tap', async () => {
    const many = progress(
      Array.from({ length: TRAVELER_FOLD_CAP + 2 }, (_, i) => [`p${i}`, `P${i}`, 0, 1]),
    )
    const w = mountStrip(many)

    expect(w.findAll('[data-testid^="m4-traveler-progress-P"]')).toHaveLength(TRAVELER_FOLD_CAP - 1)
    const more = w.get('[data-testid="m4-traveler-progress-more"]')
    expect(more.text()).toContain('+3')
    expect(w.get('[data-testid="m4-traveler-progress-more-open"]').text()).toContain('3 still open')

    await more.trigger('click')
    expect(w.findAll('[data-testid^="m4-traveler-progress-P"]')).toHaveLength(TRAVELER_FOLD_CAP + 2)

    await w.get('[data-testid="m4-traveler-progress-less"]').trigger('click')
    expect(w.findAll('[data-testid^="m4-traveler-progress-P"]')).toHaveLength(TRAVELER_FOLD_CAP - 1)
  })
})
