/**
 * M14 review fixture — development only, beside `sampleTrip.ts`.
 *
 * The review assistant is the one rebuilt screen whose populated state
 * cannot be reached through the app today: a proposal needs an FR-9.1
 * flag or group provenance, and both writers are blocked behind the
 * missing planning→active transition and the unbuilt §3.27 package
 * (see dev-docs/e2e-tests.md, M14 entry). Until those land, this seeds
 * the stores directly — state only, nothing is enqueued for sync or
 * Local persistence, so a reload clears it — and the gallery links to
 * the *real* route so the eyeball sees the true screen.
 */
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

export const REVIEW_FIXTURE_TRIP_ID = 'dev-review-fixture'

export function seedReviewFixture(): string {
  const master = useMasterStore()
  const trips = useTripStore()

  const seed = (
    store: { applyChange: (c: never) => void },
    table: string,
    id: string,
    row: Record<string, unknown>,
  ) => store.applyChange({ seq: 0, table, id, deleted: false, row } as never)

  seed(master, 'templates', 'dev-g1', { owner_id: 'dev', name: 'Fotografie', kind: 'group' })
  seed(master, 'templates', 'dev-g2', { owner_id: 'dev', name: 'Wandern', kind: 'group' })
  seed(master, 'templates', 'dev-v1', { owner_id: 'dev', name: 'Sommerferien', kind: 'template' })
  seed(master, 'items', 'dev-item-stativ', { name: 'Stativ' })
  seed(master, 'items', 'dev-item-filter', { name: 'ND-Filter' })
  seed(master, 'template_items', 'dev-g1-stativ', {
    template_id: 'dev-g1',
    item_id: 'dev-item-stativ',
    quantity: 1,
    assignment: 'trip_global',
    dedup: 'max',
    default_mode: 'pack',
    late_packer: 0,
  })
  seed(master, 'template_items', 'dev-g2-stativ', {
    template_id: 'dev-g2',
    item_id: 'dev-item-stativ',
    quantity: 1,
    assignment: 'trip_global',
    dedup: 'max',
    default_mode: 'pack',
    late_packer: 0,
  })

  seed(trips, 'trips', REVIEW_FIXTURE_TRIP_ID, {
    name: 'Samedan (Review-Fixture)',
    status: 'archived',
    end_date: '2026-08-10',
  })
  // Unused, from group dev-g1 → an "ungenutzt" proposal with a
  // two-group retarget picker (both groups carry the Stativ).
  seed(trips, 'trip_items', 'dev-ti-stativ', {
    trip_id: REVIEW_FIXTURE_TRIP_ID,
    name: 'Stativ',
    quantity: 1,
    source_item_id: 'dev-item-stativ',
    source_template_id: 'dev-g1',
    flag_unused: 1,
  })
  // Ad-hoc missing → a "fehlte" proposal defaulting to the dominant group.
  seed(trips, 'trip_items', 'dev-ti-adapter', {
    trip_id: REVIEW_FIXTURE_TRIP_ID,
    name: 'Reiseadapter',
    quantity: 1,
    flag_missing: 1,
  })
  // A planning trip using dev-g1, so the FR-27.4 blast-radius line renders.
  seed(trips, 'trips', 'dev-planning', {
    name: 'Engadin 2027',
    status: 'planning',
    end_date: '2027-08-10',
  })
  seed(trips, 'trip_items', 'dev-ti-planning', {
    trip_id: 'dev-planning',
    name: 'Stativ',
    quantity: 1,
    source_item_id: 'dev-item-stativ',
    source_template_id: 'dev-g1',
  })

  return REVIEW_FIXTURE_TRIP_ID
}
