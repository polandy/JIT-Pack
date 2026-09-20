import { describe, it, expect } from 'vitest'

import {
  mergedIdsOf,
  planItemMerge,
  resolveMergedItem,
  type ItemMergeSources,
} from '@/domain/itemMerge'
import type { ItemDependency, ItemTag, MasterItem, TemplateItem } from '@/types/domain'

/**
 * FR-24.15: two inventory rows that are the same thing become one.
 *
 * Every collision below is one a table can refuse — `UNIQUE (item_id,
 * tag_id)`, `UNIQUE (template_id, item_id)`, `UNIQUE (item_id,
 * depends_on_item_id)` and the `CHECK (item_id <> depends_on_item_id)` — so
 * the plan decides them here, once, rather than letting the push find out.
 */

function item(id: string, name: string, extra: Partial<MasterItem> = {}): MasterItem {
  return {
    id,
    name,
    weight_grams: null,
    value_cents: null,
    icon: null,
    image_hash: null,
    retired_at: null,
    default_assignee_id: null,
    ...extra,
  } as MasterItem
}

function assign(id: string, item_id: string, tag_id: string, position = 0): ItemTag {
  return { id, item_id, tag_id, position }
}

function edge(id: string, item_id: string, depends_on_item_id: string): ItemDependency {
  return { id, item_id, depends_on_item_id, mode: 'required', quantity: null }
}

function position(id: string, template_id: string, item_id: string, quantity = 1): TemplateItem {
  return {
    id,
    template_id,
    item_id,
    quantity,
    assignment: 'per_person',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
  }
}

const SURVIVOR = 'i-lamp'
const LOSER = 'i-lamp-petzl'

function sources(over: Partial<ItemMergeSources> = {}): ItemMergeSources {
  return {
    items: [item(SURVIVOR, 'Stirnlampe'), item(LOSER, 'Stirnlampe Petzl')],
    assignments: [],
    dependencies: [],
    positions: [],
    tasks: [],
    ...over,
  }
}

describe('planItemMerge — the tags the survivor ends up with (FR-24.15)', () => {
  it('re-points a tag only the loser carries', () => {
    const only = assign('a1', LOSER, 't-technik', 0)

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ assignments: [only] }))

    expect(plan.tags.repoint).toEqual([only])
    expect(plan.tags.drop).toEqual([])
  })

  it('drops a tag both carry, and never moves the survivor’s primary', () => {
    // The survivor's filing is what the user chose by naming it the survivor,
    // so unlike FR-24.14 there is no promote: its own position 0 stays.
    const mine = assign('a1', SURVIVOR, 't-technik', 0)
    const theirs = assign('a2', LOSER, 't-technik', 0)

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ assignments: [mine, theirs] }))

    expect(plan.tags.drop).toEqual([theirs])
    expect(plan.tags.repoint).toEqual([])
  })

  it('keeps one assignment when two losers carry the same tag', () => {
    const second = 'i-lamp-old'
    const a = assign('a1', LOSER, 't-technik', 0)
    const b = assign('a2', second, 't-technik', 0)

    const plan = planItemMerge(
      SURVIVOR,
      [LOSER, second],
      sources({
        items: [item(SURVIVOR, 'Stirnlampe'), item(LOSER, 'Petzl'), item(second, 'Alt')],
        assignments: [a, b],
      }),
    )

    expect(plan.tags.repoint).toEqual([a])
    expect(plan.tags.drop).toEqual([b])
  })

  it('appends a re-pointed tag after the survivor’s own, never at its primary position', () => {
    const mine = assign('a1', SURVIVOR, 't-technik', 0)
    const theirs = assign('a2', LOSER, 't-licht', 0)

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ assignments: [mine, theirs] }))

    expect(plan.tags.repoint).toEqual([theirs])
    expect(plan.tags.positionOf(theirs.id)).toBe(1)
  })
})

describe('planItemMerge — the dependency edges (FR-24.15, §3.20)', () => {
  it('re-points an edge from either end', () => {
    const companion = edge('d1', 'i-battery', LOSER)
    const main = edge('d2', LOSER, 'i-helmet')

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ dependencies: [companion, main] }))

    expect(plan.dependencies.repoint).toEqual([
      { edge: companion, item_id: 'i-battery', depends_on_item_id: SURVIVOR },
      { edge: main, item_id: SURVIVOR, depends_on_item_id: 'i-helmet' },
    ])
  })

  it('drops an edge between the two merged rows — it would become a self-edge', () => {
    const between = edge('d1', LOSER, SURVIVOR)

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ dependencies: [between] }))

    expect(plan.dependencies.repoint).toEqual([])
    expect(plan.dependencies.drop).toEqual([between])
    expect(plan.dependencies.selfEdges).toBe(1)
  })

  it('drops an edge the survivor already has, which UNIQUE would refuse', () => {
    const mine = edge('d1', 'i-battery', SURVIVOR)
    const theirs = edge('d2', 'i-battery', LOSER)

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ dependencies: [mine, theirs] }))

    expect(plan.dependencies.drop).toEqual([theirs])
    expect(plan.dependencies.repoint).toEqual([])
  })

  it('drops an edge that would close a cycle, and counts it', () => {
    // helmet depends on the survivor; the loser depends on the helmet. Moving
    // the loser's edge onto the survivor makes survivor → helmet → survivor.
    const existing = edge('d1', 'i-helmet', SURVIVOR)
    const theirs = edge('d2', LOSER, 'i-helmet')

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ dependencies: [existing, theirs] }))

    expect(plan.dependencies.drop).toEqual([theirs])
    expect(plan.dependencies.cycles).toBe(1)
    expect(plan.dependencies.repoint).toEqual([])
  })
})

describe('planItemMerge — the Vorlagen positions (FR-24.15)', () => {
  it('re-points a position the survivor is not in', () => {
    const theirs = position('p1', 'tpl-camping', LOSER, 2)

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ positions: [theirs] }))

    expect(plan.positions.repoint).toEqual([theirs])
    expect(plan.positions.collapse).toEqual([])
  })

  it('collapses two positions of one Vorlage, keeping the survivor’s settings and the higher amount', () => {
    const mine = position('p1', 'tpl-camping', SURVIVOR, 1)
    const theirs = position('p2', 'tpl-camping', LOSER, 3)

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ positions: [mine, theirs] }))

    expect(plan.positions.repoint).toEqual([])
    expect(plan.positions.collapse).toEqual([{ keep: mine, drop: theirs, quantity: 3, tasks: [] }])
  })

  it('carries the dropped position’s preparation tasks over rather than losing the words', () => {
    const mine = position('p1', 'tpl-camping', SURVIVOR, 1)
    const theirs = position('p2', 'tpl-camping', LOSER, 1)

    const plan = planItemMerge(
      SURVIVOR,
      [LOSER],
      sources({
        positions: [mine, theirs],
        tasks: [
          { id: 'tk1', template_item_id: 'p2', task: 'Akku laden' },
          { id: 'tk2', template_item_id: 'p1', task: 'Gurt prüfen' },
        ],
      }),
    )

    expect(plan.positions.collapse[0]!.tasks).toEqual(['Akku laden'])
  })

  it('collapses two losers in one Vorlage onto the survivor’s single position', () => {
    const second = 'i-lamp-old'
    const mine = position('p1', 'tpl-camping', SURVIVOR, 1)
    const a = position('p2', 'tpl-camping', LOSER, 2)
    const b = position('p3', 'tpl-camping', second, 5)

    const plan = planItemMerge(
      SURVIVOR,
      [LOSER, second],
      sources({
        items: [item(SURVIVOR, 'Stirnlampe'), item(LOSER, 'Petzl'), item(second, 'Alt')],
        positions: [mine, a, b],
      }),
    )

    expect(plan.positions.collapse).toEqual([
      { keep: mine, drop: a, quantity: 2, tasks: [] },
      { keep: mine, drop: b, quantity: 5, tasks: [] },
    ])
    // The amount the survivor ends up at is the highest of the three, not the
    // last one written — the writes happen in order and each takes the max.
    expect(plan.positions.quantityOf('p1')).toBe(5)
  })

  it('collapses two losers in a Vorlage the survivor is not in — the first one re-points, the rest fold into it', () => {
    const second = 'i-lamp-old'
    const a = position('p2', 'tpl-camping', LOSER, 2)
    const b = position('p3', 'tpl-camping', second, 5)

    const plan = planItemMerge(
      SURVIVOR,
      [LOSER, second],
      sources({
        items: [item(SURVIVOR, 'Stirnlampe'), item(LOSER, 'Petzl'), item(second, 'Alt')],
        positions: [a, b],
      }),
    )

    expect(plan.positions.repoint).toEqual([a])
    expect(plan.positions.collapse).toEqual([{ keep: a, drop: b, quantity: 5, tasks: [] }])
  })
})

describe('planItemMerge — what the survivor takes over (FR-24.15)', () => {
  it('fills only the fields the survivor left empty', () => {
    const survivor = item(SURVIVOR, 'Stirnlampe', { weight_grams: 90 })
    const loser = item(LOSER, 'Petzl', {
      weight_grams: 120,
      value_cents: 4990,
      icon: '🔦',
      default_assignee_id: 'u-sia',
    })

    const plan = planItemMerge(SURVIVOR, [LOSER], sources({ items: [survivor, loser] }))

    expect(plan.fields).toEqual({ value_cents: 4990, icon: '🔦', default_assignee_id: 'u-sia' })
  })

  it('takes the first loser that has a value, in the order they were picked', () => {
    const second = 'i-lamp-old'
    const plan = planItemMerge(
      SURVIVOR,
      [LOSER, second],
      sources({
        items: [
          item(SURVIVOR, 'Stirnlampe'),
          item(LOSER, 'Petzl', { weight_grams: 120 }),
          item(second, 'Alt', { weight_grams: 200 }),
        ],
      }),
    )

    expect(plan.fields.weight_grams).toBe(120)
  })

  it('names the loser whose photo the survivor takes, and none when it has its own', () => {
    const withPhoto = item(LOSER, 'Petzl', { image_hash: 'abc' })

    expect(
      planItemMerge(SURVIVOR, [LOSER], sources({ items: [item(SURVIVOR, 'S'), withPhoto] }))
        .photoFrom,
    ).toBe(LOSER)
    expect(
      planItemMerge(
        SURVIVOR,
        [LOSER],
        sources({ items: [item(SURVIVOR, 'S', { image_hash: 'own' }), withPhoto] }),
      ).photoFrom,
    ).toBeNull()
  })
})

describe('planItemMerge — the alias the rear view reads (FR-24.15)', () => {
  it('aliases every loser at the survivor', () => {
    const second = 'i-lamp-old'

    const plan = planItemMerge(
      SURVIVOR,
      [LOSER, second],
      sources({ items: [item(SURVIVOR, 'S'), item(LOSER, 'P'), item(second, 'A')] }),
    )

    expect(plan.aliases).toEqual([LOSER, second])
  })

  it('flattens a chain: a row already pointing at a loser is re-pointed at the survivor', () => {
    // Merged last year into what is now itself being merged away. One hop is
    // the whole contract the readers are written against.
    const older = item('i-lamp-2019', 'Stirnlampe alt', {
      retired_at: '2026-01-01T00:00:00Z',
      merged_into_id: LOSER,
    })

    const plan = planItemMerge(
      SURVIVOR,
      [LOSER],
      sources({ items: [item(SURVIVOR, 'S'), item(LOSER, 'P'), older] }),
    )

    expect(plan.aliases).toEqual([LOSER, 'i-lamp-2019'])
  })

  it('refuses a survivor that is also named as a loser', () => {
    expect(() => planItemMerge(SURVIVOR, [SURVIVOR], sources())).toThrow(
      /survivor cannot also be merged away/,
    )
  })
})

describe('reading through the alias (FR-24.15, ADR-069)', () => {
  const survivor = item(SURVIVOR, 'Stirnlampe')
  const loser = item(LOSER, 'Petzl', {
    retired_at: '2026-09-20T00:00:00Z',
    merged_into_id: SURVIVOR,
  })
  const other = item('i-zelt', 'Zelt')

  it('reads the survivor’s history as its own plus what was merged into it', () => {
    expect(mergedIdsOf(SURVIVOR, [survivor, loser, other])).toEqual([SURVIVOR, LOSER])
  })

  it('gives a plain item only itself', () => {
    expect(mergedIdsOf('i-zelt', [survivor, loser, other])).toEqual(['i-zelt'])
  })

  it('resolves a trip row’s item to the survivor, one hop', () => {
    expect(resolveMergedItem(LOSER, [survivor, loser, other])).toBe(SURVIVOR)
    expect(resolveMergedItem(SURVIVOR, [survivor, loser, other])).toBe(SURVIVOR)
  })

  it('treats a chain as no alias rather than walking it', () => {
    // Two devices merging the same pair in opposite directions converge on a
    // pair of rows naming each other (field-level LWW). A reader that walked
    // would loop; one that stops reports the two pasts separately, which is
    // where the product was before the merge existed.
    const a = item('i-a', 'A', { merged_into_id: 'i-b' })
    const b = item('i-b', 'B', { merged_into_id: 'i-a' })

    expect(resolveMergedItem('i-a', [a, b])).toBe('i-a')
    expect(resolveMergedItem('i-b', [a, b])).toBe('i-b')
  })
})
