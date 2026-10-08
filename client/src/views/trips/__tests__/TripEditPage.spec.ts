// @vitest-environment jsdom
/**
 * M22 (FR-2.7) — the screen where a trip's name, dates and roster stop being
 * frozen. What is asserted here is the date range: one field writes both days
 * (FR-2.1d, G-17), and a trip that already carries an inverted range — one
 * synced from a device that predates the bound, or imported — still renders
 * rather than being locked out of its own repair.
 */
import { IonInput, IonSelect } from '@ionic/vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TripEditPage from '../TripEditPage.vue'
import DateRangeField from '@/components/global/DateRangeField.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/api/tables'
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
      row: {
        trip_id: TRIP_ID,
        user_id: userId,
        role: i === 0 ? 'owner' : 'editor',
      },
    })),
  ] as never)
}

/** The account picker on the add row, or nothing. */
const addLinkSelect = (w: VueWrapper) =>
  w.findAllComponents(IonSelect).filter((c) => c.attributes('data-testid') === 'traveler-add-link')

/** Types a name into the add row and presses ＋. */
async function addTraveler(w: VueWrapper, name: string): Promise<void> {
  const input = w
    .findAllComponents(IonInput)
    .find((c) => c.attributes('data-testid') === 'traveler-add-input')!
  input.vm.$emit('ionInput', { detail: { value: name } })
  await w.find('[data-testid="traveler-add"]').trigger('click')
  await flushPromises()
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

const datesField = (w: VueWrapper) => w.findComponent(DateRangeField)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('M22 — the trip’s dates are one range (FR-2.1d, G-17)', () => {
  it('hands the stored range to the field', () => {
    seedTrip({ start_date: '2026-08-22', end_date: '2026-09-05' })

    const field = datesField(mountPage())
    expect(field.props('start')).toBe('2026-08-22')
    expect(field.props('end')).toBe('2026-09-05')
  })

  it('writes both days of a picked range in one update', async () => {
    seedTrip()
    const wrapper = mountPage()

    await datesField(wrapper).vm.$emit('update', '2026-10-09', '2026-10-18')

    expect(orchestratorFake.updateTrip).toHaveBeenCalledWith(TRIP_ID, {
      start_date: '2026-10-09',
      end_date: '2026-10-18',
    })
  })

  it('writes a start alone, and an emptied range as no dates (FR-2.1b)', async () => {
    seedTrip({ start_date: '2026-08-22', end_date: '2026-09-05' })
    const wrapper = mountPage()

    await datesField(wrapper).vm.$emit('update', '2026-08-20', '')
    expect(orchestratorFake.updateTrip).toHaveBeenLastCalledWith(TRIP_ID, {
      start_date: '2026-08-20',
      end_date: null,
    })

    await datesField(wrapper).vm.$emit('update', '', '')
    expect(orchestratorFake.updateTrip).toHaveBeenLastCalledWith(TRIP_ID, {
      start_date: null,
      end_date: null,
    })
  })

  it('writes nothing when the range picked is the one the trip has', async () => {
    seedTrip({ start_date: '2026-08-22', end_date: '2026-09-05' })
    const wrapper = mountPage()

    await datesField(wrapper).vm.$emit('update', '2026-08-22', '2026-09-05')

    expect(orchestratorFake.updateTrip).not.toHaveBeenCalled()
  })

  it('still renders an already-inverted range, so it can be repaired', () => {
    // A row synced from a device that predates the bound, or imported, keeps
    // its days: the picker never produces the pair, the field never hides it.
    seedTrip({ start_date: '2026-09-26', end_date: '2026-09-05' })

    const field = datesField(mountPage())
    expect(field.props('start')).toBe('2026-09-26')
    expect(field.props('end')).toBe('2026-09-05')
  })

  it('an archived trip’s dates stay read-only', () => {
    seedTrip({
      status: 'archived',
      start_date: '2026-08-22',
      end_date: '2026-09-05',
    })

    expect(datesField(mountPage()).props('readonly')).toBe(true)
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

describe('M22 — a traveller can be added as an account (FR-2.5, owner 2026-09-13)', () => {
  it('offers the same accounts as the rows above it', async () => {
    seedTrip()
    seedRoster(['u-alice', 'u-bob'])
    const wrapper = mountPage()
    await flushPromises()

    const options = addLinkSelect(wrapper)[0]!
      .findAll('ion-select-option')
      .map((o) => o.text())

    // One rule, one set of names: the add row can only offer what the server
    // would accept for the row it is about to create, which is `trip_members`
    // and not the directory — Carol is in the second and not in the first.
    expect(options).toEqual(['No account', 'Alice', 'Bob'])
  })

  it('adds the person already recorded as the account they are', async () => {
    seedTrip()
    seedRoster(['u-alice', 'u-bob'])
    const wrapper = mountPage()
    await flushPromises()

    addLinkSelect(wrapper)[0]!.vm.$emit('ionChange', {
      detail: { value: 'u-bob' },
    })
    await addTraveler(wrapper, 'Mia')

    // One act, not two: the account reaches the same call as the name, so
    // there is no window in which the person exists unlinked on any screen.
    expect(orchestratorFake.addTravelerToTrip).toHaveBeenCalledWith(TRIP_ID, 'Mia', 'u-bob')
  })

  it('returns to *no account* for the next person', async () => {
    seedTrip()
    seedRoster(['u-alice', 'u-bob'])
    const wrapper = mountPage()
    await flushPromises()

    addLinkSelect(wrapper)[0]!.vm.$emit('ionChange', {
      detail: { value: 'u-bob' },
    })
    await addTraveler(wrapper, 'Mia')
    await addTraveler(wrapper, 'Jon')

    // The first call carrying Bob is the positive signal: without it, „the
    // second call carries null" would pass against a picker that never
    // worked at all. A sticky value would quietly make the children of the
    // family the second parent's account.
    expect(orchestratorFake.addTravelerToTrip).toHaveBeenNthCalledWith(1, TRIP_ID, 'Mia', 'u-bob')
    expect(orchestratorFake.addTravelerToTrip).toHaveBeenNthCalledWith(2, TRIP_ID, 'Jon', null)
    expect(addLinkSelect(wrapper)[0]!.props('value')).toBe('')
  })

  it('is absent where the row picker is, and then adds nobody’s account (G-8)', async () => {
    seedTrip()
    seedRoster(['u-alice'])
    const wrapper = mountPage()
    await flushPromises()

    expect(addLinkSelect(wrapper)).toHaveLength(0)

    await addTraveler(wrapper, 'Mia')
    expect(orchestratorFake.addTravelerToTrip).toHaveBeenCalledWith(TRIP_ID, 'Mia', null)
  })
})
