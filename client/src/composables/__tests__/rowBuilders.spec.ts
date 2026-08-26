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
 * Two assertions per case, and the first is what keeps the second honest:
 *
 *  1. **The seed produces exactly the expected entity**, so the fixture the
 *     survival check compares against is one the mapper really builds rather
 *     than a list of hopes.
 *  2. **A one-field action changes that one field and nothing else.** This is
 *     the half that fails when a column reached the mapper but not the
 *     builder.
 *
 * Neither can catch a *new* column, and no runtime assertion can: a mapper
 * reads a missing column as `null`, which is indistinguishable from a column
 * that is genuinely null. That guard is the `satisfies` on each `expected`
 * instead — see its doc comment below — and it is a compile error rather
 * than a red test.
 *
 * The builders are module-private, so each case reaches its own through a
 * real action rather than by importing it: what is being defended is the
 * optimistic write, not a function signature.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import type { Container, MasterItem, Template, TemplateItem, TripItem } from '@/types/domain'
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
  /** An action that changes exactly one field. */
  act: (entity: never) => void
  /** That field, and what it must become. */
  changed: string
  becomes: unknown
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
    act: (item) => newOrch().updateMasterItem(item, { weight_grams: 2500 }),
    changed: 'weight_grams',
    becomes: 2500,
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
    act: (tpl) => newOrch().updateTemplate(tpl, { icon: '🌞' }),
    changed: 'icon',
    becomes: '🌞',
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
    act: (ti) => newOrch().updateTemplateItem(ti, { quantity: 4 }),
    changed: 'quantity',
    becomes: 4,
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
    act: (item) => newOrch().setMode(TRIP_ID, item, 'buy_local'),
    changed: 'mode',
    becomes: 'buy_local',
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
    act: (c) => newOrch().updateContainer(TRIP_ID, c, { name: 'Roter Koffer' }),
    changed: 'name',
    becomes: 'Roter Koffer',
    expected: {
      id: 'co-1',
      trip_id: TRIP_ID,
      name: 'Blauer Koffer',
      carrier_traveler_id: 'tr-1',
      max_weight_grams: 23000,
      paired_container_id: 'co-2',
    } satisfies Record<keyof Container, unknown>,
  },
]

describe.each(CASES)('$builder', (testCase) => {
  it('the seed reaches the store whole, so this fixture cannot go stale', () => {
    testCase.seed()

    expect(testCase.read()).toEqual(testCase.expected)
  })

  it('a one-field action changes that field and leaves every other column alone', () => {
    testCase.seed()

    testCase.act(testCase.read() as never)

    expect(testCase.read()).toEqual({
      ...testCase.expected,
      [testCase.changed]: testCase.becomes,
    })
  })
})
