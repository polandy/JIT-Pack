// @vitest-environment jsdom
/**
 * M22 (FR-2.7) — the screen where a trip's name, dates and roster stop being
 * frozen. What is asserted here is the date pair: the two fields bound each
 * other (FR-2.1d), and a trip that already carries an inverted range — one
 * synced from a device that predates the bound, or imported — is still
 * editable rather than locked out of its own repair.
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TripEditPage from '../TripEditPage.vue'
import DateField from '@/components/global/DateField.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'

const TRIP_ID = 'trip-1'

const orchestratorFake = {
  ...tripScreenStub(),
  updateTrip: vi.fn(),
  renameTraveler: vi.fn(),
  addTravelerToTrip: vi.fn(),
  removeTraveler: vi.fn(),
  packedRowsOf: vi.fn(() => 0),
}

function seedTrip(fields: Record<string, unknown> = {}) {
  useTripStore().applyChanges([
    {
      seq: 1,
      table: TABLE.trips,
      id: TRIP_ID,
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'planning', ...fields },
    },
  ] as never)
}

function mountPage(): VueWrapper {
  return mount(TripEditPage, {
    props: { tripId: TRIP_ID },
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

const fields = (w: VueWrapper) => {
  const [start, end] = w.findAllComponents(DateField)
  return { start: start!, end: end! }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('M22 — the two dates bound each other (FR-2.1d)', () => {
  it('offers no end before the trip’s start', () => {
    seedTrip({ start_date: '2026-08-22', end_date: null })

    expect(fields(mountPage()).end.props('min')).toBe('2026-08-22')
  })

  it('offers no start after the trip’s end', () => {
    seedTrip({ start_date: null, end_date: '2026-09-05' })

    expect(fields(mountPage()).start.props('max')).toBe('2026-09-05')
  })

  it('leaves the counterpart unbounded while it is empty', () => {
    seedTrip()

    // FR-2.1b: the year is the one required temporal fact. A trip with no
    // dates yet must reach any day in either field.
    const f = fields(mountPage())
    expect(f.start.props('max')).toBe('')
    expect(f.end.props('min')).toBe('')
  })

  it('still lets an already-inverted range be repaired from either end', async () => {
    // The bound is new; rows are not. A trip synced from a device that
    // predates it — or imported — must not be locked out of its own repair,
    // so the guard constrains the *picker* and never the field's own value.
    seedTrip({ start_date: '2026-09-26', end_date: '2026-09-05' })
    const wrapper = mountPage()

    expect(fields(wrapper).start.props('value')).toBe('2026-09-26')
    expect(fields(wrapper).end.props('value')).toBe('2026-09-05')

    await fields(wrapper).start.vm.$emit('update', '2026-09-01')

    expect(orchestratorFake.updateTrip).toHaveBeenCalledWith(TRIP_ID, {
      start_date: '2026-09-01',
      end_date: '2026-09-05',
    })
  })

  it('an archived trip’s dates stay read-only', () => {
    seedTrip({ status: 'archived', start_date: '2026-08-22', end_date: '2026-09-05' })

    const f = fields(mountPage())
    expect(f.start.props('readonly')).toBe(true)
    expect(f.end.props('readonly')).toBe(true)
  })
})
