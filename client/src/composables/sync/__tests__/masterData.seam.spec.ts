/**
 * The master-data group runs on a context, not on the orchestrator (R-4).
 *
 * It is the first group whose behaviour depends on the *mode* the device is
 * in: FR-24.3's reference count is exact only where the device holds every
 * trip (ADR-032), so the two outlook cases are built from two contexts —
 * one with `local` null, one with a stand-in store. No `fetch`, no
 * WebSocket, no outbox, no orchestrator in either.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createMasterDataActions } from '../actions/masterData'
import { makeSeamContext, pullIn, type Recorded, paintedRow, SEAM_NOW_ISO } from './seamContext'
import type { SyncContext } from '../context'
import { TABLE } from '@/types/tables'
import { DELETION_REMOVE, DELETION_RETIRE, RETIRED_FIELD } from '@/domain/masterDeletion'
import { RESTORE_NAME_TAKEN } from '@/domain/masterRestore'
import type { IndexedDBPersistence } from '@/local/persistence'
import type { MasterItem, Template } from '@/types/domain'

const TRIP_ID = 'trip-1'
const ITEM_ID = 'item-1'
const TEMPLATE_ID = 'tpl-1'
const RETIRED_AT = '2026-08-01T00:00:00.000Z'

/** Local Mode is only ever asked whether it exists, so an empty stand-in answers it. */
const LOCAL_STORE = {} as IndexedDBPersistence

let queued: Recorded[]
let ctx: SyncContext

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

/** Seeds one master item; `retired_at` is only set where a case is about it. */
function seedItem(id: string, fields: Record<string, unknown> = {}): MasterItem {
  pullIn(ctx.masterStore, TABLE.items, id, {
    name: `item ${id}`,
    // Not 0: `rowToMasterItem` would report the same thing for a dropped column.
    weight_grams: 250,
    value_cents: 1900,
    ...fields,
  })
  return ctx.masterStore.getItem(id) as MasterItem
}

function seedTemplate(id: string, fields: Record<string, unknown> = {}): Template {
  pullIn(ctx.masterStore, TABLE.templates, id, {
    owner_id: 'user-1',
    name: `template ${id}`,
    kind: 'template',
    ...fields,
  })
  return ctx.masterStore.getTemplate(id) as Template
}

/** One generated trip row, which is what FR-9.2 counts as a reference. */
function seedGeneratedTripItem(source: { item?: string; template?: string }): void {
  pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, { name: 'Trip', status: 'active', year: 2026 })
  pullIn(ctx.tripStore, TABLE.tripItems, 'ti-1', {
    trip_id: TRIP_ID,
    name: 'a row',
    quantity: 1,
    source_item_id: source.item ?? null,
    source_template_id: source.template ?? null,
  })
}

describe('createMasterDataActions without an orchestrator', () => {
  it('createTag appends the tag at the end of the tag list (FR-24.1)', () => {
    pullIn(ctx.masterStore, TABLE.tags, 'tag-1', { name: 'Kleidung', sort_order: 0 })

    const id = createMasterDataActions(ctx).createTag('Technik')

    expect(queued).toHaveLength(1)
    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.id).toBeNull()
    expect(queued[0]!.muts[0]!.mutation.op).toBe('insert')
    expect(queued[0]!.muts[0]!.mutation.id).toBe(id)
    // `tags.sort_order`, not `position`: the two tables spell the same idea
    // differently, and `item_tags` below is the one that says `position`.
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ name: 'Technik', sort_order: 1 })
  })

  it('assignTag positions the assignment after the tags the item already has (FR-24.2)', () => {
    seedItem(ITEM_ID)
    pullIn(ctx.masterStore, TABLE.tags, 'tag-1', { name: 'Kleidung', sort_order: 0 })
    pullIn(ctx.masterStore, TABLE.itemTags, 'it-1', {
      item_id: ITEM_ID,
      tag_id: 'tag-1',
      position: 0,
    })

    createMasterDataActions(ctx).assignTag(ITEM_ID, 'tag-2')

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      item_id: ITEM_ID,
      tag_id: 'tag-2',
      position: 1,
    })
  })

  it('unassignTag queues a delete on the master partition', () => {
    createMasterDataActions(ctx).unassignTag('it-1')

    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.muts[0]!.mutation.op).toBe('delete')
    expect(queued[0]!.muts[0]!.mutation.id).toBe('it-1')
  })

  it('updateMasterItem paints the whole row, not only the changed field', () => {
    const item = seedItem(ITEM_ID)

    createMasterDataActions(ctx).updateMasterItem(item, { name: 'renamed' })

    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      name: 'renamed',
      weight_grams: 250,
      value_cents: 1900,
    })
  })

  it('deleteMasterItem retires an item a template position still names (FR-24.3)', () => {
    const item = seedItem(ITEM_ID)
    seedTemplate(TEMPLATE_ID)
    pullIn(ctx.masterStore, TABLE.templateItems, 'tpi-1', {
      template_id: TEMPLATE_ID,
      item_id: ITEM_ID,
      quantity: 1,
    })

    createMasterDataActions(ctx).deleteMasterItem(item.id)

    expect(queued[0]!.muts[0]!.mutation.op).toBe('upsert')
    expect(queued[0]!.muts[0]!.mutation.fields![RETIRED_FIELD]).toBe(SEAM_NOW_ISO)
  })

  it('deleteMasterItem removes an item nothing has ever used (FR-24.3)', () => {
    const item = seedItem(ITEM_ID)

    createMasterDataActions(ctx).deleteMasterItem(item.id)

    expect(queued[0]!.muts[0]!.mutation.op).toBe('delete')
  })

  it('deleteTemplate retires a Vorlage an archived trip row still names (FR-9.2)', () => {
    seedTemplate(TEMPLATE_ID)
    seedGeneratedTripItem({ template: TEMPLATE_ID })

    createMasterDataActions(ctx).deleteTemplate(TEMPLATE_ID)

    expect(queued[0]!.muts[0]!.mutation.op).toBe('upsert')
    expect(queued[0]!.muts[0]!.mutation.fields![RETIRED_FIELD]).toBe(SEAM_NOW_ISO)
  })

  it('a zero reference count is uncertain in Server Mode and certain in Local Mode (ADR-032)', () => {
    seedItem(ITEM_ID)
    const server = createMasterDataActions(ctx).masterItemDeletionOutlook(ITEM_ID)

    setActivePinia(createPinia())
    const localCtx = makeSeamContext({ local: LOCAL_STORE }).ctx
    ctx = localCtx
    seedItem(ITEM_ID)
    const device = createMasterDataActions(localCtx).masterItemDeletionOutlook(ITEM_ID)

    expect(server).toMatchObject({ kind: DELETION_REMOVE, references: 0, certain: false })
    expect(device).toMatchObject({ kind: DELETION_REMOVE, references: 0, certain: true })
  })

  it('a retire is certain in both modes — a count that is short can only grow', () => {
    seedItem(ITEM_ID)
    seedGeneratedTripItem({ item: ITEM_ID })

    expect(createMasterDataActions(ctx).masterItemDeletionOutlook(ITEM_ID)).toMatchObject({
      kind: DELETION_RETIRE,
      certain: true,
    })
  })

  it('createTemplate refuses a name an active Vorlage already holds (FR-1.6)', () => {
    seedTemplate(TEMPLATE_ID, { name: 'Ferien' })

    expect(createMasterDataActions(ctx).createTemplate('Ferien')).toBeNull()
    expect(queued).toHaveLength(0)
  })

  it('createTemplate accepts a name only a retired Vorlage holds (FR-24.3)', () => {
    seedTemplate(TEMPLATE_ID, { name: 'Ferien', [RETIRED_FIELD]: RETIRED_AT })

    expect(createMasterDataActions(ctx).createTemplate('Ferien')).not.toBeNull()
    expect(queued).toHaveLength(1)
  })

  it('updateTemplate refuses a rename onto a taken name and queues nothing', () => {
    const template = seedTemplate(TEMPLATE_ID, { name: 'Ferien' })
    seedTemplate('tpl-2', { name: 'Wandern' })

    expect(createMasterDataActions(ctx).updateTemplate(template, { name: 'Wandern' })).toBe(false)
    expect(queued).toHaveLength(0)
  })

  it('restoreMasterItem refuses when an active row took the freed name (ADR-034)', () => {
    const retired = seedItem(ITEM_ID, { name: 'Zelt', [RETIRED_FIELD]: RETIRED_AT })
    seedItem('item-2', { name: 'Zelt' })

    expect(createMasterDataActions(ctx).restoreMasterItem(retired.id)).toBe(false)
    expect(queued).toHaveLength(0)
    expect(createMasterDataActions(ctx).masterItemRestoreVerdict(retired.id)).toMatchObject({
      kind: RESTORE_NAME_TAKEN,
    })
  })

  it('restoreMasterItem writes the replacement name in the same mutation as the cleared marker', () => {
    const retired = seedItem(ITEM_ID, { name: 'Zelt', [RETIRED_FIELD]: RETIRED_AT })
    seedItem('item-2', { name: 'Zelt' })

    expect(createMasterDataActions(ctx).restoreMasterItem(retired.id, 'Zelt (alt)')).toBe(true)
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      name: 'Zelt (alt)',
      [RETIRED_FIELD]: null,
    })
  })

  it('restoreTemplate does the same for a Vorlage, and both verdicts are null for a row this device does not have', () => {
    const retired = seedTemplate(TEMPLATE_ID, { name: 'Ferien', [RETIRED_FIELD]: RETIRED_AT })
    const actions = createMasterDataActions(ctx)

    expect(actions.restoreTemplate(retired.id)).toBe(true)
    expect(queued[0]!.muts[0]!.mutation.fields![RETIRED_FIELD]).toBeNull()
    expect(actions.templateRestoreVerdict('tpl-missing')).toBeNull()
    expect(actions.masterItemRestoreVerdict('item-missing')).toBeNull()
  })
})
