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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ItemDetailSheet from '../ItemDetailSheet.vue'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import { setCurrency } from '@/lib/currency'
import { formatValue } from '@/lib/format'
import type { ItemMode, MasterItem, Trip, TripItem, TripStatus } from '@/types/domain'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

const orchestratorFake = {
  syncStatus: { state: { value: 'synced' } },
  // FR-25.15: the indicator's own signal, deliberately not the one above.
  capturePending: { value: false },
  setReviewFlag: vi.fn(),
  setLatePacker: vi.fn(),
  packToggle: vi.fn(),
  setPacker: vi.fn(),
  lockHolder: vi.fn(() => null as string | null),
  quickAddItem: vi.fn(() => ({ id: 'ti-new', companions: [] })),
}

/** Two accounts on the trip — what Server Mode looks like (FR-4.5). */
const MEMBERS = [
  { user_id: 'u-alice', display_name: 'Alice', avatar_url: null, role: 'owner' as const },
  { user_id: 'u-bob', display_name: 'Bob', avatar_url: null, role: 'editor' as const },
]

function seedTrip(
  status: TripStatus,
  flags: Partial<Pick<TripItem, 'flag_unused' | 'flag_missing'>> = {},
  mode: ItemMode = 'pack',
) {
  const tripStore = useTripStore()
  const trip: Omit<Trip, 'id'> = {
    name: 'Herbst Tessin',
    status,
    year: 2026,
    start_date: null,
    end_date: null,
    duration_days: null,
    series_id: null,
    attributes: null,
    imported: false,
  }
  tripStore.applyChange({ seq: 0, table: 'trips', id: 't1', deleted: false, row: trip })

  const item: Omit<TripItem, 'id'> = {
    trip_id: 't1',
    name: 'Regenhose',
    quantity: 1,
    packed_count: 1,
    state: 'packed',
    mode,
    flag_unused: false,
    flag_missing: false,
    ...flags,
  } as Omit<TripItem, 'id'>
  tripStore.applyChange({ seq: 0, table: 'trip_items', id: 'ti1', deleted: false, row: item })
  return tripStore
}

/** Membership is what makes somebody assignable (FR-4.5 / P-3). */
function seedMembers(tripStore: ReturnType<typeof useTripStore>, userIds: string[]) {
  userIds.forEach((user_id, i) =>
    tripStore.applyChange({
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
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
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
  orchestratorFake.capturePending.value = false
})

/** FR-7.3: an open task on a packed row (`is_task` on the comments table). */
function seedOpenTask(tripStore: ReturnType<typeof useTripStore>) {
  tripStore.applyChange({
    seq: 0,
    table: 'comments',
    id: 'c1',
    deleted: false,
    row: {
      trip_id: 't1',
      trip_item_id: 'ti1',
      author_id: 'u-alice',
      body: 'impraegnieren',
      is_task: true,
      task_state: 'open',
    },
  })
}

describe('M5 state word (FR-25.4/FR-7.3)', () => {
  it('names the row state', () => {
    seedTrip('active')
    expect(mountSheet().get('.state').text()).toBe('packed')
  })

  it('says the prep is still open on a packed row, which the state alone hides', () => {
    const tripStore = seedTrip('active')
    seedOpenTask(tripStore)
    expect(mountSheet().get('.state').text()).toBe('packed \u00b7 prep open')
  })

  it('drops the note once the task is done — the state is the whole answer again', () => {
    const tripStore = seedTrip('active')
    seedOpenTask(tripStore)
    tripStore.applyChange({
      seq: 1,
      table: 'comments',
      id: 'c1',
      deleted: false,
      row: {
        trip_id: 't1',
        trip_item_id: 'ti1',
        author_id: 'u-alice',
        body: 'impraegnieren',
        is_task: true,
        task_state: 'done',
      },
    })
    expect(mountSheet().get('.state').text()).toBe('packed')
  })
})

describe('M5 mode chip (FR-3.2)', () => {
  it.each([
    ['buy_before' as const, true],
    ['buy_local' as const, true],
    ['pack' as const, false],
  ])('paints the %s chip as procurement: %s', (mode, procured) => {
    seedTrip('active', {}, mode)
    const wrapper = mountSheet()
    // The chip is rendered either way — an absent `buy` class is the state,
    // not an absent chip, which would make the assertion below vacuous.
    expect(wrapper.findAll('.chip').length).toBeGreaterThan(0)
    expect(wrapper.find('.chip.buy').exists()).toBe(procured)
  })
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
/**
 * E2E-M5-11 (v1.0 catalogue): "item locked by the other user → read-only
 * with lock banner". Carried here because the *rule* is the sheet's, and
 * the rendered half is asserted with a second account in
 * `e2e/server/multi-user.spec.ts` and `e2e/single/server-sync.spec.ts`.
 * The ledger reported this as unwritten for months while these cases
 * stood — the id was the only thing missing.
 */
describe('M5 respects the G-3 lock', () => {
  function seedLocked(holder: string | null) {
    const tripStore = seedTrip('active')
    tripStore.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'ti1',
      deleted: false,
      row: {
        ...tripStore.getItems('t1')[0]!,
        state: 'packing_now',
        packing_now_by: holder,
        packing_now_at: new Date().toISOString(),
      },
    })
    orchestratorFake.lockHolder.mockReturnValue(holder)
    return tripStore
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
      global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
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
/**
 * Its two absence cases are E2E-M5-08 (`single/local`, FR-17.3/G-8:
 * "delegate control hidden"). The guard is arithmetic over the roster, so
 * a browser can only re-run what is decided here; the spec entry names
 * this file rather than promising a case nothing would gain from.
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
    const tripStore = seedTrip('active')
    seedMembers(tripStore, ['u-alice', 'u-bob'])
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
    const tripStore = seedTrip('active')
    // The store writes a membership row for every trip's creator, in
    // Single-User Mode too — so "has members" is true there and is the
    // wrong question. UI-Spec M5 hides the control because the sole user
    // is already every row's packer.
    seedMembers(tripStore, ['u-alice'])
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

/**
 * FR-25.15 — the indicator says whether *this* edit is captured, and that
 * is not what G-2 says. Until 2026-08-30 the sheet handed it
 * `syncStatus.state`, whose precedence answers `offline` before `syncing`:
 * a write still open on a device with no network rendered as saved, which
 * is the single case the requirement was written for. A browser cannot
 * assert it without racing the write, so it is pinned here, where the
 * signal is a value somebody sets.
 */
describe('M5 FR-25.15 save indicator', () => {
  it('says it is saving while a write of mine is still open', async () => {
    seedTrip('active')
    orchestratorFake.capturePending.value = true
    const wrapper = mountSheet()

    const indicator = wrapper.get('[data-testid="save-indicator"]')
    expect(indicator.text()).toBe('●')
    expect(indicator.attributes('title')).toBe('Saving…')
  })

  it('says so offline too — the sync state has no vote', async () => {
    seedTrip('active')
    // What G-2 reports, and what used to decide this glyph.
    orchestratorFake.syncStatus.state.value = 'offline'
    orchestratorFake.capturePending.value = true
    const wrapper = mountSheet()

    expect(wrapper.get('[data-testid="save-indicator"]').text()).toBe('●')
    orchestratorFake.syncStatus.state.value = 'synced'
  })

  it('settles once nothing of mine is open, whatever the sync state is', async () => {
    seedTrip('active')
    orchestratorFake.syncStatus.state.value = 'syncing'
    const wrapper = mountSheet()

    // A background pull is G-2's business; the sheet has nothing open.
    expect(wrapper.get('[data-testid="save-indicator"]').text()).toBe('✓')
    orchestratorFake.syncStatus.state.value = 'synced'
  })
})

/**
 * FR-21.25 — the sheet's weight is the other way round.
 *
 * The two things a rendered look found are both assertable here: the control
 * the sheet is *opened* for was the smallest thing on it, and the only two
 * filled buttons belonged to prep and notes. A `fill` is what makes a button
 * read as the page's answer, so it is the property the case pins.
 */
describe('M5 puts its weight on the action it is opened for (FR-21.25)', () => {
  it('draws the pack control at a main action’s size, not a row’s', () => {
    seedTrip('active')

    const stepper = mountSheet().findComponent({ name: 'QuantityStepper' })

    expect(stepper.props('large')).toBe(true)
  })

  it('leaves the filled button to nobody — prep and note commit quietly', () => {
    seedTrip('active')
    const wrapper = mountSheet()

    const filled = wrapper
      .findAllComponents({ name: 'IonButton' })
      .filter((button) => button.props('fill') === undefined || button.props('fill') === 'solid')
      .map((button) => button.attributes('data-testid'))

    expect(filled).toEqual([])
  })
})

/**
 * The context line under the name — "Kleidung · 300 g · 24.90" — and the
 * FR-20.4 chip beside it. Both said less than they knew: the amount was a
 * bare `toFixed(2)` while every other amount in the app carries the
 * instance's currency (FR-21.9), and the chip wrote a row without the
 * category the row is filed under (FR-24.2) or the quantity the dependency
 * asked for.
 */
describe('M5 says what it knows (FR-21.9, FR-20.4/FR-24.2)', () => {
  /** The item behind the row, with the facts the context line reads. */
  function seedMasterItem(extra: Partial<MasterItem> = {}) {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 0,
      table: 'items',
      id: 'mi-hose',
      deleted: false,
      row: { name: 'Regenhose', weight_grams: 300, value_cents: 2490, ...extra },
    })
    return masterStore
  }

  /**
   * The trip row names its master item — what the FR-20.4 chips hang off —
   * and carries its own copy of the facts, which is what the line reads.
   */
  function linkRowToMaster(tripStore: ReturnType<typeof useTripStore>) {
    const row = tripStore.getItems('t1').find((i) => i.id === 'ti1')!
    tripStore.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'ti1',
      deleted: false,
      row: {
        ...row,
        source_item_id: 'mi-hose',
        category_name: 'Kleidung',
        weight_grams: 300,
        value_cents: 2490,
      },
    })
  }

  afterEach(() => setCurrency(null))

  it('renders the amount in the instance currency, like every other amount', () => {
    const tripStore = seedTrip('active')
    seedMasterItem()
    linkRowToMaster(tripStore)
    setCurrency('CHF')

    const meta = mountSheet().findComponent({ name: 'SheetHead' }).props('meta') as string

    // Intl places symbol and separators; what this pins is that the amount
    // went through `formatValue` at all — a bare toFixed says "24.90".
    expect(meta).toContain(formatValue(2490))
    expect(meta).not.toContain('24.90 ')
  })

  it('gives an accepted companion its category and its quantity', async () => {
    const tripStore = seedTrip('active')
    const masterStore = seedMasterItem()
    linkRowToMaster(tripStore)
    masterStore.applyChange({
      seq: 0,
      table: 'items',
      id: 'mi-guertel',
      deleted: false,
      row: { name: 'Gürtel', weight_grams: 80, value_cents: 1500 },
    })
    masterStore.applyChange({
      seq: 0,
      table: 'tags',
      id: 'tag-kleidung',
      deleted: false,
      row: { name: 'Kleidung', sort_order: 0 },
    })
    masterStore.applyChange({
      seq: 0,
      table: 'item_tags',
      id: 'it-1',
      deleted: false,
      row: { item_id: 'mi-guertel', tag_id: 'tag-kleidung', sort_order: 0 },
    })
    masterStore.applyChange({
      seq: 0,
      table: 'item_dependencies',
      id: 'dep-1',
      deleted: false,
      row: {
        item_id: 'mi-guertel',
        depends_on_item_id: 'mi-hose',
        mode: 'suggested',
        quantity: 2,
      },
    })

    const wrapper = mountSheet()
    await wrapper.get('[data-testid="m5-companion-Gürtel"]').trigger('click')

    expect(orchestratorFake.quickAddItem).toHaveBeenCalledWith(
      't1',
      'Gürtel',
      expect.objectContaining({
        sourceItemId: 'mi-guertel',
        categoryName: 'Kleidung',
        quantity: 2,
        weightGrams: 80,
        valueCents: 1500,
      }),
      true,
    )
  })
})
