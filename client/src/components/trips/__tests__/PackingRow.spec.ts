// @vitest-environment jsdom
/**
 * M4's row (FR-25.1/25.3), the one both kinds of row are now cut from.
 *
 * What is pinned here is the part that was written twice and had no unit at
 * all: the order of the four sentences under the name, which control the
 * left column offers, and the two places an item row and a child row are
 * deliberately not the same.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'

import PackingRow, { type PackingRowNotes } from '../PackingRow.vue'
import type { MasterItem, TripItem } from '@/types/domain'

function item(overrides: Partial<TripItem> = {}): TripItem {
  return {
    id: 'i1',
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: 'Zelt',
    weight_grams: null,
    value_cents: null,
    category_name: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    bought_from: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '',
    ...overrides,
  }
}

function notes(overrides: Partial<PackingRowNotes> = {}): PackingRowNotes {
  return {
    lock: null,
    ownClaim: null,
    skipped: null,
    packed: null,
    responsible: null,
    ...overrides,
  }
}

function mountRow(props: Partial<InstanceType<typeof PackingRow>['$props']> = {}) {
  return mount(PackingRow, {
    props: {
      item: item(),
      label: 'Zelt',
      testKey: 'Zelt',
      done: false,
      locked: false,
      closingPass: false,
      notes: notes(),
      ...props,
    },
  })
}

/** The single `<p>` the chain settled on, or null where it wrote none. */
function stamp(wrapper: ReturnType<typeof mountRow>): string | null {
  const stamps = wrapper.findAll('p.stamp')
  expect(stamps.length).toBeLessThanOrEqual(1)
  return stamps.length === 1 ? stamps[0]!.text() : null
}

describe('PackingRow — the sentence under the name', () => {
  it("G-3's lock outranks every other note", () => {
    const wrapper = mountRow({
      done: true,
      locked: true,
      notes: notes({
        lock: 'in progress by Andy',
        ownClaim: 'claimed by me',
        skipped: 'left behind',
        packed: 'packed by Andy',
      }),
    })

    expect(stamp(wrapper)).toBe('in progress by Andy')
    expect(wrapper.find('[data-testid="m4-lock-note"]').exists()).toBe(true)
  })

  it('my own claim outranks the skipped and packed notes', () => {
    const wrapper = mountRow({
      done: true,
      notes: notes({ ownClaim: 'claimed by me', skipped: 'left behind', packed: 'packed by Andy' }),
    })

    expect(stamp(wrapper)).toBe('claimed by me')
    expect(wrapper.find('[data-testid="m4-own-claim"]').exists()).toBe(true)
  })

  it("FR-5.5's left-behind note outranks the packed stamp", () => {
    const wrapper = mountRow({
      done: true,
      notes: notes({ skipped: 'left behind', packed: 'packed by Andy' }),
    })

    expect(stamp(wrapper)).toBe('left behind')
    expect(wrapper.find('[data-testid="m4-packed-stamp"]').exists()).toBe(false)
  })

  it('FR-25.17 stamps only a done row, and FR-25.19 appends who is responsible', () => {
    const open = mountRow({ notes: notes({ packed: 'packed by Andy', responsible: 'for Bea' }) })
    expect(stamp(open)).toBeNull()

    const done = mountRow({
      done: true,
      notes: notes({ packed: 'packed by Andy', responsible: 'for Bea' }),
    })
    expect(stamp(done)).toBe('packed by Andy · for Bea')
  })

  it('writes no sentence when the row has nothing to say', () => {
    expect(stamp(mountRow())).toBeNull()
  })
})

describe('PackingRow — the control column (UX-9)', () => {
  it('G-3: a row held by somebody else shows the lock and offers no stepper', () => {
    const wrapper = mountRow({ locked: true })

    expect(wrapper.find('.lock').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'QuantityStepper' }).exists()).toBe(false)
  })

  it("FR-9.3: the closing pass replaces the stepper with the row's keep/leave toggle", async () => {
    const wrapper = mountRow({ closingPass: true, item: item({ flag_unused: true }) })
    const toggle = wrapper.get('[data-testid="m4-pass-toggle-Zelt"]')

    expect(wrapper.findComponent({ name: 'QuantityStepper' }).exists()).toBe(false)
    expect(toggle.attributes('aria-pressed')).toBe('true')

    await toggle.trigger('click')
    expect(wrapper.emitted('passToggle')).toHaveLength(1)
  })

  it('the lock outranks the closing pass — a held row is not judged from here', () => {
    const wrapper = mountRow({ closingPass: true, locked: true })

    expect(wrapper.find('.lock').exists()).toBe(true)
    expect(wrapper.find('[data-testid="m4-pass-toggle-Zelt"]').exists()).toBe(false)
  })

  it('the stepper reports through the row, not around it', async () => {
    const wrapper = mountRow()
    const stepper = wrapper.findComponent({ name: 'QuantityStepper' })

    stepper.vm.$emit('increment')
    stepper.vm.$emit('toggle')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('increment')).toHaveLength(1)
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })
})

describe('PackingRow — where the two kinds differ', () => {
  const master: MasterItem = {
    id: 'm1',
    name: 'Zelt',
    weight_grams: null,
    value_cents: null,
    icon: '⛺',
  }

  it('an item row names itself: mark, prep badge and its own end glyphs', () => {
    const wrapper = mountRow({
      master,
      prepCount: 2,
      item: item({ flag_unused: true, late_packer: true, mode: 'buy_before' }),
      edgeAvatar: { variant: 'packer', id: 'u1', name: 'Andy' },
    })

    expect(wrapper.findComponent({ name: 'ItemMark' }).exists()).toBe(true)
    expect(wrapper.get('[data-testid="m4-prep-badge-Zelt"]').text()).toContain('2')
    expect(wrapper.find('[data-testid="m4-unused-Zelt"]').exists()).toBe(true)
    expect(wrapper.find('.late-icon').exists()).toBe(true)
    expect(wrapper.find('.mode-icon').exists()).toBe(true)
    expect(wrapper.find('.row-end').exists()).toBe(true)
  })

  it('a child row carries neither mark nor prep badge — the cluster head does (FR-28.4)', () => {
    const wrapper = mountRow({
      variant: 'child',
      master,
      prepCount: 2,
      item: item({ flag_unused: true, late_packer: true, mode: 'buy_before' }),
    })

    expect(wrapper.findComponent({ name: 'ItemMark' }).exists()).toBe(false)
    expect(wrapper.find('[data-testid="m4-prep-badge-Zelt"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m4-unused-Zelt"]').exists()).toBe(false)
    expect(wrapper.find('.late-icon').exists()).toBe(false)
    expect(wrapper.find('.mode-icon').exists()).toBe(false)
  })

  it("a child row's end column is the edge avatar alone", () => {
    const wrapper = mountRow({
      variant: 'child',
      edgeAvatar: { variant: 'packer', id: 'u1', name: 'Andy' },
    })

    const avatars = wrapper.findAllComponents({ name: 'UserAvatar' })
    expect(wrapper.find('.row-end').exists()).toBe(false)
    expect(avatars.at(-1)!.props('variant')).toBe('packer')
  })

  it('a child row keeps the avatar column open with nobody in it; an item row does not', () => {
    const child = mountRow({ variant: 'child', traveler: null })
    expect(child.find('.row-avatar').exists()).toBe(true)

    const own = mountRow({ traveler: null })
    expect(own.find('.row-avatar').exists()).toBe(false)
  })

  it('the two kinds are addressed by two prefixes over one key', () => {
    expect(mountRow().attributes('data-testid')).toBe('m4-row-Zelt')
    expect(mountRow({ variant: 'child', testKey: 'Zelt-Bea' }).attributes('data-testid')).toBe(
      'm4-child-Zelt-Bea',
    )
  })
})

describe('PackingRow — opening and holding', () => {
  it('a tap opens, a long press is reported to the caller that owns the timer', async () => {
    const wrapper = mountRow()

    await wrapper.trigger('click')
    await wrapper.trigger('contextmenu')
    await wrapper.trigger('pointerdown')
    await wrapper.trigger('pointerup')

    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.emitted('menu')).toHaveLength(1)
    expect(wrapper.emitted('pressStart')).toHaveLength(1)
    expect(wrapper.emitted('pressEnd')).toHaveLength(1)
  })
})
