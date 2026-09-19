// @vitest-environment jsdom
/**
 * M9's tag filter (FR-24.8) — the sheet that replaced the swipe axis.
 *
 * Mounted directly rather than through M9: Ionic renders an overlay's content
 * only once it has presented, and under jsdom it never does, so a page-level
 * spec can reach the sheet's contract but not its controls. The page's half —
 * what it does with `update:selection` and `update:mode` — is asserted in
 * `ItemInventoryPage.spec.ts`.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import TagFilterSheet from '../TagFilterSheet.vue'
import { UNTAGGED_KEY } from '@/domain/tags'
import { t } from '@/i18n'
import type { Tag } from '@/types/domain'

const tags: Tag[] = [
  { id: 't-div', name: 'Diverses', sort_order: 0 },
  { id: 't-hyg', name: 'Hygiene', sort_order: 1 },
  { id: 't-zubehoer', name: 'Elektronisches Zubehör', sort_order: 2 },
  { id: 't-leer', name: 'Leerer Tag', sort_order: 3 },
]

const counts = new Map([
  ['t-div', 49],
  ['t-hyg', 9],
  ['t-zubehoer', 24],
])

function mountSheet(props: Partial<InstanceType<typeof TagFilterSheet>['$props']> = {}) {
  return mount(TagFilterSheet, {
    props: {
      isOpen: true,
      tags,
      counts,
      untaggedCount: 2,
      selection: [],
      mode: 'any' as const,
      shown: 184,
      ...props,
    },
    global: { stubs: { SheetModal: { template: '<div><slot /></div>' }, SheetHead: true } },
  })
}

describe('TagFilterSheet — what the axis could not do (FR-24.8)', () => {
  it('shows a tag’s mark beside its name, and none for a tag without one (FR-24.13)', () => {
    const sheet = mountSheet({ tags: [{ ...tags[0]!, icon: '📦' }, tags[1]!] })

    expect(sheet.get('[data-testid="m9-filter-tag-Diverses"]').text()).toContain('📦')
    expect(
      sheet.get('[data-testid="m9-filter-tag-Hygiene"]').find('[data-testid="item-mark"]').exists(),
    ).toBe(false)
  })

  it('lists every tag with the number of items it holds', () => {
    const sheet = mountSheet()

    // The axis showed four of twenty-four chips and no counts at all.
    expect(sheet.find('[data-testid="m9-filter-tag-Diverses"]').text()).toContain('49')
    expect(sheet.find('[data-testid="m9-filter-tag-Elektronisches Zubehör"]').text()).toContain(
      '24',
    )
  })

  it('leaves out a tag nothing carries, and the bucket when it is empty', () => {
    const sheet = mountSheet()
    expect(sheet.find('[data-testid="m9-filter-tag-Leerer Tag"]').exists()).toBe(false)
    expect(sheet.find('[data-testid="m9-filter-untagged"]').exists()).toBe(true)

    const none = mountSheet({ untaggedCount: 0 })
    expect(none.find('[data-testid="m9-filter-untagged"]').exists()).toBe(false)
  })

  it('searches the tags under the app’s fold, both spellings of an umlaut', async () => {
    const sheet = mountSheet()

    await sheet.find('[data-testid="m9-filter-search"]').setValue('zubehoer')
    expect(sheet.find('[data-testid="m9-filter-tag-Elektronisches Zubehör"]').exists()).toBe(true)
    expect(sheet.find('[data-testid="m9-filter-tag-Diverses"]').exists()).toBe(false)

    await sheet.find('[data-testid="m9-filter-search"]').setValue('zubehör')
    expect(sheet.find('[data-testid="m9-filter-tag-Elektronisches Zubehör"]').exists()).toBe(true)

    await sheet.find('[data-testid="m9-filter-search"]').setValue('zzz')
    expect(sheet.find('[data-testid="m9-filter-no-tag"]').text()).toBe(t('items.filterNoTag'))
  })

  it('adds and removes a tag from the selection', async () => {
    const sheet = mountSheet({ selection: ['t-hyg'] })

    await sheet.find('[data-testid="m9-filter-tag-Diverses"]').trigger('click')
    expect(sheet.emitted('update:selection')?.[0]).toEqual([['t-hyg', 't-div']])

    await sheet.find('[data-testid="m9-filter-tag-Hygiene"]').trigger('click')
    expect(sheet.emitted('update:selection')?.[1]).toEqual([[]])
  })

  it('keeps the untagged bucket exclusive in both directions', async () => {
    // "all" plus a real tag is empty by construction, so the control never
    // offers the way in (see the component's own note).
    const withTags = mountSheet({ selection: ['t-div', 't-hyg'] })
    await withTags.find('[data-testid="m9-filter-untagged"]').trigger('click')
    expect(withTags.emitted('update:selection')?.[0]).toEqual([[UNTAGGED_KEY]])

    const withBucket = mountSheet({ selection: [UNTAGGED_KEY] })
    await withBucket.find('[data-testid="m9-filter-tag-Diverses"]').trigger('click')
    expect(withBucket.emitted('update:selection')?.[0]).toEqual([['t-div']])

    const off = mountSheet({ selection: [UNTAGGED_KEY] })
    await off.find('[data-testid="m9-filter-untagged"]').trigger('click')
    expect(off.emitted('update:selection')?.[0]).toEqual([[]])
  })

  it('offers the any/all switch only where it decides something', async () => {
    // With nothing or one tag chosen the two modes give the same list, and a
    // control that changes nothing is a control that teaches nothing.
    expect(mountSheet().find('[data-testid="m9-filter-mode"]').exists()).toBe(false)
    expect(
      mountSheet({ selection: ['t-div'] })
        .find('[data-testid="m9-filter-mode"]')
        .exists(),
    ).toBe(false)

    const two = mountSheet({ selection: ['t-div', 't-hyg'] })
    expect(two.find('[data-testid="m9-filter-mode"]').exists()).toBe(true)
    await two.find('[data-testid="m9-filter-mode-all"]').trigger('click')
    expect(two.emitted('update:mode')?.[0]).toEqual(['all'])
  })

  it('says how many rows the selection leaves, and offers a way back to all of them', async () => {
    const empty = mountSheet({ shown: 184 })
    expect(empty.find('[data-testid="m9-filter-apply"]').text()).toBe(
      t('items.filterApply', { n: 184 }),
    )
    // Nothing to reset while nothing is chosen.
    expect(empty.find('[data-testid="m9-filter-reset"]').exists()).toBe(false)

    const filtered = mountSheet({ selection: ['t-hyg'], shown: 9 })
    await filtered.find('[data-testid="m9-filter-reset"]').trigger('click')
    expect(filtered.emitted('update:selection')?.[0]).toEqual([[]])
  })

  it('forgets its query when it closes, so the next opening hides nothing', async () => {
    const sheet = mountSheet()
    await sheet.find('[data-testid="m9-filter-search"]').setValue('hyg')
    expect(sheet.find('[data-testid="m9-filter-tag-Diverses"]').exists()).toBe(false)

    await sheet.setProps({ isOpen: false })
    await sheet.setProps({ isOpen: true })

    expect(sheet.find('[data-testid="m9-filter-tag-Diverses"]').exists()).toBe(true)
  })

  it('applies live rather than on closing', async () => {
    // The footer confirms what the list behind the sheet already shows; a
    // sheet that only applies on dismissal makes every combination a guess.
    const sheet = mountSheet({ selection: ['t-hyg'] })
    await sheet.find('[data-testid="m9-filter-apply"]').trigger('click')

    expect(sheet.emitted('dismiss')).toHaveLength(1)
    expect(sheet.emitted('update:selection')).toBeUndefined()
  })
})

describe('GroupJumpSheet — the navigation the axis was used as (FR-24.8)', () => {
  it('lists the groups with their counts and marks the one on screen', async () => {
    const GroupJumpSheet = (await import('../GroupJumpSheet.vue')).default
    const sheet = mount(GroupJumpSheet, {
      props: {
        isOpen: true,
        groups: [
          { key: 'Unterwäsche', label: 'Unterwäsche', count: 6 },
          { key: 'Diverses', label: 'Diverses', count: 49 },
        ],
        current: 'Diverses',
      },
      global: { stubs: { SheetModal: { template: '<div><slot /></div>' }, SheetHead: true } },
    })

    expect(sheet.find('[data-testid="m9-jump-Unterwäsche"]').text()).toContain('6')
    expect(sheet.find('[data-testid="m9-jump-Diverses"]').classes()).toContain('current')
    expect(sheet.find('[data-testid="m9-jump-Unterwäsche"]').classes()).not.toContain('current')

    await sheet.find('[data-testid="m9-jump-Diverses"]').trigger('click')
    expect(sheet.emitted('jump')?.[0]).toEqual(['Diverses'])
  })
})
