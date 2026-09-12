// @vitest-environment jsdom
/**
 * M22 (FR-2.7) — the screen where a trip's name, dates and roster stop being
 * frozen. What is asserted here is the date pair: the two fields bound each
 * other (FR-2.1d), and a trip that already carries an inverted range — one
 * synced from a device that predates the bound, or imported — is still
 * editable rather than locked out of its own repair.
 */
import { IonSelect } from '@ionic/vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TripEditPage from '../TripEditPage.vue'
import DateField from '@/components/global/DateField.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

const TRIP_ID = 'trip-1'

const DIRECTORY = [
  { user_id: 'u-alice', display_name: 'Alice' },
  { user_id: 'u-bob', display_name: 'Bob' },
  // On the instance, not on this trip — the account the picker must leave out.
  { user_id: 'u-carol', display_name: 'Carol' },
]

const orchestratorFake = {
  ...tripScreenStub(),
  updateTrip: vi.fn(),
  renameTraveler: vi.fn(),
  linkTraveler: vi.fn(),
  addTravelerToTrip: vi.fn(),
  removeTraveler: vi.fn(),
  packedRowsOf: vi.fn(() => 0),
  fetchUsers: vi.fn(async () => DIRECTORY),
  fetchMe: vi.fn(async () => ({
    user_id: 'u-alice',
    display_name: 'Alice',
    is_instance_admin: false,
  })),
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

const TRAVELER_ID = 'trv-1'

/** One traveller, plus as many of the two accounts as the case needs. */
function seedRoster(memberIds: string[], linkedUserId: string | null = null) {
  useTripStore().applyChanges([
    {
      seq: 2,
      table: TABLE.travelers,
      id: TRAVELER_ID,
      deleted: false,
      row: { trip_id: TRIP_ID, name: 'Zoe', linked_user_id: linkedUserId },
    },
    ...memberIds.map((userId, i) => ({
      seq: 3 + i,
      table: TABLE.tripMembers,
      id: `mem-${userId}`,
      deleted: false,
      row: { trip_id: TRIP_ID, user_id: userId, role: i === 0 ? 'owner' : 'editor' },
    })),
  ] as never)
}

/** The account picker of the one traveller row, or nothing. */
const linkSelect = (w: VueWrapper) =>
  w
    .findAllComponents(IonSelect)
    .filter((c) => c.attributes('data-testid')?.startsWith('traveler-link-'))

function mountPage(): VueWrapper {
  return mount(TripEditPage, {
    props: { tripId: TRIP_ID },
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
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

describe('M22 — a traveller can be recorded as an account (FR-2.5, ADR-058)', () => {
  it('offers the trip’s members, and nobody else', async () => {
    seedTrip()
    seedRoster(['u-alice', 'u-bob'])
    const wrapper = mountPage()
    await flushPromises()

    const options = linkSelect(wrapper)[0]!
      .findAll('ion-select-option')
      .map((o) => o.text())

    // „No account" plus the two members — and not Carol, who is in the
    // directory and not on this trip. The server refuses a link outside
    // `trip_members` (`not_a_trip_member`), so a picker offering her would
    // earn a rejection toast for a name it had just shown as a choice.
    expect(options).toEqual(['No account', 'Alice', 'Bob'])
  })

  it('records the picked account, and clears it again', async () => {
    seedTrip()
    seedRoster(['u-alice', 'u-bob'])
    const wrapper = mountPage()
    await flushPromises()

    const select = linkSelect(wrapper)[0]!
    select.vm.$emit('ionChange', { detail: { value: 'u-bob' } })
    expect(orchestratorFake.linkTraveler).toHaveBeenCalledWith(TRIP_ID, TRAVELER_ID, 'u-bob')

    // `''` is the select's value for *nobody* — `null` would make `IonSelect`
    // render its placeholder instead of the option — so the screen is what
    // has to turn it back into the clear the store understands.
    select.vm.$emit('ionChange', { detail: { value: '' } })
    expect(orchestratorFake.linkTraveler).toHaveBeenLastCalledWith(TRIP_ID, TRAVELER_ID, null)
  })

  it('shows the account a traveller already carries', async () => {
    seedTrip()
    seedRoster(['u-alice', 'u-bob'], 'u-bob')
    const wrapper = mountPage()
    await flushPromises()

    expect(linkSelect(wrapper)[0]!.props('value')).toBe('u-bob')
  })

  it('is absent on a trip with nobody to be told (G-8)', async () => {
    seedTrip()
    seedRoster(['u-alice'])
    const wrapper = mountPage()
    await flushPromises()

    // An unshared trip — and every Local and Single-User one, which have no
    // member rows at all — can only link the traveller to the one account
    // that is never notified about its own assignment. The positive control
    // is the case above: the same mount with a second member renders it.
    expect(linkSelect(wrapper)).toHaveLength(0)
    expect(wrapper.find('[data-testid="traveler-link-note"]').exists()).toBe(false)
  })

  it('is read-only on an archived trip', async () => {
    seedTrip({ status: 'archived' })
    seedRoster(['u-alice', 'u-bob'])
    const wrapper = mountPage()
    await flushPromises()

    expect(linkSelect(wrapper)[0]!.props('disabled')).toBe(true)
  })
})
