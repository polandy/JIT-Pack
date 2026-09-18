// @vitest-environment jsdom
/**
 * FR-25.28 — the for-whom strip over an item that exists.
 *
 * The rules are `domain/membership.ts`'s and are pinned there. What only this
 * component can answer is pinned here: that **every** control writes through
 * the one `apply()` that asks first, that a question holds the write until it
 * is answered and is asked in the strip, and that G-3 covers the cluster and
 * not the row — a conversion rewrites every instance, so a claim on a sibling
 * freezes a strip opened from a free row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ForWhomStrip from '../ForWhomStrip.vue'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import type { MembershipTarget } from '@/domain/membership'
import type { TripItem } from '@/types/domain'

const orchestratorFake = {
  lockHolder: vi.fn((_tripId: string, _item: TripItem) => null as string | null),
  setMembership: vi.fn(),
}

const TRIP = 't1'
const KEY = 'hosen'

function row(id: string, extra: Partial<TripItem> = {}) {
  useTripStore().applyChange({
    seq: 0,
    table: 'trip_items',
    id,
    deleted: false,
    row: {
      trip_id: TRIP,
      name: 'Kurze Hosen',
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      source_item_id: null,
      assigned_traveler_id: null,
      ...extra,
    },
  })
}

function traveler(id: string, name: string) {
  useTripStore().applyChange({
    seq: 0,
    table: 'travelers',
    id,
    deleted: false,
    row: { trip_id: TRIP, name },
  })
}

function mountStrip(itemId: string, props: Record<string, unknown> = {}) {
  return mount(ForWhomStrip, {
    props: {
      tripId: TRIP,
      itemId,
      testKey: KEY,
      participants: [
        { user_id: 'u-bob', display_name: 'Bob', avatar_url: null, role: 'editor' as const },
      ],
      ...props,
    },
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
  })
}

/** The target the last write carried — the strip's whole output. */
function lastTarget(): MembershipTarget | undefined {
  return orchestratorFake.setMembership.mock.calls.at(-1)?.[2] as MembershipTarget | undefined
}

const tap = (wrapper: ReturnType<typeof mountStrip>, testid: string) =>
  wrapper.get(`[data-testid="${testid}"]`).trigger('click')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  orchestratorFake.lockHolder.mockReturnValue(null)
  traveler('tr-a', 'Andy')
  traveler('tr-b', 'Leonardo')
  traveler('tr-c', 'Mia')
})

describe('ForWhomStrip — a tap is a write (FR-25.28, G-5)', () => {
  it('lights Gemeinsam on a shared row, and no traveler', () => {
    row('ti-1')
    const wrapper = mountStrip('ti-1')

    expect(wrapper.get(`[data-testid="for-whom-shared-${KEY}"]`).attributes('aria-pressed')).toBe(
      'true',
    )
    expect(wrapper.get(`[data-testid="for-whom-${KEY}-Andy"]`).attributes('aria-pressed')).toBe(
      'false',
    )
  })

  it('hands a shared row to the first traveler tapped, keeping its amount', async () => {
    row('ti-1', { quantity: 4 })
    const wrapper = mountStrip('ti-1')

    await tap(wrapper, `for-whom-${KEY}-Leonardo`)

    // The planner re-points the row and the amount it carries (ADR-036); the
    // strip only asks for the traveler at the floor of one and lets it decide.
    expect(lastTarget()).toEqual({
      kind: 'perPerson',
      members: [{ traveler_id: 'tr-b', quantity: 1 }],
    })
  })

  it('enlarges to everybody with Alle, leaving a chosen amount standing (FR-25.21c)', async () => {
    row('ti-1', { assigned_traveler_id: 'tr-b', quantity: 3 })
    const wrapper = mountStrip('ti-1')

    await tap(wrapper, `for-whom-all-${KEY}`)

    expect(lastTarget()).toEqual({
      kind: 'perPerson',
      members: [
        { traveler_id: 'tr-a', quantity: 1 },
        { traveler_id: 'tr-b', quantity: 3 },
        { traveler_id: 'tr-c', quantity: 1 },
      ],
    })
  })

  it('turns the last traveler leaving into gemeinsam, and asks nothing', async () => {
    row('ti-1', { assigned_traveler_id: 'tr-b', quantity: 3, packed_count: 1 })
    const wrapper = mountStrip('ti-1')

    await tap(wrapper, `for-whom-${KEY}-Leonardo`)

    expect(wrapper.find(`[data-testid="for-whom-ask-${KEY}"]`).exists()).toBe(false)
    expect(lastTarget()).toEqual({ kind: 'shared' })
  })

  it('offers no stepper on M4 and one per lit traveler in M5', async () => {
    row('ti-1', { assigned_traveler_id: 'tr-a', quantity: 2 })
    expect(mountStrip('ti-1').find(`[data-testid="for-whom-plus-${KEY}-Andy"]`).exists()).toBe(
      false,
    )

    const m5 = mountStrip('ti-1', { steppers: true })
    expect(m5.find(`[data-testid="for-whom-plus-${KEY}-Mia"]`).exists()).toBe(false)
    await tap(m5, `for-whom-plus-${KEY}-Andy`)
    expect(lastTarget()).toEqual({
      kind: 'perPerson',
      members: [{ traveler_id: 'tr-a', quantity: 3 }],
    })
  })
})

describe('ForWhomStrip — a question is asked in the strip and holds the write', () => {
  beforeEach(() => {
    row('ti-a', { assigned_traveler_id: 'tr-a', quantity: 2 })
    row('ti-b', { assigned_traveler_id: 'tr-b', quantity: 3, packed_count: 1 })
  })

  it('asks before removing a traveler whose row has progress, and writes only on yes', async () => {
    const wrapper = mountStrip('ti-a')

    await tap(wrapper, `for-whom-${KEY}-Leonardo`)

    expect(orchestratorFake.setMembership).not.toHaveBeenCalled()
    expect(wrapper.get(`[data-testid="for-whom-ask-${KEY}"]`).text()).toContain('Leonardo')
    // The summary line gives way to the question rather than sitting beside it.
    expect(wrapper.find(`[data-testid="for-whom-summary-${KEY}"]`).exists()).toBe(false)

    await tap(wrapper, `for-whom-yes-${KEY}`)

    expect(lastTarget()).toEqual({
      kind: 'perPerson',
      members: [{ traveler_id: 'tr-a', quantity: 2 }],
    })
    expect(wrapper.find(`[data-testid="for-whom-ask-${KEY}"]`).exists()).toBe(false)
  })

  it('writes nothing on Abbrechen, and gives the summary back', async () => {
    const wrapper = mountStrip('ti-a')

    await tap(wrapper, `for-whom-${KEY}-Leonardo`)
    await tap(wrapper, `for-whom-no-${KEY}`)

    expect(orchestratorFake.setMembership).not.toHaveBeenCalled()
    expect(wrapper.find(`[data-testid="for-whom-summary-${KEY}"]`).exists()).toBe(true)
  })

  it('names the sum before collapsing two travelers into one row (FR-25.21b)', async () => {
    const wrapper = mountStrip('ti-a')

    await tap(wrapper, `for-whom-shared-${KEY}`)

    expect(orchestratorFake.setMembership).not.toHaveBeenCalled()
    expect(wrapper.get(`[data-testid="for-whom-ask-${KEY}"]`).text()).toContain('5')
  })

  it('holds every toggle still while a question stands', async () => {
    const wrapper = mountStrip('ti-a')
    await tap(wrapper, `for-whom-shared-${KEY}`)

    // A tap that got through anyway — a disabled button fires no click, so
    // the component's own guard is what is under test here.
    await wrapper.findComponent({ name: 'ForWhomToggles' }).vm.$emit('toggle', 'tr-c')

    expect(orchestratorFake.setMembership).not.toHaveBeenCalled()
    expect(wrapper.get(`[data-testid="for-whom-${KEY}-Mia"]`).attributes('disabled')).toBeDefined()
  })
})

describe('ForWhomStrip — G-3 covers the cluster, not the row', () => {
  beforeEach(() => {
    row('ti-a', { assigned_traveler_id: 'tr-a' })
    row('ti-b', { assigned_traveler_id: 'tr-b' })
    // Andy's instance is claimed by somebody else; the strip is opened from
    // Leonardo's, which is free. Asking the opened row alone answers "not
    // locked", and the write would rewrite Andy's row anyway.
    orchestratorFake.lockHolder.mockImplementation((_tripId, item) =>
      item.id === 'ti-a' ? 'u-bob' : null,
    )
  })

  it('reads and does not write when a sibling row is claimed', async () => {
    const wrapper = mountStrip('ti-b')

    expect(wrapper.get(`[data-testid="for-whom-${KEY}-Mia"]`).attributes('disabled')).toBeDefined()
    await wrapper.findComponent({ name: 'ForWhomToggles' }).vm.$emit('toggle', 'tr-c')
    await wrapper.findComponent({ name: 'ForWhomToggles' }).vm.$emit('shared')

    expect(orchestratorFake.setMembership).not.toHaveBeenCalled()
    expect(wrapper.find(`[data-testid="for-whom-ask-${KEY}"]`).exists()).toBe(false)
  })

  it('says who is packing, because a frozen control with no reason is a dead end', () => {
    const wrapper = mountStrip('ti-b')

    expect(wrapper.get(`[data-testid="for-whom-lock-${KEY}"]`).text()).toContain('Bob')
  })

  it('writes again once the claim is gone — the freeze was the claim, not the mount', async () => {
    orchestratorFake.lockHolder.mockReturnValue(null)
    const wrapper = mountStrip('ti-b')

    await tap(wrapper, `for-whom-${KEY}-Mia`)

    expect(orchestratorFake.setMembership).toHaveBeenCalledTimes(1)
  })

  it('honours a caller that is read-only for a reason of its own', async () => {
    orchestratorFake.lockHolder.mockReturnValue(null)
    const wrapper = mountStrip('ti-b', { locked: true })

    await wrapper.findComponent({ name: 'ForWhomToggles' }).vm.$emit('toggle', 'tr-c')

    expect(orchestratorFake.setMembership).not.toHaveBeenCalled()
  })
})
