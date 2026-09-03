// @vitest-environment jsdom
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import EmptyState from '../EmptyState.vue'

/**
 * U-8 (design review 2026-09-02). The G-7 empty state was hand-built on ten
 * screens with four different spacing rules; E2E-G2-09 exists because one of
 * those copies had dropped two declarations. What is pinned here is the
 * component's own shape, and that no screen goes back to building its own.
 */

/** Every file that renders a screen or a piece of one. */
const sources = globSync('src/{views,components,dev}/**/*.vue', { cwd: process.cwd() })
  .map((path) => path.replace(/\\/g, '/'))
  .filter((path) => path !== 'src/components/global/EmptyState.vue')
  .map((path) => ({
    path,
    // The component's own docblock names the class it owns, and so do the
    // comments that say why a screen is not one of these.
    source: readFileSync(resolve(process.cwd(), path), 'utf8')
      .replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, ''),
  }))

describe('EmptyState', () => {
  it('renders icon, title and hint, and puts the testid on the root', () => {
    const wrapper = mount(EmptyState, {
      props: { icon: 'x.svg', title: 'Nothing here', hint: 'Add one', testid: 'm9-empty' },
      global: { stubs: { IonIcon: { template: '<i class="empty-icon" />' } } },
    })

    expect(wrapper.attributes('data-testid')).toBe('m9-empty')
    expect(wrapper.classes()).toContain('empty-state')
    expect(wrapper.find('.empty-icon').exists()).toBe(true)
    expect(wrapper.find('.empty-title').text()).toBe('Nothing here')
    expect(wrapper.find('.empty-hint').text()).toBe('Add one')
  })

  it('omits the icon and the hint when the state has neither', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No match' },
      global: { stubs: { IonIcon: { template: '<i class="empty-icon" />' } } },
    })

    expect(wrapper.find('.empty-icon').exists()).toBe(false)
    expect(wrapper.find('.empty-hint').exists()).toBe(false)
    expect(wrapper.attributes('data-testid')).toBeUndefined()
  })

  it('renders the way out below the sentence', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No trips' },
      slots: { default: '<button data-testid="dashboard-plan-trip">Plan</button>' },
      global: { stubs: { IonIcon: true } },
    })

    expect(wrapper.find('[data-testid="dashboard-plan-trip"]').exists()).toBe(true)
  })

  it('finds the sources to check at all', () => {
    expect(sources.length).toBeGreaterThan(40)
    expect(sources.map((file) => file.path)).toContain('src/views/trips/TripListPage.vue')
  })

  it('no screen styles the shared empty state itself', () => {
    // Scoped to the `<style>` block rather than to a line that looks like a
    // rule: a selector list broken over two lines, a `.card .empty-icon`
    // descendant or a `:deep()` from a parent are all the same violation,
    // and a line-shaped pattern sees none of them.
    //
    // `.empty-hint` is deliberately not in this list: outside an empty state
    // it is a different thing — a note inside a populated section (M11's
    // unassigned box, M8's group and position lists, the wizard's steps).
    const owned = /\.empty-(state|icon)\b/g

    const offenders = sources.flatMap(({ path, source }) =>
      [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].flatMap(([, block = '']) =>
        [...block.matchAll(owned)].map(
          (hit) => `${path}: .empty-${hit[1]} in <style> at offset ${hit.index}`,
        ),
      ),
    )

    expect(offenders).toEqual([])
  })
})
