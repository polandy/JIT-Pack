// @vitest-environment jsdom
/**
 * FR-24.1 — the folded tag shelf.
 *
 * jsdom lays nothing out, so each offer's `offsetTop` is stubbed to put two
 * chips on a line; how the chooser reads real lines is E2E-M10-16's to show.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import TagChooser from '../TagChooser.vue'
import type { Tag } from '@/types/domain'

const CHIPS_PER_LINE = 2
const LINE_PX = 36

const tags: Tag[] = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, name: `Tag${i}` }) as Tag)

const offsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')!
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const chips = [...(this.parentElement?.querySelectorAll('.chip.offer') ?? [])]
      return Math.floor(chips.indexOf(this) / CHIPS_PER_LINE) * LINE_PX
    },
  })
})
afterAll(() => Object.defineProperty(HTMLElement.prototype, 'offsetTop', offsetTop))

function mountChooser() {
  return mount(TagChooser, { props: { tags, assigned: [] } })
}

const toggle = (chooser: ReturnType<typeof mountChooser>) =>
  chooser.find('[data-testid="m10-tag-shelf-toggle"]')

describe('TagChooser shelf (FR-24.1)', () => {
  it('folds the offers to two lines behind a toggle that names them all', async () => {
    const chooser = mountChooser()
    await flushPromises()

    expect(chooser.findAll('.chip.offer')).toHaveLength(2 * CHIPS_PER_LINE)
    expect(toggle(chooser).attributes('aria-expanded')).toBe('false')
  })

  // A tap is a mousedown and a mouseup on the same node. The mousedown blurs
  // the name field, its settle re-renders the form, and a toggle rebuilt in
  // between never receives the click.
  it('keeps the toggle in place through a re-render that leaves the offers alone', async () => {
    const chooser = mountChooser()
    await flushPromises()
    const before = toggle(chooser).element

    await chooser.setProps({ assigned: [] })
    await flushPromises()

    expect(toggle(chooser).element).toBe(before)
  })
})
