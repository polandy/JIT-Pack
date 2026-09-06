import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { UNTAGGED_KEY } from '@/domain/tags'
import { useMasterStore } from '../masterStore'
import { compositionFrom, parsePortable, serializeTemplate } from '@/domain/portable'

describe('masterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts empty', () => {
    const masterStore = useMasterStore()
    expect(masterStore.itemList).toEqual([])
    expect(masterStore.templateList).toEqual([])
    expect(masterStore.tagList).toEqual([])
  })

  it('applies tag changes', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 1,
      table: 'tags',
      id: 'c1',
      deleted: false,
      row: { name: 'Clothes', sort_order: 1 },
    })
    masterStore.applyChange({
      seq: 2,
      table: 'tags',
      id: 'c2',
      deleted: false,
      row: { name: 'Tech', sort_order: 0 },
    })

    expect(masterStore.tagList).toHaveLength(2)
    expect(masterStore.tagList[0]!.name).toBe('Tech')
    expect(masterStore.tagList[1]!.name).toBe('Clothes')
  })

  it('applies item changes', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 1,
      table: 'items',
      id: 'i1',
      deleted: false,
      row: {
        name: 'T-Shirt',
        category_id: 'c1',
        weight_grams: 200,
      },
    })

    const item = masterStore.getItem('i1')
    expect(item?.name).toBe('T-Shirt')
    expect(item?.weight_grams).toBe(200)
  })

  it('deletes items', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 1,
      table: 'items',
      id: 'i1',
      deleted: false,
      row: { name: 'Soap' },
    })
    masterStore.applyChange({ seq: 2, table: 'items', id: 'i1', deleted: true, row: null })
    expect(masterStore.getItem('i1')).toBeUndefined()
  })

  it('applies template changes', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 1,
      table: 'templates',
      id: 't1',
      deleted: false,
      row: { owner_id: 'u1', name: 'Beach Essentials' },
    })

    const tpl = masterStore.getTemplate('t1')
    expect(tpl?.name).toBe('Beach Essentials')
    expect(tpl?.owner_id).toBe('u1')
  })

  it('deletes template and its items', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 1,
      table: 'templates',
      id: 't1',
      deleted: false,
      row: { owner_id: 'u1', name: 'T' },
    })
    masterStore.applyChange({
      seq: 2,
      table: 'template_items',
      id: 'ti1',
      deleted: false,
      row: {
        template_id: 't1',
        item_id: 'i1',
        quantity: 2,
        assignment: 'per_person',
        dedup: 'max',
        default_mode: 'pack',
      },
    })
    expect(masterStore.getTemplateItems('t1')).toHaveLength(1)

    masterStore.applyChange({ seq: 3, table: 'templates', id: 't1', deleted: true, row: null })
    expect(masterStore.getTemplate('t1')).toBeUndefined()
    expect(masterStore.getTemplateItems('t1')).toEqual([])
  })

  it('upserts template items', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 1,
      table: 'template_items',
      id: 'ti1',
      deleted: false,
      row: {
        template_id: 't1',
        item_id: 'i1',
        quantity: 1,
        assignment: 'per_person',
        dedup: 'max',
        default_mode: 'pack',
      },
    })
    masterStore.applyChange({
      seq: 2,
      table: 'template_items',
      id: 'ti1',
      deleted: false,
      row: {
        template_id: 't1',
        item_id: 'i1',
        quantity: 3,
        assignment: 'trip_global',
        dedup: 'sum',
        default_mode: 'buy_before',
      },
    })

    const tis = masterStore.getTemplateItems('t1')
    expect(tis).toHaveLength(1)
    expect(tis[0]!.quantity).toBe(3)
    expect(tis[0]!.assignment).toBe('trip_global')
  })

  it('files each item under its primary tag, once (FR-24.2)', () => {
    const masterStore = useMasterStore()
    masterStore.applyChanges([
      {
        seq: 1,
        table: 'tags',
        id: 'c1',
        deleted: false,
        row: { name: 'Clothes', sort_order: 0 },
      },
      {
        seq: 2,
        table: 'tags',
        id: 'c2',
        deleted: false,
        row: { name: 'Summer', sort_order: 1 },
      },
      { seq: 3, table: 'items', id: 'i1', deleted: false, row: { name: 'Shirt' } },
      { seq: 4, table: 'items', id: 'i2', deleted: false, row: { name: 'Pants' } },
      { seq: 5, table: 'items', id: 'i3', deleted: false, row: { name: 'Charger' } },
      {
        seq: 6,
        table: 'item_tags',
        id: 'a1',
        deleted: false,
        row: { item_id: 'i1', tag_id: 'c1', position: 0 },
      },
      // Shirt is Clothes *and* Summer — it must still appear once.
      {
        seq: 7,
        table: 'item_tags',
        id: 'a2',
        deleted: false,
        row: { item_id: 'i1', tag_id: 'c2', position: 1 },
      },
      {
        seq: 8,
        table: 'item_tags',
        id: 'a3',
        deleted: false,
        row: { item_id: 'i2', tag_id: 'c1', position: 0 },
      },
    ])

    const groups = masterStore.itemsByPrimaryTag()
    expect(groups.get('Clothes')).toHaveLength(2)
    expect(groups.get('Summer')).toBeUndefined()
    expect(groups.get(UNTAGGED_KEY)).toHaveLength(1)
  })

  it('drops an item’s assignments when the item is deleted', () => {
    const masterStore = useMasterStore()
    masterStore.applyChanges([
      { seq: 1, table: 'tags', id: 'c1', deleted: false, row: { name: 'Tech', sort_order: 0 } },
      { seq: 2, table: 'items', id: 'i1', deleted: false, row: { name: 'Cable' } },
      {
        seq: 3,
        table: 'item_tags',
        id: 'a1',
        deleted: false,
        row: { item_id: 'i1', tag_id: 'c1', position: 0 },
      },
      { seq: 4, table: 'items', id: 'i1', deleted: true, row: null },
    ])

    expect(masterStore.itemTagList).toHaveLength(0)
  })

  it('drops assignments to a deleted tag, whatever order the tombstones arrive in', () => {
    const masterStore = useMasterStore()
    masterStore.applyChanges([
      { seq: 1, table: 'tags', id: 'c1', deleted: false, row: { name: 'Tech', sort_order: 0 } },
      { seq: 2, table: 'items', id: 'i1', deleted: false, row: { name: 'Cable' } },
      {
        seq: 3,
        table: 'item_tags',
        id: 'a1',
        deleted: false,
        row: { item_id: 'i1', tag_id: 'c1', position: 0 },
      },
      { seq: 4, table: 'tags', id: 'c1', deleted: true, row: null },
    ])

    expect(masterStore.itemTagList).toHaveLength(0)
    expect(masterStore.getItemTags('i1')).toEqual([])
  })

  it('searches items by name', () => {
    const masterStore = useMasterStore()
    masterStore.applyChanges([
      {
        seq: 1,
        table: 'items',
        id: 'i1',
        deleted: false,
        row: { name: 'Sunscreen' },
      },
      {
        seq: 2,
        table: 'items',
        id: 'i2',
        deleted: false,
        row: { name: 'Sunglasses' },
      },
      { seq: 3, table: 'items', id: 'i3', deleted: false, row: { name: 'Towel' } },
    ])

    expect(masterStore.searchItems('sun')).toHaveLength(2)
    expect(masterStore.searchItems('towel')).toHaveLength(1)
    expect(masterStore.searchItems('')).toHaveLength(3)
  })

  it('returns template item count', () => {
    const masterStore = useMasterStore()
    masterStore.applyChanges([
      {
        seq: 1,
        table: 'template_items',
        id: 'ti1',
        deleted: false,
        row: {
          template_id: 't1',
          item_id: 'i1',
          quantity: 1,
          assignment: 'per_person',
          dedup: 'max',
          default_mode: 'pack',
        },
      },
      {
        seq: 2,
        table: 'template_items',
        id: 'ti2',
        deleted: false,
        row: {
          template_id: 't1',
          item_id: 'i2',
          quantity: 2,
          assignment: 'per_person',
          dedup: 'max',
          default_mode: 'pack',
        },
      },
    ])

    expect(masterStore.templateItemCount('t1')).toBe(2)
    expect(masterStore.templateItemCount('nonexistent')).toBe(0)
  })

  it('applies item_dependencies changes (FR-20.1)', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 1,
      table: 'item_dependencies',
      id: 'dep1',
      deleted: false,
      row: {
        item_id: 'battery',
        depends_on_item_id: 'camera',
        mode: 'suggested',
        quantity: 2,
      },
    })

    expect(masterStore.dependencyList).toEqual([
      {
        id: 'dep1',
        item_id: 'battery',
        depends_on_item_id: 'camera',
        mode: 'suggested',
        quantity: 2,
      },
    ])
    expect(masterStore.getItemDependencies('battery')).toHaveLength(1)
    expect(masterStore.getItemDependencies('camera')).toHaveLength(0)
    expect(masterStore.getCompanionDependencies('camera')).toHaveLength(1)

    masterStore.applyChange({
      seq: 2,
      table: 'item_dependencies',
      id: 'dep1',
      deleted: true,
      row: null,
    })
    expect(masterStore.dependencyList).toEqual([])
  })

  it('defaults dependency mode to required and quantity to null', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 1,
      table: 'item_dependencies',
      id: 'dep2',
      deleted: false,
      row: { item_id: 'battery', depends_on_item_id: 'camera' },
    })
    expect(masterStore.dependencyList[0]).toMatchObject({ mode: 'required', quantity: null })
  })

  // --- Template composition (§3.27, FR-27.1/27.6) ---

  function seedComposition(masterStore: ReturnType<typeof useMasterStore>): void {
    masterStore.applyChanges([
      {
        seq: 1,
        table: 'templates',
        id: 'vac',
        deleted: false,
        row: { owner_id: 'u', name: 'Fotoreise', kind: 'template' },
      },
      {
        seq: 2,
        table: 'templates',
        id: 'grp',
        deleted: false,
        row: { owner_id: 'u', name: 'Makro', kind: 'group' },
      },
      {
        seq: 3,
        table: 'template_includes',
        id: 'inc1',
        deleted: false,
        row: { template_id: 'vac', included_template_id: 'grp' },
      },
      {
        seq: 4,
        table: 'template_items',
        id: 'p1',
        deleted: false,
        row: {
          template_id: 'grp',
          item_id: 'ringlight',
          quantity: 1,
          assignment: 'trip_global',
          dedup: 'max',
          default_mode: 'pack',
          late_packer: 0,
          conditions: null,
        },
      },
    ])
  }

  it('reads a template row without kind as a Ferien-Vorlage (migration 016 default)', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange({
      seq: 1,
      table: 'templates',
      id: 'old',
      deleted: false,
      row: { owner_id: 'u', name: 'Sommer' },
    })
    expect(masterStore.getTemplate('old')?.kind).toBe('template')
  })

  it('applies and removes template_includes rows', () => {
    const masterStore = useMasterStore()
    seedComposition(masterStore)
    expect(masterStore.getIncludes('vac')).toHaveLength(1)
    expect(masterStore.getIncludedBy('grp').map((t) => t.name)).toEqual(['Fotoreise'])

    masterStore.applyChange({
      seq: 5,
      table: 'template_includes',
      id: 'inc1',
      deleted: true,
      row: null,
    })
    expect(masterStore.getIncludes('vac')).toEqual([])
    expect(masterStore.getIncludedBy('grp')).toEqual([])
  })

  it('resolves a Vorlage through its includes, so the row count is the trip count (FR-27.2)', () => {
    const masterStore = useMasterStore()
    seedComposition(masterStore)
    // The Vorlage carries no position of its own — the count still has to be 1.
    expect(masterStore.resolve('vac').positions.map((p) => p.item_id)).toEqual(['ringlight'])
    expect(masterStore.resolve('vac').includedTemplates.map((t) => t.name)).toEqual(['Makro'])
  })

  it('drops the include rows on both sides when a template is deleted', () => {
    const masterStore = useMasterStore()
    seedComposition(masterStore)
    masterStore.applyChange({ seq: 5, table: 'templates', id: 'grp', deleted: true, row: null })
    // Server-side ON DELETE CASCADE has removed the row; a resolution taken
    // before the next pull must not name a template that is already gone.
    expect(masterStore.getIncludes('vac')).toEqual([])
    expect(masterStore.resolve('vac').includedTemplates).toEqual([])
  })

  // --- Preparation tasks on positions (FR-27.7) ---

  function seedTask(masterStore: ReturnType<typeof useMasterStore>): void {
    seedComposition(masterStore)
    masterStore.applyChange({
      seq: 5,
      table: 'template_item_tasks',
      id: 'task1',
      deleted: false,
      row: { template_item_id: 'p1', task: 'Akkus laden' },
    })
  }

  it('applies and removes template_item_tasks rows (FR-27.7)', () => {
    const masterStore = useMasterStore()
    seedTask(masterStore)
    expect(masterStore.getTemplateItemTasks('p1').map((t) => t.task)).toEqual(['Akkus laden'])

    masterStore.applyChange({
      seq: 6,
      table: 'template_item_tasks',
      id: 'task1',
      deleted: true,
      row: null,
    })
    expect(masterStore.getTemplateItemTasks('p1')).toEqual([])
  })

  it("drops a position's tasks when the position is deleted", () => {
    const masterStore = useMasterStore()
    seedTask(masterStore)
    masterStore.applyChange({ seq: 6, table: 'template_items', id: 'p1', deleted: true, row: null })
    // ON DELETE CASCADE removes them server-side; mirror it so the M8 count
    // chip cannot survive its own row between two pulls.
    expect(masterStore.getTemplateItemTasks('p1')).toEqual([])
  })

  // FR-27.1/27.7, ADR-017: the one place the three export paths — M7's row
  // action, the settings export and the NFR-4.11 backup — get their source
  // from. Asserted through `serializeTemplate`, because what the file says is
  // the whole point of the getter; a source that dropped the groups or the
  // tasks would serialize a Vorlage as a bare name.
  it('compositionSource feeds a Vorlage its groups and its tasks (FR-27.1/27.7)', () => {
    const masterStore = useMasterStore()
    masterStore.applyChanges([
      { seq: 1, table: 'items', id: 'i-cam', deleted: false, row: { name: 'Kamera' } },
      {
        seq: 2,
        table: 'templates',
        id: 'g1',
        deleted: false,
        row: { name: 'Makro', kind: 'group' },
      },
      {
        seq: 3,
        table: 'templates',
        id: 't1',
        deleted: false,
        row: { name: 'Fototage', kind: 'template' },
      },
      {
        seq: 4,
        table: 'template_items',
        id: 'p1',
        deleted: false,
        row: { template_id: 'g1', item_id: 'i-cam', quantity: 1 },
      },
      {
        seq: 5,
        table: 'template_includes',
        id: 'inc1',
        deleted: false,
        row: { template_id: 't1', included_template_id: 'g1' },
      },
      {
        seq: 6,
        table: 'template_item_tasks',
        id: 'task1',
        deleted: false,
        row: { template_item_id: 'p1', task: 'Akkus laden' },
      },
    ])

    const vorlage = masterStore.getTemplate('t1')!
    const yaml = serializeTemplate(
      vorlage,
      masterStore.getTemplateItems(vorlage.id),
      masterStore.portableResolvers().masterItem,
      compositionFrom(vorlage, masterStore.compositionSource()),
      masterStore.portableResolvers().tagsOf,
    )

    const doc = parsePortable(yaml).doc!
    expect(doc.includes.map((g) => g.name)).toEqual(['Makro'])
    expect(doc.includes[0]!.items.map((i) => i.name)).toEqual(['Kamera'])
    expect(doc.includes[0]!.items[0]!.tasks).toEqual(['Akkus laden'])
  })

  // A group is not composed of anything — the same getter must not hand it
  // includes, or a group's file would claim a composition it cannot have.
  it('compositionSource gives a group no includes (FR-27.1)', () => {
    const masterStore = useMasterStore()
    // A row that *would* resolve is what makes this a test: the include below
    // names g1 as the includer, so an empty result can only come from the
    // scope rule and not from there being nothing to find.
    masterStore.applyChanges([
      {
        seq: 1,
        table: 'templates',
        id: 'g1',
        deleted: false,
        row: { name: 'Makro', kind: 'group' },
      },
      {
        seq: 2,
        table: 'templates',
        id: 'g2',
        deleted: false,
        row: { name: 'Stative', kind: 'group' },
      },
      {
        seq: 3,
        table: 'template_includes',
        id: 'inc1',
        deleted: false,
        row: { template_id: 'g1', included_template_id: 'g2' },
      },
    ])

    const group = masterStore.getTemplate('g1')!
    const yaml = serializeTemplate(
      group,
      [],
      () => undefined,
      compositionFrom(group, masterStore.compositionSource()),
      () => [],
    )

    expect(parsePortable(yaml).doc!.includes).toEqual([])
  })
})

/**
 * The one place four screens get their portable resolvers from (ADR-024).
 *
 * It exists because the pair was written out at each call site and nothing
 * drove any copy: with all of them returning no tags, the whole unit suite and
 * the whole M18 e2e unit stayed green while the backup lost every tag. One
 * source is one thing to get right — and this is the test that gets it right.
 */
describe('portableResolvers (FR-24.1/24.2, ADR-024)', () => {
  it('resolves an item and its tags, primary first', () => {
    const masterStore = useMasterStore()
    masterStore.applyChanges([
      {
        seq: 1,
        table: 'items',
        id: 'i1',
        deleted: false,
        row: { name: 'Wanderschuhe', icon: '🥾' },
      },
      { seq: 2, table: 'tags', id: 'g1', deleted: false, row: { name: 'Schuhe', sort_order: 0 } },
      { seq: 3, table: 'tags', id: 'g2', deleted: false, row: { name: 'Sommer', sort_order: 1 } },
      // Written out of order on purpose: the *position* decides, not arrival.
      {
        seq: 4,
        table: 'item_tags',
        id: 'a2',
        deleted: false,
        row: { item_id: 'i1', tag_id: 'g2', position: 1 },
      },
      {
        seq: 5,
        table: 'item_tags',
        id: 'a1',
        deleted: false,
        row: { item_id: 'i1', tag_id: 'g1', position: 0 },
      },
    ])

    const { masterItem, tagsOf } = masterStore.portableResolvers()
    expect(masterItem('i1')).toMatchObject({ name: 'Wanderschuhe', icon: '🥾' })
    expect(tagsOf('i1')).toEqual(['Schuhe', 'Sommer'])
  })

  it('answers for an item it does not know without throwing', () => {
    const masterStore = useMasterStore()
    const { masterItem, tagsOf } = masterStore.portableResolvers()
    expect(masterItem('nope')).toBeUndefined()
    expect(tagsOf('nope')).toEqual([])
  })
})
