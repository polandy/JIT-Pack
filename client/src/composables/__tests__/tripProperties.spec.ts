/**
 * FR-2.7 write path: a trip's own fields and its traveller roster, changed
 * after the wizard finished.
 *
 * What the consequences *are* is FR-27.4's rule and is tested in
 * `domain/__tests__/refresh.spec.ts`. What is asserted here is that a
 * traveller change actually runs that rule — immediately, per the 2026-08-21
 * amendment — and that it runs it per row rather than per position.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import { TABLE } from '@/types/tables'
import type { PullChange } from '@/api/types'

const TRIP_ID = 'trip-1'
const TEMPLATE_ID = 'tpl-1'
const RAINPANTS = 'item-regenhose'
const TENT = 'item-zelt'
const TODAY = '2026-01-15'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal(
    'WebSocket',
    vi.fn(() => ({ send: vi.fn(), close: vi.fn(), readyState: 1 })),
  )
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function change(table: string, id: string, row: Record<string, unknown>): PullChange {
  return { seq: 0, table, id, deleted: false, row }
}

async function localOrchestrator(today = TODAY) {
  const orch = useSyncOrchestrator({
    baseUrl: 'http://localhost',
    getToken: () => null,
    today: () => today,
    local: {
      save: () => Promise.resolve(),
      load: () => Promise.resolve([]),
      requestDurability: () => Promise.resolve(true),
    } as never,
  })
  await orch.connect()
  return orch
}

/**
 * A planning trip generated from a Vorlage it still follows, with two
 * travellers and one per-person position expanded for both — the shape the
 * whole FR-2.7 argument is about.
 */
function seedTrip(status = 'planning') {
  useMasterStore().applyChanges([
    change(TABLE.templates, TEMPLATE_ID, { name: 'Ferien', kind: 'vacation', owner_id: 'u1' }),
    change(TABLE.items, RAINPANTS, { name: 'Regenhose', weight_grams: 400, value_cents: null }),
    change(TABLE.items, TENT, { name: 'Zelt', weight_grams: 2400, value_cents: null }),
    change(TABLE.templateItems, 'pos-pants', {
      template_id: TEMPLATE_ID,
      item_id: RAINPANTS,
      quantity: 1,
      assignment: 'per_person',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    }),
    change(TABLE.templateItems, 'pos-tent', {
      template_id: TEMPLATE_ID,
      item_id: TENT,
      quantity: 1,
      assignment: 'trip_global',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    }),
  ])
  useTripStore().applyChanges([
    change(TABLE.trips, TRIP_ID, {
      name: 'Samedan',
      year: 2026,
      status,
      end_date: '2026-02-08',
    }),
    change(TABLE.travelers, 'trv-x', { trip_id: TRIP_ID, name: 'Xenia' }),
    change(TABLE.travelers, 'trv-z', { trip_id: TRIP_ID, name: 'Zoe' }),
  ])
}

/**
 * Generates the trip's rows the way the app does and settles the FR-27.4
 * bookkeeping: adding the Vorlage registers it as a source and expands its
 * positions, and the first proposal adopts what generation produced into the
 * ledger. Without that second step the refresh would read every row as
 * hand-added and protect it, which is exactly the state these tests are not
 * about.
 */
function seedGeneratedRows(orch: ReturnType<typeof useSyncOrchestrator>) {
  orch.addGroupToTrip(TRIP_ID, TEMPLATE_ID)
  orch.proposeTripRefresh(TRIP_ID)
}

/** Every row of the trip that came from the rain-trousers position. */
function pantsRows() {
  return useTripStore()
    .getItems(TRIP_ID)
    .filter((i) => i.source_item_id === RAINPANTS)
}

describe('updateTrip (FR-2.7)', () => {
  it('renames the trip and moves its dates', async () => {
    const orch = await localOrchestrator()
    seedTrip()

    orch.updateTrip(TRIP_ID, { name: 'Samedan Sommer', start_date: '2026-02-14' })

    const trip = useTripStore().getTrip(TRIP_ID)
    expect(trip?.name).toBe('Samedan Sommer')
    expect(trip?.start_date).toBe('2026-02-14')
    // Untouched fields stay: an editor saves a form, not a whole row.
    expect(trip?.year).toBe(2026)
  })
})

describe('renameTraveler (FR-2.7)', () => {
  it('keeps the traveller’s rows, because a rename is not a removal and an addition', async () => {
    const orch = await localOrchestrator()
    seedTrip()
    seedGeneratedRows(orch)

    const before = pantsRows().map((r) => r.id)
    orch.renameTraveler(TRIP_ID, 'trv-z', 'Zoë')

    expect(
      useTripStore()
        .getTravelers(TRIP_ID)
        .find((t) => t.id === 'trv-z')?.name,
    ).toBe('Zoë')
    expect(pantsRows().map((r) => r.id)).toEqual(before)
  })
})

describe('removeTraveler (FR-2.7 + FR-27.4)', () => {
  it('takes the removed traveller’s row and never the sibling’s', async () => {
    const orch = await localOrchestrator()
    seedTrip()
    seedGeneratedRows(orch)
    expect(pantsRows()).toHaveLength(2)

    orch.removeTraveler(TRIP_ID, 'trv-z')

    const left = pantsRows()
    expect(left).toHaveLength(1)
    // The positive signal: Xenia's rain trousers are still there, named. A
    // removal that matched the *position* instead of the traveller empties
    // the list and would pass a "Zoe's row is gone" assertion.
    expect(left[0]?.assigned_traveler_id).toBe('trv-x')
  })

  it('leaves a packed row of theirs standing and only drops the assignment', async () => {
    const orch = await localOrchestrator()
    seedTrip()
    seedGeneratedRows(orch)

    const zoes = pantsRows().find((r) => r.assigned_traveler_id === 'trv-z')!
    orch.packComplete(TRIP_ID, zoes)

    orch.removeTraveler(TRIP_ID, 'trv-z')

    const survivor = useTripStore()
      .getItems(TRIP_ID)
      .find((i) => i.id === zoes.id)
    // FR-27.4's protection is untouched by the FR-2.7 amendment: a row that
    // was packed is evidence of work somebody did.
    expect(survivor).toBeDefined()
    expect(survivor?.assigned_traveler_id).toBeNull()
  })

  it('removes them even when a *sibling* row is part-packed — the e2e shape', async () => {
    const orch = await localOrchestrator()
    seedTrip()
    seedGeneratedRows(orch)

    // Xenia's share is worked on; Zoe's is untouched. The protection belongs
    // to the row, not to the position, so Zoe still leaves.
    const xenias = pantsRows().find((r) => r.assigned_traveler_id === 'trv-x')!
    orch.packIncrement(TRIP_ID, xenias)

    orch.removeTraveler(TRIP_ID, 'trv-z')

    expect(
      useTripStore()
        .getTravelers(TRIP_ID)
        .map((t) => t.id),
    ).toEqual(['trv-x'])
    expect(pantsRows().map((r) => r.assigned_traveler_id)).toEqual(['trv-x'])
  })

  it('takes the packed row too when the user asks for it (FR-2.7 choice)', async () => {
    const orch = await localOrchestrator()
    seedTrip()
    seedGeneratedRows(orch)

    const zoes = pantsRows().find((r) => r.assigned_traveler_id === 'trv-z')!
    orch.packComplete(TRIP_ID, zoes)

    orch.removeTraveler(TRIP_ID, 'trv-z', { includePacked: true })

    // Gone, not merely unassigned: the user answered that the trousers come
    // back out of the bag.
    expect(
      useTripStore()
        .getItems(TRIP_ID)
        .some((i) => i.id === zoes.id),
    ).toBe(false)
    // And still only theirs — the choice widens what leaves with the person,
    // never whose rows are considered.
    expect(pantsRows().map((r) => r.assigned_traveler_id)).toEqual(['trv-x'])
  })

  it('reports how many packed rows the choice concerns, so it is not asked blind', async () => {
    const orch = await localOrchestrator()
    seedTrip()
    seedGeneratedRows(orch)

    const zoes = pantsRows().find((r) => r.assigned_traveler_id === 'trv-z')!
    orch.packComplete(TRIP_ID, zoes)

    // The screen asks only when there is something to answer about.
    expect(orch.packedRowsOf(TRIP_ID, 'trv-z')).toBe(1)
    expect(orch.packedRowsOf(TRIP_ID, 'trv-x')).toBe(0)
  })

  it('refuses on a trip that has started, because the control is disabled there', async () => {
    const orch = await localOrchestrator()
    seedTrip('active')
    seedGeneratedRows(orch)

    const report = orch.removeTraveler(TRIP_ID, 'trv-z')

    expect(report).toBeNull()
    expect(useTripStore().getTravelers(TRIP_ID)).toHaveLength(2)
  })
})

describe('addTravelerToTrip (FR-2.7 + FR-27.4 amendment)', () => {
  it('extends the per-person positions immediately rather than proposing them', async () => {
    const orch = await localOrchestrator()
    seedTrip()
    seedGeneratedRows(orch)

    const report = orch.addTravelerToTrip(TRIP_ID, 'Mia')

    expect(pantsRows()).toHaveLength(3)
    expect(report?.added).toBe(1)
    // Immediately: nothing is left waiting on M4's card.
    expect(orch.refreshProposals.value[TRIP_ID]).toBeUndefined()
  })

  it('does not multiply a shared position — one tent stays one tent', async () => {
    const orch = await localOrchestrator()
    seedTrip()
    seedGeneratedRows(orch)

    orch.addTravelerToTrip(TRIP_ID, 'Mia')

    const tents = useTripStore()
      .getItems(TRIP_ID)
      .filter((i) => i.source_item_id === TENT)
    expect(tents).toHaveLength(1)
  })
})
