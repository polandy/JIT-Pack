// @vitest-environment jsdom
/**
 * The head above a block, and its counter (G-13).
 *
 * Two things are worth pinning, and both are about the count. Zero is a
 * count a section legitimately has — "Open · 0" is the sentence M14 shows
 * when a review is finished — so a falsy check would silently hide exactly
 * the number the screen exists to report. And a section with no count at
 * all renders no element, because an empty span still takes its line box
 * and would push the head's baseline around per screen.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SectionHead from '../SectionHead.vue'

// Read as a source file: jsdom applies no scoped style, so the margin can
// only be asserted where it is written (the rendered edge is E2E-M7-13 and E2E-M8-29).
// `process.cwd()` is Vitest's configured root — the client directory.
const sfc = readFileSync(resolve(process.cwd(), 'src/components/global/SectionHead.vue'), 'utf8')
const ruleFor = (selector: string): string =>
  sfc.match(new RegExp(`\\n${selector.replaceAll('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? ''

describe('SectionHead — one head, one counter (G-13)', () => {
  it('renders the name at the display role', () => {
    const wrapper = mount(SectionHead, { props: { title: 'Recognised groups' } })

    const head = wrapper.get('h2')
    expect(head.text()).toBe('Recognised groups')
    expect(head.classes()).toContain('jp-section-head')
  })

  it('sets the count beside the name, in its own role', () => {
    const wrapper = mount(SectionHead, { props: { title: 'Open', count: 3 } })

    const count = wrapper.get('.head-count')
    expect(count.text()).toBe('3')
    expect(count.classes()).toContain('jp-section-count')
  })

  it('shows a count of zero, which is a count a section has', () => {
    const wrapper = mount(SectionHead, { props: { title: 'Open', count: 0 } })

    expect(wrapper.get('.head-count').text()).toBe('0')
  })

  it('takes a phrase as its count, because the word between figures is language', () => {
    // M21 counts "1 of 2" — the catalogue owns that sentence, so the count
    // is a rendered string rather than a number the component formats.
    const wrapper = mount(SectionHead, { props: { title: 'Own items', count: '1 of 2' } })

    expect(wrapper.get('.head-count').text()).toBe('1 of 2')
  })

  it('renders no count element when the section has none', () => {
    const wrapper = mount(SectionHead, { props: { title: 'Data' } })

    // The positive half: the head itself rendered, so the missing span is a
    // decision rather than a component that failed to mount.
    expect(wrapper.get('h2').text()).toBe('Data')
    expect(wrapper.find('.head-count').exists()).toBe(false)
  })

  it('passes a case id through to the head itself', () => {
    // Not a prop: with one root element the attribute falls through, which
    // is what keeps the fifty-five migrated testids on the element the
    // existing cases already address.
    const wrapper = mount(SectionHead, {
      props: { title: 'Open' },
      attrs: { 'data-testid': 'm14-open-count' },
    })

    expect(wrapper.get('h2').attributes('data-testid')).toBe('m14-open-count')
  })

  describe('the inset (UX-16, FR-21.11)', () => {
    it('has no side margin of its own, so it lines up with what holds it', () => {
      // A padded page or a sheet already insets its content; a margin of the
      // head's own on top left the count 2 px short of the card on M1.
      expect(ruleFor('.section-head')).toMatch(/margin: 24px 0 10px;/)
    })

    it('takes the card-list inset when it stands on a page of inset cards', () => {
      const wrapper = mount(SectionHead, { props: { title: 'Gruppen', count: 9, cardList: true } })

      expect(wrapper.get('h2').classes()).toContain('on-card-list')
      expect(ruleFor('.section-head.on-card-list')).toMatch(
        /margin-inline: var\(--jp-card-list-inset\);/,
      )
    })

    it('stays flush in a container unless told otherwise', () => {
      const wrapper = mount(SectionHead, { props: { title: 'Geplant' } })

      expect(wrapper.get('h2').classes()).not.toContain('on-card-list')
    })
  })
})
