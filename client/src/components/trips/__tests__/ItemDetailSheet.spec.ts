// @vitest-environment jsdom
/**
 * M5 — the FR-9.1 trip-feedback control behind *Details ▾* (UI-Spec M5).
 *
 * The sheet listed the two flags as a read-only note, which made *unused*
 * unwritable anywhere in the app — and *unused* is the half M14's
 * assistant is mostly about (FR-9.2, overpacked). These cases pin the
 * control: it exists on a live trip, it writes through the orchestrator,
 * and it is absent before the trip runs, where a judgement about it
 * would be meaningless.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ItemDetailSheet from '../ItemDetailSheet.vue'
import { useTripStore } from '@/stores/tripStore'
import type { Trip, TripItem, TripStatus } from '@/types/domain'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

const orchestratorFake = {
  syncStatus: { state: { value: 'synced' } },
  setReviewFlag: vi.fn(),
  setLatePacker: vi.fn(),
  packToggle: vi.fn(),
  setPacker: vi.fn(),
  lockHolder: vi.fn(() => null as string | null),
}

/** Two accounts on the trip — what Server Mode looks like (FR-4.5). */
const MEMBERS = [
  { user_id: 'u-alice', display_name: 'Alice', avatar_url: null, role: 'owner' as const },
  { user_id: 'u-bob', display_name: 'Bob', avatar_url: null, role: 'editor' as const },
]

function seedTrip(
  status: TripStatus,
  flags: Partial<Pick<TripItem, 'flag_unused' | 'flag_missing'>> = {},
) {
  const store = useTripStore()
  const trip: Omit<Trip, 'id'> = {
    name: 'Herbst Tessin',
    status,
    year: 2026,
    start_date: null,
    end_date: null,
    duration_days: null,
    series_id: null,
    series_name: null,
    attributes: null,
    imported: false,
  }
  store.applyChange({ seq: 0, table: 'trips', id: 't1', deleted: false, row: trip })

  const item: Omit<TripItem, 'id'> = {
    trip_id: 't1',
    name: 'Regenhose',
    quantity: 1,
    packed_count: 1,
    state: 'packed',
    mode: 'pack',
    flag_unused: false,
    flag_missing: false,
    ...flags,
  } as Omit<TripItem, 'id'>
  store.applyChange({ seq: 0, table: 'trip_items', id: 'ti1', deleted: false, row: item })
  return store
}

/** Membership is what makes somebody assignable (FR-4.5 / P-3). */
function seedMembers(store: ReturnType<typeof useTripStore>, userIds: string[]) {
  userIds.forEach((user_id, i) =>
    store.applyChange({
      seq: 0,
      table: 'trip_members',
      id: `m${i}`,
      deleted: false,
      row: { trip_id: 't1', user_id, role: i === 0 ? 'owner' : 'editor' },
    }),
  )
}

function mountSheet(participants: typeof MEMBERS = [], currentUserId: string | null = 'u-alice') {
  return mount(ItemDetailSheet, {
    props: { tripId: 't1', itemId: 'ti1', participants, currentUserId },
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

/** The flags live behind *Details ▾*, folded on open (FR-25.7 idiom). */
async function openDetails(wrapper: ReturnType<typeof mountSheet>) {
  await wrapper.get('[data-testid="m5-details"]').trigger('click')
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  orchestratorFake.lockHolder.mockReturnValue(null)
})

describe('M5 FR-9.1 flags', () => {
  it('writes the unused flag through the orchestrator on an active trip', async () => {
    seedTrip('active')
    const wrapper = await openDetails(mountSheet())

    await wrapper.get('[data-testid="m5-flag-unused"]').trigger('ionChange', {
      detail: { checked: true },
    })

    expect(orchestratorFake.setReviewFlag).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'ti1' }),
      'unused',
      true,
    )
  })

  // A view can name a key no catalogue defines; `t` then renders the key
  // itself and the integrity test — which only compares the two catalogues
  // to each other — stays green.
  it('spells out what each flag means', async () => {
    seedTrip('active')
    const wrapper = await openDetails(mountSheet())

    expect(wrapper.text()).toContain('Taken along, never needed')
    expect(wrapper.text()).toContain('Was needed and was not there')
  })

  it('takes a flag back again — the control is a judgement, not a stamp', async () => {
    seedTrip('active', { flag_missing: true })
    const wrapper = await openDetails(mountSheet())

    await wrapper.get('[data-testid="m5-flag-missing"]').trigger('ionChange', {
      detail: { checked: false },
    })

    expect(orchestratorFake.setReviewFlag).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'ti1' }),
      'missing',
      false,
    )
  })

  it('offers no flag control before the trip runs (FR-9.1: active trips only)', async () => {
    seedTrip('planning')
    const wrapper = await openDetails(mountSheet())

    expect(wrapper.find('[data-testid="m5-flag-unused"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m5-flag-missing"]').exists()).toBe(false)
  })

  it('keeps the unused window open on the archived trip, where M14 shows what it was worth (FR-9.3)', async () => {
    seedTrip('archived')
    const wrapper = await openDetails(mountSheet())

    // FR-9.1's active-only gate was true of *setting* a flag in the moment
    // and false of correcting it: the assistant runs on the archived trip,
    // so the first sight of what a flag did used to be the moment it could
    // no longer be given or taken back.
    expect(wrapper.find('[data-testid="m5-flag-unused"]').exists()).toBe(true)

    await wrapper.get('[data-testid="m5-flag-unused"]').trigger('ionChange', {
      detail: { checked: true },
    })
    expect(orchestratorFake.setReviewFlag).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'ti1' }),
      'unused',
      true,
    )
  })

  it('offers no *missing* control once the trip is archived — it is stamped, not judged (FR-9.3)', async () => {
    seedTrip('archived')
    const wrapper = await openDetails(mountSheet())

    // A thing bought after the trip is not a thing that was missing on it.
    expect(wrapper.find('[data-testid="m5-flag-missing"]').exists()).toBe(false)
  })

  it('shows an unused flag in the glance row, like missing (UI-Spec M5)', () => {
    seedTrip('active', { flag_unused: true })

    expect(mountSheet().get('[data-testid="m5-glance"]').text()).toContain('Unused')
  })
})

/**
 * G-3: an item somebody else is packing is "non-interactive for others
 * except viewing", and it renders "the locker's avatar and name". The
 * padlock stopped at M4's row — one tap deeper the sheet handed the row
 * over in full, which is the collision G-3 exists to prevent.
 */
describe('M5 respects the G-3 lock', () => {
  function seedLocked(holder: string | null) {
    const store = seedTrip('active')
    store.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'ti1',
      deleted: false,
      row: {
        ...store.getItems('t1')[0]!,
        state: 'packing_now',
        packing_now_by: holder,
        packing_now_at: new Date().toISOString(),
      },
    })
    orchestratorFake.lockHolder.mockReturnValue(holder)
    return store
  }

  it('names who is holding it', () => {
    seedLocked('user-sarah')
    const wrapper = mount(ItemDetailSheet, {
      props: {
        tripId: 't1',
        itemId: 'ti1',
        participants: [
          { user_id: 'user-sarah', display_name: 'Sarah', avatar_url: null, role: 'editor' },
        ],
      },
      global: { provide: { orchestrator: orchestratorFake } },
    })

    expect(wrapper.get('[data-testid="m5-lock"]').text()).toContain('Sarah')
  })

  it('says it is locked even when the holder cannot be named', () => {
    seedLocked('')
    const wrapper = mountSheet()

    const banner = wrapper.get('[data-testid="m5-lock"]')
    expect(banner.text().length).toBeGreaterThan(0)
    expect(banner.text()).not.toContain('{who}')
  })

  it('takes the packing controls away rather than only dimming the row', () => {
    seedLocked('user-sarah')
    const wrapper = mountSheet()

    expect(wrapper.find('[data-testid="m5-skip"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m5-todo-add"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m5-note-add"]').exists()).toBe(false)
  })

  /**
   * The stepper is the write G-3 is actually about, and it is the one
   * control the sheet keeps on screen — a locked row still has to show
   * "3/5". Disabled, therefore, not removed: the count is the readable
   * half G-3 preserves. Both directions are asserted, because "no call
   * was made" proves nothing on its own.
   */
  it('freezes the packing control while leaving the count readable', async () => {
    seedLocked('user-sarah')
    const locked = mountSheet()

    const check = locked.get('[data-testid="row-check"]')
    expect((check.get('ion-checkbox').element as unknown as { disabled: boolean }).disabled).toBe(
      true,
    )
    await check.trigger('click')
    expect(orchestratorFake.packToggle).not.toHaveBeenCalled()

    // The positive signal: the same tap on the same control writes as soon
    // as nobody holds the row.
    orchestratorFake.lockHolder.mockReturnValue(null)
    const free = mountSheet()
    await free.get('[data-testid="row-check"]').trigger('click')
    expect(orchestratorFake.packToggle).toHaveBeenCalledTimes(1)
  })

  it('leaves the details controls unwritable while the lock holds', async () => {
    seedLocked('user-sarah')
    const wrapper = await openDetails(mountSheet())

    await wrapper.get('[data-testid="m5-late"]').trigger('ionChange', { detail: { checked: true } })

    expect(orchestratorFake.setLatePacker).not.toHaveBeenCalled()
    // Both halves matter: the handler refuses the write, and the control
    // says so — a toggle that flips back on its own is worse than one
    // that never moved.
    expect(
      (wrapper.get('[data-testid="m5-late"]').element as unknown as { disabled: boolean }).disabled,
    ).toBe(true)
  })

  it('still shows what the row is — viewing is the half G-3 keeps', () => {
    seedLocked('user-sarah')
    const wrapper = mountSheet()

    expect(wrapper.get('[data-testid="m5-name"]').text()).toBe('Regenhose')
    expect(wrapper.find('[data-testid="m5-pack"]').exists()).toBe(true)
  })

  it('hands the sheet back in full once nobody holds it', () => {
    seedTrip('active')
    orchestratorFake.lockHolder.mockReturnValue(null)
    const wrapper = mountSheet()

    expect(wrapper.find('[data-testid="m5-lock"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m5-skip"]').exists()).toBe(true)
  })
})

/**
 * FR-25.19 — *Zugewiesen an* is the one actor column the client chooses
 * (invariant 3): responsibility is assigned deliberately and triggers the
 * FR-6.2 notification, while *who packed it* is stamped by the server the
 * moment the row is checked and is deliberately not editable.
 *
 * Until this control existed, `packer_user_id` was written once at row
 * creation and never again: every surface read it — M4's avatar, the
 * "zuständig war …" stamp, FR-25.20's filter — and nothing set it, so the
 * delegation notification the server implements could not fire from the app.
 */
describe('M5 FR-25.19 assignment', () => {
  it('assigns the row to a trip member through the orchestrator', async () => {
    seedMembers(seedTrip('active'), ['u-alice', 'u-bob'])
    const wrapper = await openDetails(mountSheet(MEMBERS))

    await wrapper.get('[data-testid="m5-assignee"]').trigger('ionChange', {
      detail: { value: 'u-bob' },
    })

    expect(orchestratorFake.setPacker).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'ti1' }),
      'u-bob',
    )
  })

  it('clears the assignment with "niemand" — delegation is reversible', async () => {
    seedMembers(seedTrip('active'), ['u-alice', 'u-bob'])
    const wrapper = await openDetails(mountSheet(MEMBERS))

    await wrapper.get('[data-testid="m5-assignee"]').trigger('ionChange', {
      detail: { value: '' },
    })

    // Null, not the empty string: the column is nullable and a placeholder
    // id in a foreign key is the trap invariant 3 exists to prevent.
    expect(orchestratorFake.setPacker).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'ti1' }),
      null,
    )
  })

  it('offers everybody else on the trip, plus the clear', async () => {
    seedMembers(seedTrip('active'), ['u-alice', 'u-bob'])
    // Mounted as Alice, so Alice is not among her own options.
    const wrapper = await openDetails(mountSheet(MEMBERS, 'u-alice'))

    const options = wrapper
      .get('[data-testid="m5-assignee"]')
      .findAll('ion-select-option')
      .map((o) => o.text())
    expect(options).toEqual([expect.any(String), 'Bob'])
  })

  it("offers the trip's members only, never everyone the instance knows", async () => {
    const store = seedTrip('active')
    seedMembers(store, ['u-alice', 'u-bob'])
    // `participants` carries the whole directory, because it also has to
    // name whoever packed a row. Cara is on the instance and not on this
    // trip: handing her a row would notify somebody who cannot open it
    // (P-3 scopes the partition to its members).
    const directory = [
      ...MEMBERS,
      { user_id: 'u-cara', display_name: 'Cara', avatar_url: null, role: 'editor' as const },
    ]
    const wrapper = await openDetails(mountSheet(directory, 'u-alice'))

    const options = wrapper
      .get('[data-testid="m5-assignee"]')
      .findAll('ion-select-option')
      .map((o) => o.text())
    expect(options).toContain('Bob')
    expect(options).not.toContain('Cara')
  })

  it('offers no picker where the only member is me (Single-User, or a trip nobody shares)', async () => {
    const store = seedTrip('active')
    // The store writes a membership row for every trip's creator, in
    // Single-User Mode too — so "has members" is true there and is the
    // wrong question. UI-Spec M5 hides the control because the sole user
    // is already every row's packer.
    seedMembers(store, ['u-alice'])
    const wrapper = await openDetails(mountSheet(MEMBERS, 'u-alice'))

    expect(wrapper.find('[data-testid="m5-assignee"]').exists()).toBe(false)
  })

  it('offers no picker where there is nobody to assign to (G-8)', async () => {
    seedTrip('active')
    // No members is Local Mode and Single-User Mode, where the sole user is
    // already every row's packer — absent, not disabled.
    const wrapper = await openDetails(mountSheet([]))

    expect(wrapper.find('[data-testid="m5-assignee"]').exists()).toBe(false)
  })

  it('writes nothing while somebody else holds the row (G-3)', async () => {
    seedMembers(seedTrip('active'), ['u-alice', 'u-bob'])
    orchestratorFake.lockHolder.mockReturnValue('u-alice')
    const wrapper = await openDetails(mountSheet(MEMBERS))

    // The sheet knows it is locked — the positive signal, without which
    // "nothing was written" would also be true of a sheet that never
    // rendered. `:disabled` is deliberately not the assertion: Ionic sets
    // it as a DOM property, so it is invisible to `attributes()` and a
    // check on it passes whether or not the guard exists.
    expect(wrapper.find('[data-testid="m5-lock"]').exists()).toBe(true)

    await wrapper.get('[data-testid="m5-assignee"]').trigger('ionChange', {
      detail: { value: 'u-bob' },
    })

    expect(orchestratorFake.setPacker).not.toHaveBeenCalled()
  })
})
