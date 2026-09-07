// @vitest-environment jsdom
/**
 * The head of a bottom sheet (§3.25, G-13).
 *
 * Nine sheets had written this by hand. What is worth pinning is what the
 * hand-written copies disagreed about — the way out, which existed in three
 * designs — and the two things a component can get wrong by omission: a
 * second line that renders as an empty box when there is none, and an h1
 * whose browser margin nobody declined.
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SheetHead from '../SheetHead.vue'

describe('SheetHead — one head, one way out (G-13)', () => {
  it('names the sheet at the sheet-title role', () => {
    const wrapper = mount(SheetHead, { props: { title: 'Links' } })

    const title = wrapper.get('h1')
    expect(title.text()).toBe('Links')
    expect(title.classes()).toContain('jp-sheet-title')
  })

  it('renders the second line at the meta role when there is one', () => {
    const wrapper = mount(SheetHead, { props: { title: 'Links', meta: '5.0 kg of 5.5 kg' } })

    const meta = wrapper.get('.meta')
    expect(meta.text()).toBe('5.0 kg of 5.5 kg')
    expect(meta.classes()).toContain('jp-meta')
  })

  it('renders no second line at all when there is none', () => {
    // An empty paragraph still takes its line box, and the head would gain
    // a gap on every sheet that names only itself — which is most of them.
    const wrapper = mount(SheetHead, { props: { title: 'Marks' } })

    expect(wrapper.get('h1').text()).toBe('Marks')
    expect(wrapper.find('.meta').exists()).toBe(false)
  })

  it('renders the second line when a slot fills it and no string was passed', () => {
    // M11's load line carries an icon and a state class, so it arrives as a
    // slot. Keying the element off the prop alone would have dropped it.
    const wrapper = mount(SheetHead, {
      props: { title: 'Links' },
      slots: { meta: '<span data-testid="m11-sheet-load">100 % imbalance</span>' },
    })

    expect(wrapper.get('.meta').text()).toBe('100 % imbalance')
  })

  it('emits close from the way out, with the case id it was given', () => {
    const wrapper = mount(SheetHead, {
      props: { title: 'Links', closeTestid: 'm11-sheet-close' },
    })

    const close = wrapper.get('[data-testid="m11-sheet-close"]')
    close.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('puts the lead and trail slots around the two lines', () => {
    const wrapper = mount(SheetHead, {
      props: { title: 'Links' },
      slots: {
        lead: '<span class="glyph">g</span>',
        trail: '<span class="indicator">i</span>',
      },
    })

    const order = [...wrapper.element.children].map((n) => n.className)
    expect(order[0]).toContain('glyph')
    expect(order[1]).toContain('titles')
    expect(order[2]).toContain('indicator')
    expect(order[3]).toContain('x')
  })

  it('declines the h1 margin the role does not name', () => {
    // `.jp-sheet-title` names type and no spacing, so the browser's own h1
    // margin survives it. Four sheets used to decline it separately, and the
    // one that forgot had its title start half a line below the state glyph
    // it was supposed to align with (E2E-G2-08).
    const css = readFileSync(resolve(process.cwd(), 'src/components/global/SheetHead.vue'), 'utf8')
    expect(css).toMatch(/\.titles h1 \{[^}]*margin: 0/)
  })
})

describe('the sheets stopped drawing their own way out', () => {
  const vueFiles = globSync('src/**/*.vue', { cwd: process.cwd() })

  it('finds the components to check at all', () => {
    expect(vueFiles.length).toBeGreaterThan(20)
  })

  it('leaves the round close control to this one component', () => {
    // Eight sheets carried a `.x` rule, in two designs split four against
    // four: a filled circle at the round-control size, and a 32px ghost.
    // The same control, two appearances, and nothing recording which was
    // meant. A ninth copy is what this refuses.
    for (const file of vueFiles) {
      if (file.endsWith('SheetHead.vue')) continue
      expect(readFileSync(file, 'utf8'), `${file} draws its own close control`).not.toMatch(
        /^\.x \{/m,
      )
    }
  })
})
