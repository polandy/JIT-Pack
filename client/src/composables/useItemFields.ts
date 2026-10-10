/**
 * M10's fields, asked without asking which mode the editor is in (FR-24.1,
 * FR-24.5).
 *
 * The editor creates and edits on one screen. Creating stages every field in
 * a draft that "Artikel anlegen ✓" commits; editing writes each change
 * through at once (G-5). Both answer the same `ItemFieldPort`, so the
 * template and the pickers read one value and call one setter per field,
 * and a new field is one member of the port that each mode must answer.
 */
import { computed, ref, type ComputedRef } from 'vue'

import { centsAsInput, parseCents } from '@/lib/currency'
import { gramsAsInput, parseGrams } from '@/lib/weight'
import type { MasterItemEdit } from '@/sync/mutations'
import type { MasterItem, Tag } from '@/types/domain'

/** The typed fields — an input shows text and hands text back. */
export const ITEM_TEXT_FIELDS = ['name', 'weight', 'price'] as const
export type ItemTextField = (typeof ITEM_TEXT_FIELDS)[number]

/** One editor field set, in whichever mode the page is. */
export interface ItemFieldPort {
  /** What the field's input shows. */
  text(field: ItemTextField): string
  /** A keystroke. The draft stages it, so the mark's suggestion follows the name as it is typed. */
  type(field: ItemTextField, text: string): void
  /** The input lost focus. The live row writes it here — once per edit, not per key. */
  settle(field: ItemTextField, text: string): void
  /** The assigned tags, primary first (FR-24.9). */
  tags: Tag[]
  assignTag(tagId: string): void
  unassignTag(tagId: string): void
  /** FR-24.9: where the item is filed in the inventory. */
  makePrimary(tagId: string): void
  /** FR-28.1: the item's mark, or none. */
  mark: string | null
  setMark(mark: string | null): void
  /** FR-1.9: the default assignee, or nobody. */
  assignee: string | null
  setAssignee(userId: string | null): void
}

/** What "Artikel anlegen ✓" commits. */
export interface ItemDraft {
  name: string
  weightGrams: number | null
  valueCents: number | null
  icon: string | null
  defaultAssigneeId: string | null
  tagIds: string[]
}

/** The rows and writes the live fields need — the page fills it from the stores and the orchestrator. */
export interface ItemFieldSource {
  item(itemId: string): MasterItem | undefined
  allTags(): Tag[]
  itemTags(itemId: string): Tag[]
  assignTag(itemId: string, tagId: string): void
  unassignTag(itemId: string, tagId: string): void
  setPrimaryTag(itemId: string, tagId: string): void
  update(item: MasterItem, edit: MasterItemEdit): void
}

/**
 * The editor's fields: the draft while `itemId()` names nothing, the live row
 * once it does. `draft()` is the staged item for the creating page to commit.
 */
export function useItemFields(
  itemId: () => string | undefined,
  source: ItemFieldSource,
): { fields: ComputedRef<ItemFieldPort>; draft: () => ItemDraft } {
  const staged = {
    text: ref<Record<ItemTextField, string>>({ name: '', weight: '', price: '' }),
    tagIds: ref<string[]>([]),
    icon: ref<string | null>(null),
    assignee: ref<string | null>(null),
  }

  function stage(field: ItemTextField, text: string) {
    staged.text.value = { ...staged.text.value, [field]: text }
  }

  const draftFields: ItemFieldPort = {
    text: (field) => staged.text.value[field],
    type: stage,
    settle: stage,
    get tags() {
      const byId = new Map(source.allTags().map((tag) => [tag.id, tag]))
      return staged.tagIds.value.map((id) => byId.get(id)).filter((tag): tag is Tag => !!tag)
    },
    assignTag(tagId) {
      if (!staged.tagIds.value.includes(tagId))
        staged.tagIds.value = [...staged.tagIds.value, tagId]
    },
    unassignTag(tagId) {
      staged.tagIds.value = staged.tagIds.value.filter((id) => id !== tagId)
    },
    // The draft's order is the assignment order, so the primary is a move, not a write.
    makePrimary(tagId) {
      staged.tagIds.value = [tagId, ...staged.tagIds.value.filter((id) => id !== tagId)]
    },
    get mark() {
      return staged.icon.value
    },
    setMark: (mark) => (staged.icon.value = mark),
    get assignee() {
      return staged.assignee.value
    },
    setAssignee: (userId) => (staged.assignee.value = userId),
  }

  function liveFields(id: string): ItemFieldPort {
    const item = () => source.item(id)
    const write = (edit: MasterItemEdit) => {
      const row = item()
      if (row) source.update(row, edit)
    }
    const parsed: Record<ItemTextField, (text: string) => MasterItemEdit | null> = {
      // An emptied name is not a rename; the field keeps the saved one on the next render.
      name: (text) => (text.trim() ? { name: text.trim() } : null),
      weight: (text) => ({ weight_grams: parseGrams(text) }),
      price: (text) => ({ value_cents: parseCents(text) }),
    }
    const shown: Record<ItemTextField, (row: MasterItem) => string> = {
      name: (row) => row.name,
      weight: (row) => gramsAsInput(row.weight_grams),
      price: (row) => centsAsInput(row.value_cents),
    }
    return {
      text: (field) => {
        const row = item()
        return row ? shown[field](row) : ''
      },
      type: () => {},
      settle(field, text) {
        const edit = parsed[field](text)
        if (edit) write(edit)
      },
      get tags() {
        return source.itemTags(id)
      },
      assignTag: (tagId) => source.assignTag(id, tagId),
      unassignTag: (tagId) => source.unassignTag(id, tagId),
      makePrimary: (tagId) => source.setPrimaryTag(id, tagId),
      get mark() {
        return item()?.icon ?? null
      },
      setMark: (mark) => write({ icon: mark }),
      get assignee() {
        return item()?.default_assignee_id ?? null
      },
      setAssignee: (userId) => write({ default_assignee_id: userId }),
    }
  }

  const fields = computed(() => {
    const id = itemId()
    return id ? liveFields(id) : draftFields
  })

  const draft = (): ItemDraft => ({
    name: staged.text.value.name.trim(),
    weightGrams: parseGrams(staged.text.value.weight),
    valueCents: parseCents(staged.text.value.price),
    icon: staged.icon.value,
    defaultAssigneeId: staged.assignee.value,
    tagIds: staged.tagIds.value,
  })

  return { fields, draft }
}
