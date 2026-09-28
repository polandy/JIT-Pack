// @vitest-environment jsdom
/**
 * G-17 / ADR-080: one field for a first and a last day. The tap rules are
 * `lib/dateRange.spec.ts`; what is pinned here is the component around them —
 * what the field shows, that the sheet hands back a range only on its button,
 * and that the bounds reach the calendar as days that cannot be tapped.
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import DateRangeField from '../DateRangeField.vue'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { formatDayRange, setLocale } from '@/i18n'

const SheetModalStub = {
  name: 'SheetModal',
  props: ['isOpen'],
  emits: ['dismiss', 'present'],
  template: '<div v-if="isOpen" data-stub="sheet"><slot /></div>',
}

const TODAY = '2026-09-27'

function mountField(props: Record<string, unknown> = {}): VueWrapper {
  return mount(DateRangeField, {
    props: {
      label: 'Reisedaten',
      startLabel: 'Beginn',
      endLabel: 'Ende',
      testid: 'dates',
      start: '',
      end: '',
      ...props,
    },
    global: {
      stubs: { SheetModal: SheetModalStub, SheetHead: true },
      provide: { [ORCHESTRATOR]: { today: () => TODAY } },
    },
  })
}

const day = (w: VueWrapper, iso: string) => w.get(`[data-day="${iso}"]`)

describe('DateRangeField (G-17, ADR-080)', () => {
  beforeEach(() => setLocale('de'))

  it('shows a whole range through formatDayRange, with its length', () => {
    const w = mountField({ start: '2026-10-09', end: '2026-10-18' })
    expect(w.get('[data-testid="dates-value"]').text()).toBe(
      formatDayRange('2026-10-09', '2026-10-18'),
    )
    expect(w.get('[data-testid="dates-days"]').text()).toBe('10 Tage')
  })

  it('shows the catalogue placeholder and no length when empty', () => {
    const w = mountField()
    expect(w.text()).toContain('Zeitraum wählen')
    expect(w.find('[data-testid="dates-days"]').exists()).toBe(false)
  })

  it('shows one day alone, as an older row may hold it', () => {
    expect(mountField({ end: '2026-10-18' }).get('[data-testid="dates-value"]').text()).toBe(
      '18.10.2026',
    )
  })

  it('picks a range in two taps and hands it back on the button', async () => {
    const w = mountField()
    await w.get('[data-testid="dates"]').trigger('click')

    await day(w, '2026-10-09').trigger('click')
    expect(w.get('[data-testid="dates-hint"]').text()).toBe('Letzten Tag antippen')
    await day(w, '2026-10-18').trigger('click')
    expect(w.get('[data-testid="dates-hint"]').text()).toBe('10 Tage')
    expect(w.emitted('update')).toBeUndefined()

    await w.get('[data-testid="dates-apply"]').trigger('click')
    expect(w.emitted('update')).toEqual([['2026-10-09', '2026-10-18']])
    expect(w.find('[data-stub="sheet"]').exists()).toBe(false)
  })

  it('moves the end alone once its side is chosen', async () => {
    const w = mountField({ start: '2026-10-09', end: '2026-10-18' })
    await w.get('[data-testid="dates"]').trigger('click')
    await w.get('[data-testid="dates-end"]').trigger('click')
    await day(w, '2026-10-19').trigger('click')
    await w.get('[data-testid="dates-apply"]').trigger('click')

    expect(w.emitted('update')).toEqual([['2026-10-09', '2026-10-19']])
  })

  it('sets an end alone when its side is chosen first (FR-2.1b)', async () => {
    const w = mountField()
    await w.get('[data-testid="dates"]').trigger('click')
    await w.get('[data-testid="dates-end"]').trigger('click')
    await day(w, '2026-12-31').trigger('click')
    await w.get('[data-testid="dates-apply"]').trigger('click')

    expect(w.emitted('update')).toEqual([['', '2026-12-31']])
  })

  it('leaving the sheet without its button changes nothing', async () => {
    const w = mountField({ start: '2026-10-09', end: '2026-10-18' })
    await w.get('[data-testid="dates"]').trigger('click')
    await day(w, '2026-10-01').trigger('click')
    await w.findComponent(SheetModalStub).vm.$emit('dismiss')

    expect(w.emitted('update')).toBeUndefined()
  })

  it('empties a range with Leeren and the button', async () => {
    const w = mountField({ start: '2026-10-09', end: '2026-10-18' })
    await w.get('[data-testid="dates"]').trigger('click')
    await w.get('[data-testid="dates-clear"]').trigger('click')
    await w.get('[data-testid="dates-apply"]').trigger('click')

    expect(w.emitted('update')).toEqual([['', '']])
  })

  it('offers nothing to apply while nothing is picked and nothing was set', async () => {
    const w = mountField()
    await w.get('[data-testid="dates"]').trigger('click')
    expect(w.get('[data-testid="dates-apply"]').attributes('disabled')).toBeDefined()
  })

  it('lists the months between its bounds and disables every day outside them', async () => {
    const w = mountField({ min: '2026-10-09', max: '2026-10-18' })
    await w.get('[data-testid="dates"]').trigger('click')

    expect(w.findAll('[data-month]').map((m) => m.attributes('data-month'))).toEqual(['2026-10'])
    expect(day(w, '2026-10-08').attributes('disabled')).toBeDefined()
    expect(day(w, '2026-10-19').attributes('disabled')).toBeDefined()
    // Both halves: "every day is disabled" would pass the two lines above.
    expect(day(w, '2026-10-09').attributes('disabled')).toBeUndefined()
    expect(day(w, '2026-10-18').attributes('disabled')).toBeUndefined()
  })

  it('without bounds reaches around today, past and future alike', async () => {
    const w = mountField()
    await w.get('[data-testid="dates"]').trigger('click')

    const months = w.findAll('[data-month]').map((m) => m.attributes('data-month'))
    expect(months[0]).toBe('2025-09')
    expect(months.at(-1)).toBe('2028-09')
    expect(w.get(`[data-day="${TODAY}"]`).classes()).toContain('today')
  })

  it('loads earlier and later months on an open side, and offers neither on a bounded one', async () => {
    const w = mountField()
    await w.get('[data-testid="dates"]').trigger('click')
    const listed = () => w.findAll('[data-month]').map((m) => m.attributes('data-month'))

    await w.get('[data-testid="dates-earlier"]').trigger('click')
    expect(listed()[0]).toBe('2024-09')
    await w.get('[data-testid="dates-later"]').trigger('click')
    expect(listed().at(-1)).toBe('2029-09')

    const bounded = mountField({ min: '2026-10-09', max: '2026-10-18' })
    await bounded.get('[data-testid="dates"]').trigger('click')
    expect(bounded.find('[data-testid="dates-earlier"]').exists()).toBe(false)
    expect(bounded.find('[data-testid="dates-later"]').exists()).toBe(false)
  })

  it('keeps the months where they are while days are tapped', async () => {
    const w = mountField()
    await w.get('[data-testid="dates"]').trigger('click')
    const first = w.find('[data-month]').attributes('data-month')

    await day(w, '2027-03-01').trigger('click')

    expect(w.find('[data-month]').attributes('data-month')).toBe(first)
  })

  it('opens nothing while read-only (G-3)', async () => {
    const w = mountField({ readonly: true, start: '2026-10-09', end: '2026-10-18' })
    await w.get('[data-testid="dates"]').trigger('click')
    expect(w.find('[data-stub="sheet"]').exists()).toBe(false)
  })
})
