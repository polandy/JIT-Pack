/**
 * The row builders are complete — every column the store keeps survives an
 * optimistic write.
 *
 * An orchestrator action rebuilds the whole row from a builder
 * (`masterItemRow`, `itemRow`, …) and spreads the mutation's fields over it.
 * A builder that does not know a column therefore **blanks** it on any
 * unrelated edit: in Server Mode until the next pull, in Local Mode forever,
 * and on no screen that says so. It has happened twice — #158 dropped
 * `trips.status` and made a trip permanently invisible on M2, and FR-25.11j's
 * own review caught `itemRow` erasing the purchase record on the next pack.
 * Both were found by a person looking; neither call site looked wrong.
 *
 * One seed assertion per case plus one per action, and the seed is what keeps
 * the rest honest:
 *
 *  1. **The seed produces exactly the expected entity**, so the fixture the
 *     survival checks compare against is one the mapper really builds rather
 *     than a list of hopes.
 *  2. **Each action changes its one field and nothing else** — for every
 *     column that action does not supply itself. See `acts`.
 *
 * Neither can catch a *new* column, and no runtime assertion can: a mapper
 * reads a missing column as `null`, which is indistinguishable from a column
 * that is genuinely null. That guard is the `satisfies` on each `expected`
 * instead — see its doc comment below — and it is a compile error rather
 * than a red test.
 *
 * Each case reaches its builder through a real action rather than by
 * importing it from `sync/rows.ts`: what is being defended is the optimistic
 * write, not a function signature.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import type {
  Container,
  ItemDependency,
  MasterItem,
  Template,
  TemplateItem,
  Traveler,
  Trip,
  TripItem,
  TripSeries,
} from '@/types/domain'
import { installHarness } from '@/__tests__/harness'

beforeEach(() => {
  installHarness().mockDrain()
})

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

/** Seeds one row the way a pull would, so the store maps it itself. */
function pullIn(
  store: { applyChange: (c: never) => void },
  table: string,
  id: string,
  row: object,
): void {
  store.applyChange({ seq: 1, table, id, deleted: false, row } as never)
}

const TRIP_ID = 'trip-1'

function seedTrip(): void {
  pullIn(useTripStore(), TABLE.trips, TRIP_ID, { name: 'Samedan', year: 2026, status: 'active' })
}

interface BuilderCase {
  /** The builder under test, named as it is in useSyncOrchestrator. */
  builder: string
  /** Seeds a complete row, the way a pull would. */
  seed: () => void
  /** Reads back what the store made of it. */
  read: () => Record<string, unknown>
  /**
   * One entry per action that rebuilds this row, each changing exactly one
   * field. **More than one is not redundancy**: the field an action changes
   * is the one field it supplies itself, so that action cannot notice the
   * builder dropping it. Only a *second* action, changing something else,
   * defends the first one's column. Where a builder has one real writer the
   * list stays at one and the case says so.
   */
  acts: Array<{ act: (entity: never) => void; changed: string; becomes: unknown }>
  /**
   * The whole entity the seed must produce. Typed per case with
   * `satisfies Record<keyof …, unknown>`, so a field added to the domain
   * type stops this file compiling until someone places it — which is the
   * only guard that works, because a mapper reads a missing column as
   * `null` and a runtime check cannot tell that from a column that is
   * genuinely null.
   */
  expected: Record<string, unknown>
}

const CASES: BuilderCase[] = [
  {
    builder: 'masterItemRow',
    seed: () =>
      pullIn(useMasterStore(), TABLE.items, 'it-1', {
        name: 'Zelt',
        weight_grams: 2400,
        value_cents: 39900,
        image_hash: 'abcdef0123456789',
        icon: '⛺',
        retired_at: '2026-08-20T10:00:00Z',
      }),
    read: () => useMasterStore().getItem('it-1') as unknown as Record<string, unknown>,
    acts: [
      {
        act: (i) => newOrch().updateMasterItem(i, { weight_grams: 2500 }),
        changed: 'weight_grams',
        becomes: 2500,
      },
      {
        act: (i) => newOrch().updateMasterItem(i, { name: 'Tarp' }),
        changed: 'name',
        becomes: 'Tarp',
      },
    ],
    expected: {
      id: 'it-1',
      name: 'Zelt',
      // The one carve-out, and it is not the display decoration the type
      // says it is: `items` has no such column and no mapper fills it, so it
      // is `undefined` on every master item there has ever been. A master
      // item's category is its primary tag (ADR-014), which is what
      // QuickAddItem reads; the three call sites that read this field
      // instead get nothing, and closing that is its own change.
      category_name: undefined,
      weight_grams: 2400,
      value_cents: 39900,
      image_hash: 'abcdef0123456789',
      icon: '⛺',
      retired_at: '2026-08-20T10:00:00Z',
    } satisfies Record<keyof MasterItem, unknown>,
  },
  {
    builder: 'templateRow',
    seed: () =>
      pullIn(useMasterStore(), TABLE.templates, 'tpl-1', {
        owner_id: 'user-a',
        name: 'Sommer',
        kind: 'group',
        icon: '🏖️',
        retired_at: '2026-08-20T10:00:00Z',
      }),
    read: () => useMasterStore().getTemplate('tpl-1') as unknown as Record<string, unknown>,
    acts: [
      { act: (t) => newOrch().updateTemplate(t, { icon: '🌞' }), changed: 'icon', becomes: '🌞' },
      {
        act: (t) => newOrch().updateTemplate(t, { kind: 'template' }),
        changed: 'kind',
        becomes: 'template',
      },
    ],
    expected: {
      id: 'tpl-1',
      owner_id: 'user-a',
      name: 'Sommer',
      kind: 'group',
      icon: '🏖️',
      retired_at: '2026-08-20T10:00:00Z',
    } satisfies Record<keyof Template, unknown>,
  },
  {
    builder: 'templateItemRow',
    seed: () =>
      pullIn(useMasterStore(), TABLE.templateItems, 'tpi-1', {
        template_id: 'tpl-1',
        item_id: 'it-1',
        quantity: 3,
        assignment: 'trip_global',
        dedup: 'sum',
        conditions: JSON.stringify({ if: 'beach' }),
        default_mode: 'buy_local',
        late_packer: 1,
      }),
    read: () => useMasterStore().getTemplateItems('tpl-1')[0] as unknown as Record<string, unknown>,
    acts: [
      {
        act: (t) => newOrch().updateTemplateItem(t, { quantity: 4 }),
        changed: 'quantity',
        becomes: 4,
      },
      {
        act: (t) => newOrch().updateTemplateItem(t, { dedup: 'max' }),
        changed: 'dedup',
        becomes: 'max',
      },
    ],
    expected: {
      id: 'tpi-1',
      template_id: 'tpl-1',
      item_id: 'it-1',
      quantity: 3,
      assignment: 'trip_global',
      dedup: 'sum',
      conditions: { if: 'beach' },
      default_mode: 'buy_local',
      late_packer: true,
    } satisfies Record<keyof TemplateItem, unknown>,
  },
  {
    builder: 'itemRow',
    seed: () => {
      seedTrip()
      pullIn(useTripStore(), TABLE.tripItems, 'ti-1', {
        trip_id: TRIP_ID,
        source_item_id: 'it-1',
        source_template_id: 'tpl-1',
        name: 'Zelt',
        weight_grams: 2400,
        value_cents: 39900,
        category_name: 'Schlafen',
        quantity: 2,
        packed_count: 1,
        state: 'partial',
        mode: 'buy_before',
        late_packer: 1,
        assigned_traveler_id: 'tr-1',
        packer_user_id: 'user-a',
        packed_by_user_id: 'user-b',
        packed_at: '2026-08-20T10:00:00Z',
        container_id: 'co-1',
        packing_now_by: 'user-c',
        packing_now_at: '2026-08-20T11:00:00Z',
        bought_from: 'buy_before',
        flag_unused: 1,
        flag_missing: 1,
        updated_hlc: '0000009000000-0001-abcdef01',
      })
    },
    read: () => useTripStore().getItems(TRIP_ID)[0] as unknown as Record<string, unknown>,
    acts: [
      {
        act: (i) => newOrch().setMode(TRIP_ID, i, 'buy_local'),
        changed: 'mode',
        becomes: 'buy_local',
      },
      {
        act: (i) => newOrch().setLatePacker(TRIP_ID, i, false),
        changed: 'late_packer',
        becomes: false,
      },
    ],
    expected: {
      id: 'ti-1',
      trip_id: TRIP_ID,
      source_item_id: 'it-1',
      source_template_id: 'tpl-1',
      name: 'Zelt',
      weight_grams: 2400,
      value_cents: 39900,
      category_name: 'Schlafen',
      quantity: 2,
      packed_count: 1,
      state: 'partial',
      mode: 'buy_before',
      late_packer: true,
      assigned_traveler_id: 'tr-1',
      packer_user_id: 'user-a',
      packed_by_user_id: 'user-b',
      packed_at: '2026-08-20T10:00:00Z',
      container_id: 'co-1',
      packing_now_by: 'user-c',
      packing_now_at: '2026-08-20T11:00:00Z',
      bought_from: 'buy_before',
      flag_unused: true,
      flag_missing: true,
      updated_hlc: '0000009000000-0001-abcdef01',
    } satisfies Record<keyof TripItem, unknown>,
  },
  {
    builder: 'containerRow',
    seed: () => {
      seedTrip()
      pullIn(useTripStore(), TABLE.containers, 'co-1', {
        trip_id: TRIP_ID,
        name: 'Blauer Koffer',
        carrier_traveler_id: 'tr-1',
        max_weight_grams: 23000,
        paired_container_id: 'co-2',
      })
    },
    read: () => useTripStore().getContainers(TRIP_ID)[0] as unknown as Record<string, unknown>,
    acts: [
      {
        act: (c) => newOrch().updateContainer(TRIP_ID, c, { name: 'Roter Koffer' }),
        changed: 'name',
        becomes: 'Roter Koffer',
      },
      {
        act: (c) => newOrch().updateContainer(TRIP_ID, c, { max_weight_grams: 20000 }),
        changed: 'max_weight_grams',
        becomes: 20000,
      },
    ],
    expected: {
      id: 'co-1',
      trip_id: TRIP_ID,
      name: 'Blauer Koffer',
      carrier_traveler_id: 'tr-1',
      max_weight_grams: 23000,
      paired_container_id: 'co-2',
    } satisfies Record<keyof Container, unknown>,
  },
  {
    builder: 'tripRow',
    seed: () =>
      pullIn(useTripStore(), TABLE.trips, TRIP_ID, {
        name: 'Engadin',
        year: 2025,
        status: 'planning',
        start_date: '2026-08-01',
        end_date: '2026-08-10',
        series_id: 'ser-1',
        attributes: JSON.stringify({ season: 'summer' }),
        imported: 1,
      }),
    read: () => useTripStore().getTrip(TRIP_ID) as unknown as Record<string, unknown>,
    acts: [
      { act: () => newOrch().activateTrip(TRIP_ID), changed: 'status', becomes: 'active' },
      // This entry is what defends `status` — the column #158 dropped, which
      // made a trip permanently invisible on M2.
      { act: () => newOrch().setTripSeries(TRIP_ID, null), changed: 'series_id', becomes: null },
    ],
    expected: {
      id: TRIP_ID,
      name: 'Engadin',
      year: 2025,
      status: 'planning',
      start_date: '2026-08-01',
      end_date: '2026-08-10',
      // Absent from `tripRow` on purpose and safe to be: `trips.duration_days`
      // is a GENERATED column, so no pull ever carries one and the store
      // derives it from the two dates the builder does carry.
      duration_days: 10,
      series_id: 'ser-1',
      // The second carve-out, and unlike `duration_days` it is not derived
      // from anything: no `series_name` column exists in `schema.sql`, no
      // mapper fills one, and so every trip that has ever been read carries
      // `null` here. AnalyticsPage's FR-14.3 trend heading is the one reader,
      // and its `?? trip.name` fallback is therefore the only branch taken.
      // Closing that is its own change — the name lives on the master
      // store's series row, which the trip store cannot reach.
      series_name: null,
      attributes: { season: 'summer' },
      imported: true,
    } satisfies Record<keyof Trip, unknown>,
  },
  {
    builder: 'travelerRow',
    seed: () => {
      seedTrip()
      pullIn(useTripStore(), TABLE.travelers, 'tr-1', {
        trip_id: TRIP_ID,
        name: 'Andy',
        linked_user_id: 'user-a',
      })
    },
    read: () => useTripStore().getTravelers(TRIP_ID)[0] as unknown as Record<string, unknown>,
    // One entry, and it is complete: `renameTraveler` is the only writer
    // that rebuilds a traveler row, and FR-2.7 forbids a second one — every
    // assigned row points at this traveler, so a rename may not re-create
    // them. `name` is therefore the one column in all nine builders that no
    // action can observe being dropped, and it is held by the type check
    // alone. Unreachable rather than untested.
    acts: [
      {
        act: () => newOrch().renameTraveler(TRIP_ID, 'tr-1', 'Andrea'),
        changed: 'name',
        becomes: 'Andrea',
      },
    ],
    expected: {
      id: 'tr-1',
      trip_id: TRIP_ID,
      name: 'Andy',
      // The column this case exists for: FR-2.7 forbids re-creating a
      // traveler to rename them, because every assigned row points at this
      // one. A rename that dropped the link would undo the account
      // connection at the moment the user meant it least.
      linked_user_id: 'user-a',
    } satisfies Record<keyof Traveler, unknown>,
  },
  {
    builder: 'seriesRow',
    seed: () =>
      pullIn(useMasterStore(), TABLE.tripSeries, 'ser-1', {
        owner_id: 'user-a',
        name: 'Engadin',
        default_attributes: JSON.stringify({ season: 'summer' }),
      }),
    read: () => useMasterStore().getSeries('ser-1') as unknown as Record<string, unknown>,
    acts: [
      {
        act: (s) => newOrch().updateSeries(s, { name: 'Samedan' }),
        changed: 'name',
        becomes: 'Samedan',
      },
      {
        act: (s) =>
          newOrch().updateSeries(s, { default_attributes: JSON.stringify({ season: 'winter' }) }),
        changed: 'default_attributes',
        becomes: { season: 'winter' },
      },
    ],
    expected: {
      id: 'ser-1',
      owner_id: 'user-a',
      name: 'Engadin',
      default_attributes: { season: 'summer' },
    } satisfies Record<keyof TripSeries, unknown>,
  },
  {
    builder: 'dependencyRow',
    seed: () =>
      pullIn(useMasterStore(), TABLE.itemDependencies, 'dep-1', {
        item_id: 'it-2',
        depends_on_item_id: 'it-1',
        mode: 'suggested',
        quantity: 2,
      }),
    read: () =>
      useMasterStore().getItemDependencies('it-2')[0] as unknown as Record<string, unknown>,
    acts: [
      {
        act: (d) => newOrch().updateItemDependency(d, { mode: 'required' }),
        changed: 'mode',
        becomes: 'required',
      },
      {
        act: (d) => newOrch().updateItemDependency(d, { quantity: 3 }),
        changed: 'quantity',
        becomes: 3,
      },
    ],
    expected: {
      id: 'dep-1',
      item_id: 'it-2',
      depends_on_item_id: 'it-1',
      mode: 'suggested',
      quantity: 2,
    } satisfies Record<keyof ItemDependency, unknown>,
  },
]

describe.each(CASES)('$builder', (testCase) => {
  it('the seed reaches the store whole, so this fixture cannot go stale', () => {
    testCase.seed()

    expect(testCase.read()).toEqual(testCase.expected)
  })

  it.each(testCase.acts)(
    'changing $changed leaves every other column alone',
    ({ act, changed, becomes }) => {
      testCase.seed()

      act(testCase.read() as never)

      expect(testCase.read()).toEqual({ ...testCase.expected, [changed]: becomes })
    },
  )
})
