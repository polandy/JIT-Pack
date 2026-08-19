/**
 * FR-27.5 write path: what M21 actually lands when the user presses create.
 * The recognition and the plan are specified in
 * `domain/__tests__/templateFromTrip.spec.ts`; what is asserted here is the
 * result in the stores — that the recognised group is *referenced* and not
 * copied, that a deviation reaches the group itself, that the source trip is
 * untouched, and that a trip whose rows are not on the device is refused
 * rather than turned into an empty template.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import { TABLE } from '@/types/tables'
import type { PullChange } from '@/api/types'

const TRIP_ID = 'trip-1'
const GROUP_ID = 'grp-1'
const CAMERA_ID = 'item-kamera'
const TODAY = '2026-03-01'

const ANSWERS = {
  templateName: 'Samedan Sommer 2027',
  choices: {},
  checkedLooseIds: [] as string[],
  bundleName: null as string | null,
}

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

/** Local Mode: no network, no outbox, every write lands in the stores. */
async function localOrchestrator() {
  const orch = useSyncOrchestrator({
    baseUrl: 'http://localhost',
    getToken: () => null,
    today: () => TODAY,
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
 * An archived trip carrying two rows from one group and one loose row. The
 * group holds only the camera, so the second group row is a deviation.
 */
function seedWorld(opts: { deviation?: boolean; loose?: boolean } = {}) {
  const rows: PullChange[] = [
    change(TABLE.trips, TRIP_ID, {
      name: 'Samedan Sommer 2026',
      year: 2026,
      status: 'archived',
      end_date: '2026-02-08',
    }),
    change(TABLE.tripItems, 'row-kamera', {
      trip_id: TRIP_ID,
      name: 'Kamera',
      source_item_id: CAMERA_ID,
      source_template_id: GROUP_ID,
      quantity: 1,
    }),
  ]
  if (opts.deviation) {
    rows.push(
      change(TABLE.tripItems, 'row-gimbal', {
        trip_id: TRIP_ID,
        name: 'Gimbal',
        source_template_id: GROUP_ID,
        quantity: 1,
      }),
    )
  }
  if (opts.loose) {
    rows.push(
      change(TABLE.tripItems, 'row-foehn', {
        trip_id: TRIP_ID,
        name: 'Reisefön',
        quantity: 1,
      }),
    )
  }
  useTripStore().applyChanges(rows)
  useMasterStore().applyChanges([
    change(TABLE.templates, GROUP_ID, { name: 'Makro Fotografie', kind: 'group', owner_id: 'u1' }),
    change(TABLE.items, CAMERA_ID, { name: 'Kamera', weight_grams: 780, value_cents: null }),
    change(TABLE.templateItems, 'pos-kamera', {
      template_id: GROUP_ID,
      item_id: CAMERA_ID,
      quantity: 1,
      assignment: 'trip_global',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    }),
  ])
}

describe('createTemplateFromTrip (FR-27.5)', () => {
  it('references the recognised group instead of copying its positions', async () => {
    const orch = await localOrchestrator()
    const master = useMasterStore()
    seedWorld()

    const templateId = orch.createTemplateFromTrip(TRIP_ID, ANSWERS)!

    expect(master.getTemplate(templateId)).toMatchObject({
      name: 'Samedan Sommer 2027',
      kind: 'template',
    })
    expect(master.getIncludes(templateId).map((i) => i.included_template_id)).toEqual([GROUP_ID])
    // The copy this screen exists to prevent: the camera stays the group's.
    expect(master.getTemplateItems(templateId)).toEqual([])
  })

  it('writes a deviation into the group itself when the default choice stands', async () => {
    const orch = await localOrchestrator()
    const master = useMasterStore()
    seedWorld({ deviation: true })

    const templateId = orch.createTemplateFromTrip(TRIP_ID, ANSWERS)!

    const groupNames = master
      .getTemplateItems(GROUP_ID)
      .map((pos) => master.getItem(pos.item_id)?.name)
    expect(groupNames).toEqual(['Kamera', 'Gimbal'])
    expect(master.getTemplateItems(templateId)).toEqual([])
  })

  it('keeps a deviation out of the group when the user says "only here"', async () => {
    const orch = await localOrchestrator()
    const master = useMasterStore()
    seedWorld({ deviation: true })

    const templateId = orch.createTemplateFromTrip(TRIP_ID, {
      ...ANSWERS,
      choices: { [GROUP_ID]: 'own' },
    })!

    expect(master.getTemplateItems(GROUP_ID)).toHaveLength(1)
    const ownNames = master
      .getTemplateItems(templateId)
      .map((pos) => master.getItem(pos.item_id)?.name)
    expect(ownNames).toEqual(['Gimbal'])
  })

  it('creates the master item an unknown loose row needs, before the position', async () => {
    const orch = await localOrchestrator()
    const master = useMasterStore()
    seedWorld({ loose: true })

    const templateId = orch.createTemplateFromTrip(TRIP_ID, {
      ...ANSWERS,
      checkedLooseIds: ['row-foehn'],
    })!

    const positions = master.getTemplateItems(templateId)
    expect(positions).toHaveLength(1)
    // The position points at a real master item rather than a dangling id.
    expect(master.getItem(positions[0]!.item_id)?.name).toBe('Reisefön')
  })

  it('bundles the checked loose rows into a fresh group the Vorlage includes', async () => {
    const orch = await localOrchestrator()
    const master = useMasterStore()
    seedWorld({ loose: true })

    const templateId = orch.createTemplateFromTrip(TRIP_ID, {
      ...ANSWERS,
      checkedLooseIds: ['row-foehn'],
      bundleName: 'Samedan Extras',
    })!

    const includes = master.getIncludes(templateId).map((i) => i.included_template_id)
    expect(includes).toHaveLength(2)
    const bundle = includes.map((id) => master.getTemplate(id)).find((t) => t?.kind === 'group' && t.name === 'Samedan Extras')
    expect(bundle).toBeDefined()
    expect(master.getTemplateItems(templateId)).toEqual([])
    expect(master.getTemplateItems(bundle!.id)).toHaveLength(1)
  })

  it('never touches the source trip — an archived trip is a record', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld({ deviation: true, loose: true })
    const before = JSON.stringify(tripStore.getItems(TRIP_ID))

    orch.createTemplateFromTrip(TRIP_ID, { ...ANSWERS, checkedLooseIds: ['row-foehn'] })

    expect(JSON.stringify(tripStore.getItems(TRIP_ID))).toBe(before)
    expect(tripStore.getTrip(TRIP_ID)?.status).toBe('archived')
  })

  it('refuses a trip whose rows are not on the device — "not pulled" is not "empty"', async () => {
    // Without this the screen would write a template of nothing and report
    // success: the exact silent no-op FR-27.10 was reviewed for.
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      today: () => TODAY,
    })
    seedWorld()

    expect(orch.createTemplateFromTrip(TRIP_ID, ANSWERS)).toBeNull()
    expect(useMasterStore().templateList.map((t) => t.name)).toEqual(['Makro Fotografie'])
  })
})
