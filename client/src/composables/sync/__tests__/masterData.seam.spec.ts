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
import {
  makeSeamContext,
  pullIn,
  type Recorded,
  paintedRow,
  SEAM_NOW_ISO,
  type SeamContext,
} from './seamContext'
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
let ctx: SeamContext

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

// --- FR-24.10: managing the tags themselves ---------------------------------

describe('the tag admin actions (FR-24.10)', () => {
  /** Two tags and the assignments a case needs, seeded through a pull. */
  function seedTag(id: string, name: string, sortOrder: number): void {
    pullIn(ctx.masterStore, TABLE.tags, id, { name, sort_order: sortOrder })
  }

  function seedAssignment(id: string, itemId: string, tagId: string, position: number): void {
    pullIn(ctx.masterStore, TABLE.itemTags, id, { item_id: itemId, tag_id: tagId, position })
  }

  it('setTagMark writes the mark and paints it before the push answers (FR-24.13)', () => {
    seedTag('tag-1', 'Bad', 0)

    createMasterDataActions(ctx).setTagMark('tag-1', '🧼')

    expect(queued[0]!.muts[0]!.mutation.fields).toEqual({ icon: '🧼' })
    expect(ctx.masterStore.tagList.find((t) => t.id === 'tag-1')?.icon).toBe('🧼')
  })

  it('setTagMark writes nothing when the mark is already the one chosen', () => {
    pullIn(ctx.masterStore, TABLE.tags, 'tag-1', { name: 'Bad', sort_order: 0, icon: '🧼' })

    createMasterDataActions(ctx).setTagMark('tag-1', '🧼')

    expect(queued).toHaveLength(0)
  })

  it('createTag with a mark creates the tag carrying it (FR-24.13)', () => {
    const id = createMasterDataActions(ctx).createTag('Wasser', '🌊')

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ name: 'Wasser', icon: '🌊' })
    expect(ctx.masterStore.tagList.find((t) => t.id === id)?.icon).toBe('🌊')
  })

  it('renameTag writes the new name', () => {
    seedTag('tag-1', 'Kleidung', 0)

    const result = createMasterDataActions(ctx).renameTag('tag-1', 'Bekleidung')

    expect(result.ok).toBe(true)
    expect(queued[0]!.muts[0]!.mutation.op).toBe('upsert')
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ name: 'Bekleidung' })
  })

  it('renameTag refuses a name another tag already holds, and writes nothing', () => {
    seedTag('tag-1', 'Kleidung', 0)
    seedTag('tag-2', 'Technik', 1)

    // Case-insensitive, like the other two UNIQUE (name) spaces: the database
    // would hold both and no screen could tell them apart.
    const result = createMasterDataActions(ctx).renameTag('tag-1', 'technik')

    expect(result).toEqual({ ok: false, collision: 'Technik' })
    expect(queued).toEqual([])
  })

  it('renameTag accepts a different capitalisation of the tag’s own name', () => {
    seedTag('tag-1', 'kleidung', 0)

    expect(createMasterDataActions(ctx).renameTag('tag-1', 'Kleidung').ok).toBe(true)
    expect(queued).toHaveLength(1)
  })

  it('deleteTag removes a tag nothing carries', () => {
    seedTag('tag-1', 'Kleidung', 0)

    const result = createMasterDataActions(ctx).deleteTag('tag-1')

    expect(result).toEqual({ ok: true })
    expect(queued[0]!.muts[0]!.mutation.op).toBe('delete')
    expect(queued[0]!.muts[0]!.mutation.id).toBe('tag-1')
  })

  it('deleteTag refuses while items carry it, and says how many (ADR-063)', () => {
    seedTag('tag-1', 'Kleidung', 0)
    seedAssignment('it-1', 'item-1', 'tag-1', 0)
    seedAssignment('it-2', 'item-2', 'tag-1', 0)

    const result = createMasterDataActions(ctx).deleteTag('tag-1')

    expect(result).toEqual({ ok: false, references: 2 })
    // The refusal is the whole point: a cascade would strip the tag from both
    // items and drop them into the leftover bucket.
    expect(queued).toEqual([])
  })

  it('mergeTags re-points the source’s assignments and then removes the source', () => {
    seedTag('tag-1', 'Sommer', 0)
    seedTag('tag-2', 'Kleidung', 1)
    seedAssignment('it-1', 'item-1', 'tag-1', 2)

    const moved = createMasterDataActions(ctx).mergeTags('tag-1', 'tag-2')

    expect(moved).toBe(1)
    const muts = queued.flatMap((q) => q.muts.map((m) => m.mutation))
    expect(muts[0]).toMatchObject({
      op: 'upsert',
      id: 'it-1',
      fields: { tag_id: 'tag-2', position: 2 },
    })
    // The source tag is gone only *after* nothing carries it any more — the
    // same order `deleteTag` would insist on.
    expect(muts[muts.length - 1]).toMatchObject({ op: 'delete', id: 'tag-1' })
  })

  it('mergeTags drops a source assignment the item would collide on', () => {
    seedTag('tag-1', 'Sommer', 0)
    seedTag('tag-2', 'Kleidung', 1)
    seedAssignment('it-1', 'item-1', 'tag-1', 3)
    seedAssignment('it-2', 'item-1', 'tag-2', 1)

    createMasterDataActions(ctx).mergeTags('tag-1', 'tag-2')

    const muts = queued.flatMap((q) => q.muts.map((m) => m.mutation))
    // UNIQUE (item_id, tag_id) — re-pointing it onto the target's own row is
    // the write the database would refuse.
    expect(muts.some((m) => m.op === 'delete' && m.id === 'it-1')).toBe(true)
    expect(muts.some((m) => m.id === 'it-1' && m.op === 'upsert')).toBe(false)
  })

  it('removes the source even when every one of its assignments was dropped', () => {
    // The plan, not the store, is what says the tag is empty. Re-asking the
    // guarded delete here reads state the merge is halfway through changing:
    // where the optimistic writes have not landed, it sees the assignments
    // that were just taken away and refuses, leaving a tag nothing carries.
    seedTag('tag-1', 'Sommer', 0)
    seedTag('tag-2', 'Kleidung', 1)
    seedAssignment('it-1', 'item-1', 'tag-1', 3)
    seedAssignment('it-2', 'item-1', 'tag-2', 1)

    createMasterDataActions(ctx).mergeTags('tag-1', 'tag-2')

    const muts = queued.flatMap((q) => q.muts.map((m) => m.mutation))
    expect(muts.at(-1)).toMatchObject({ op: 'delete', id: 'tag-1' })
  })

  it('mergeTags carries the source’s position over when it was the item’s primary tag', () => {
    seedTag('tag-1', 'Sommer', 0)
    seedTag('tag-2', 'Kleidung', 1)
    seedAssignment('it-1', 'item-1', 'tag-1', 0)
    seedAssignment('it-2', 'item-1', 'tag-2', 1)

    createMasterDataActions(ctx).mergeTags('tag-1', 'tag-2')

    const muts = queued.flatMap((q) => q.muts.map((m) => m.mutation))
    // Without this the item is filed under whatever sorts first next — the
    // very drift the merge was asked to fix.
    expect(muts).toContainEqual(
      expect.objectContaining({ op: 'upsert', id: 'it-2', fields: { position: 0 } }),
    )
  })

  it('mergeTagsMany writes one assignment per item and removes every source it emptied', () => {
    // Two spellings of one tag on one item (FR-24.14): merging them pair by
    // pair would re-point both onto Kleidung and hand the server two rows
    // `UNIQUE (item_id, tag_id)` refuses. One plan over the set re-points the
    // lower and drops the other.
    seedTag('tag-1', 'Sommer', 0)
    seedTag('tag-2', 'sommer', 1)
    seedTag('tag-3', 'Kleidung', 2)
    seedAssignment('it-1', 'item-1', 'tag-1', 0)
    seedAssignment('it-2', 'item-1', 'tag-2', 3)

    const moved = createMasterDataActions(ctx).mergeTagsMany(['tag-1', 'tag-2'], 'tag-3')

    expect(moved).toBe(1)
    const muts = queued.flatMap((q) => q.muts.map((m) => m.mutation))
    expect(muts.filter((m) => m.op === 'upsert' && m.table === 'item_tags')).toMatchObject([
      { id: 'it-1', fields: { tag_id: 'tag-3', position: 0 } },
    ])
    expect(muts.filter((m) => m.op === 'delete' && m.table === 'item_tags')).toMatchObject([
      { id: 'it-2' },
    ])
    expect(muts.filter((m) => m.op === 'delete' && m.table === 'tags')).toMatchObject([
      { id: 'tag-1' },
      { id: 'tag-2' },
    ])
  })

  it('mergeTagsMany leaves the target tag itself alone when the selection includes it', () => {
    seedTag('tag-1', 'Sommer', 0)
    seedTag('tag-2', 'Kleidung', 1)
    seedAssignment('it-1', 'item-1', 'tag-1', 0)

    createMasterDataActions(ctx).mergeTagsMany(['tag-1', 'tag-2'], 'tag-2')

    const muts = queued.flatMap((q) => q.muts.map((m) => m.mutation))
    expect(muts.filter((m) => m.op === 'delete' && m.table === 'tags')).toMatchObject([
      { id: 'tag-1' },
    ])
  })

  it('mergeTagsMany removes a picked tag no item carries either (FR-24.14)', () => {
    // A tag typed twice and used once is the common duplicate; the *unused*
    // half is just as common, and a merge that left it on the axis would be
    // the act failing quietly on the tag the user was most sure about.
    seedTag('tag-1', 'Sommersachen', 0)
    seedTag('tag-2', 'Sommer', 1)

    const moved = createMasterDataActions(ctx).mergeTagsMany(['tag-1'], 'tag-2')

    expect(moved).toBe(0)
    const muts = queued.flatMap((q) => q.muts.map((m) => m.mutation))
    expect(muts.filter((m) => m.op === 'delete' && m.table === 'tags')).toMatchObject([
      { id: 'tag-1' },
    ])
  })

  it('mergeTags into the tag itself writes nothing at all', () => {
    seedTag('tag-1', 'Sommer', 0)
    seedAssignment('it-1', 'item-1', 'tag-1', 0)

    expect(createMasterDataActions(ctx).mergeTags('tag-1', 'tag-1')).toBe(0)
    expect(queued).toEqual([])
  })

  it('reorderTags writes only the tags whose number changes', () => {
    seedTag('tag-1', 'A', 0)
    seedTag('tag-2', 'B', 1)
    seedTag('tag-3', 'C', 2)

    createMasterDataActions(ctx).reorderTags(2, 0)

    const muts = queued.flatMap((q) => q.muts.map((m) => m.mutation))
    expect(muts.map((m) => [m.id, m.fields])).toEqual([
      ['tag-3', { sort_order: 0 }],
      ['tag-1', { sort_order: 1 }],
      ['tag-2', { sort_order: 2 }],
    ])
  })

  it('reorderTags writes nothing when the drag ended where it started', () => {
    seedTag('tag-1', 'A', 0)
    seedTag('tag-2', 'B', 1)

    createMasterDataActions(ctx).reorderTags(1, 1)

    expect(queued).toEqual([])
  })

  it('giveTagToItems files an untagged item under the tag and a tagged one below its siblings (FR-24.9)', () => {
    seedTag('tag-1', 'Diverses', 0)
    seedTag('tag-2', 'Hygiene', 1)
    const bare = seedItem('item-1')
    const filed = seedItem('item-2')
    seedAssignment('it-2', 'item-2', 'tag-1', 0)

    const { touched } = createMasterDataActions(ctx).giveTagToItems([bare, filed], 'tag-2', true)

    expect(touched).toBe(2)
    const primaryOf = (itemId: string) =>
      ctx.masterStore.itemTagList
        .filter((a) => a.item_id === itemId)
        .sort((a, b) => a.position - b.position)[0]!.tag_id
    expect(primaryOf('item-1')).toBe('tag-2')
    expect(primaryOf('item-2')).toBe('tag-2')
  })

  it('giveTagToItems without primary appends the tag behind the ones the item has', () => {
    seedTag('tag-1', 'Diverses', 0)
    seedTag('tag-2', 'Hygiene', 1)
    const item = seedItem('item-1')
    seedAssignment('it-1', 'item-1', 'tag-1', 0)

    createMasterDataActions(ctx).giveTagToItems([item], 'tag-2', false)

    const muts = queued.flatMap((q) => q.muts.map((m) => m.mutation))
    expect(muts).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({ tag_id: 'tag-2', position: 1 }),
      }),
    ])
  })

  it('giveTagToItems writes nothing for items already filed as asked', () => {
    seedTag('tag-1', 'Hygiene', 0)
    const item = seedItem('item-1')
    seedAssignment('it-1', 'item-1', 'tag-1', 0)

    const { touched } = createMasterDataActions(ctx).giveTagToItems([item], 'tag-1', true)

    expect(touched).toBe(0)
    expect(queued).toEqual([])
  })

  it('takeTagFromItems removes only the items that carry the tag', () => {
    seedTag('tag-1', 'Diverses', 0)
    const carrier = seedItem('item-1')
    const other = seedItem('item-2')
    seedAssignment('it-1', 'item-1', 'tag-1', 0)

    const { touched } = createMasterDataActions(ctx).takeTagFromItems([carrier, other], 'tag-1')

    expect(touched).toBe(1)
    expect(ctx.masterStore.itemTagList).toEqual([])
  })

  it('undoBulkTag puts a give and a take back as they were, positions included', () => {
    seedTag('tag-1', 'Diverses', 0)
    seedTag('tag-2', 'Hygiene', 1)
    const item = seedItem('item-1')
    seedAssignment('it-1', 'item-1', 'tag-1', 0)
    seedAssignment('it-2', 'item-1', 'tag-2', 1)
    const actions = createMasterDataActions(ctx)
    const snapshot = () =>
      ctx.masterStore.itemTagList
        .map((a) => [a.tag_id, a.position])
        .sort((a, b) => Number(a[1]) - Number(b[1]))

    const given = actions.giveTagToItems([item], 'tag-2', true)
    expect(snapshot()[0]![0]).toBe('tag-2')
    actions.undoBulkTag(given.undo)
    expect(snapshot()).toEqual([
      ['tag-1', 0],
      ['tag-2', 1],
    ])

    const taken = actions.takeTagFromItems([item], 'tag-1')
    expect(snapshot()).toEqual([['tag-2', 1]])
    actions.undoBulkTag(taken.undo)
    expect(snapshot()).toEqual([
      ['tag-1', 0],
      ['tag-2', 1],
    ])
  })

  it('undoBulkTag removes a tag the batch itself created', () => {
    const actions = createMasterDataActions(ctx)
    const item = seedItem('item-1')
    const tagId = actions.createTag('Neu')

    const { undo } = actions.giveTagToItems([item], tagId, true, true)
    actions.undoBulkTag(undo)

    expect(ctx.masterStore.tagList).toEqual([])
    expect(ctx.masterStore.itemTagList).toEqual([])
  })
})

describe('a template’s trip tasks on the seam (FR-7.4)', () => {
  it('addTemplateTask queues one master insert and the template lists it', () => {
    const id = createMasterDataActions(ctx).addTemplateTask(TEMPLATE_ID, 'Pflanzen giessen')

    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.muts[0]!.mutation).toMatchObject({
      op: 'insert',
      table: TABLE.templateTasks,
      id,
      fields: { template_id: TEMPLATE_ID, task: 'Pflanzen giessen' },
    })
    expect(ctx.masterStore.getTemplateTasks(TEMPLATE_ID).map((t) => t.task)).toEqual([
      'Pflanzen giessen',
    ])
  })

  it('deleteTemplateTask queues a tombstone and the task leaves the template', () => {
    const actions = createMasterDataActions(ctx)
    const id = actions.addTemplateTask(TEMPLATE_ID, 'Pflanzen giessen')

    actions.deleteTemplateTask(id)

    expect(queued[1]!.muts[0]!.mutation).toMatchObject({
      op: 'delete',
      table: TABLE.templateTasks,
      id,
    })
    expect(ctx.masterStore.getTemplateTasks(TEMPLATE_ID)).toEqual([])
  })
})
