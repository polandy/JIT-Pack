/**
 * Master items, their tags and companion links (FR-24, Addendum 3.20). Spread into
 * `createMutations` (`../mutations.ts`).
 */

import { TABLE } from '@/api/tables'
import { rowFrom } from '@/sync/columns'
import { newId } from '@/lib/ids'
import type { Mutation } from '@/api/types'
import type { ItemDependency, MasterItem, MasterItemOptions } from '@/types/domain'
import type { MutationContext } from './context'

/** M10's item editor, plus FR-24.3's marker — which `deleteMasterItem` and
 * `restoreMasterItem` write, and no screen sets by hand. `image_hash` is not
 * here: the bytes travel their own endpoints (ADR-002) and the hash with them. */
export type MasterItemEdit = Partial<
  Pick<
    MasterItem,
    | 'name'
    | 'weight_grams'
    | 'value_cents'
    | 'icon'
    | 'default_assignee_id'
    | 'retired_at'
    | 'merged_into_id'
  >
>

/** Addendum §3.20's companion link. Both item ids are the edge itself. */
export type ItemDependencyEdit = Partial<Pick<ItemDependency, 'mode' | 'quantity'>>

export function createMasterDataMutations({ make }: MutationContext) {
  // --- Master data mutations ---

  function createMasterItem(
    name: string,
    opts: MasterItemOptions = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.items, id, {
      name,
      weight_grams: opts.weightGrams ?? null,
      value_cents: opts.valueCents ?? null,
      icon: opts.icon ?? null,
      default_assignee_id: opts.defaultAssigneeId ?? null,
    })
    return { mutation, id }
  }

  function updateMasterItem(itemId: string, fields: MasterItemEdit): Mutation {
    return make('upsert', TABLE.items, itemId, rowFrom(fields))
  }

  function deleteMasterItem(itemId: string): Mutation {
    return make('delete', TABLE.items, itemId)
  }

  // --- Item dependency mutations (Addendum 3.20, master partition) ---

  function addItemDependency(
    itemId: string,
    dependsOnItemId: string,
    opts: { mode?: 'required' | 'suggested'; quantity?: number | null } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.itemDependencies, id, {
      item_id: itemId,
      depends_on_item_id: dependsOnItemId,
      mode: opts.mode ?? 'required',
      quantity: opts.quantity ?? null,
    })
    return { mutation, id }
  }

  function updateItemDependency(dependencyId: string, fields: ItemDependencyEdit): Mutation {
    return make('upsert', TABLE.itemDependencies, dependencyId, rowFrom(fields))
  }

  function deleteItemDependency(dependencyId: string): Mutation {
    return make('delete', TABLE.itemDependencies, dependencyId)
  }

  // --- Tag mutations (FR-24.1) ---

  function createTag(
    name: string,
    sortOrder: number = 0,
    icon: string | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    // The mark only when one was chosen (FR-24.13): an insert that spells out
    // `icon: null` says nothing an absent column does not.
    const fields = icon ? { name, sort_order: sortOrder, icon } : { name, sort_order: sortOrder }
    const mutation = make('insert', TABLE.tags, id, fields)
    return { mutation, id }
  }

  /**
   * Assign a tag to an item at `position` — 0 makes it the item's primary
   * tag (FR-24.2). One row per assignment so two people tagging the same
   * item offline both keep their edit (ADR-014).
   */
  function assignTag(
    itemId: string,
    tagId: string,
    position: number,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.itemTags, id, {
      item_id: itemId,
      tag_id: tagId,
      position,
    })
    return { mutation, id }
  }

  function unassignTag(assignmentId: string): Mutation {
    return make('delete', TABLE.itemTags, assignmentId)
  }

  /**
   * Move an existing assignment (FR-24.9) — one write, not a delete and a
   * re-insert. The row carries nothing but the pairing and its order, so
   * rewriting the position is the whole move; tearing it down and building it
   * again would put a tombstone in the feed for a change that never removed
   * anything (ADR-052).
   */
  function moveTag(assignmentId: string, position: number): Mutation {
    return make('upsert', TABLE.itemTags, assignmentId, { position })
  }

  // --- Managing the tags themselves (FR-24.10) ---

  /**
   * Rename a tag. `tags.name` is `UNIQUE`, so whether the name is free is
   * `nameCollision.findNameCollision`'s answer and is asked before this.
   */
  function renameTag(tagId: string, name: string): Mutation {
    return make('upsert', TABLE.tags, tagId, { name })
  }

  /**
   * Set or clear a tag's mark (FR-24.13). The field alone, for
   * {@link renameTag}'s reason — and `null` is written, not omitted, because
   * clearing is a state of its own (FR-28.1).
   */
  function setTagMark(tagId: string, icon: string | null): Mutation {
    return make('upsert', TABLE.tags, tagId, { icon })
  }

  /** Move a tag on the inventory's axis (FR-24.10) — its grouping order. */
  function reorderTag(tagId: string, sortOrder: number): Mutation {
    return make('upsert', TABLE.tags, tagId, { sort_order: sortOrder })
  }

  /**
   * Point an existing assignment at another tag — the write a merge is made
   * of (FR-24.10). One upsert rather than a delete and an insert, for
   * {@link moveTag}'s reason: nothing about the pairing is removed, so a
   * tombstone would describe something that never happened (ADR-052), and a
   * re-insert would lose the position the item was filed at.
   */
  function retagAssignment(assignmentId: string, tagId: string, position: number): Mutation {
    return make('upsert', TABLE.itemTags, assignmentId, { tag_id: tagId, position })
  }

  /**
   * Point an existing assignment at another **item** — FR-24.15's merge, the
   * mirror of {@link retagAssignment}. One upsert for the same reason: the
   * pairing is not removed, it now names a different item, and the row keeps
   * being the row the feed already knows.
   */
  function reassignItemTag(assignmentId: string, itemId: string, position: number): Mutation {
    return make('upsert', TABLE.itemTags, assignmentId, { item_id: itemId, position })
  }

  /**
   * Move one end of a dependency edge onto the survivor of a merge (FR-24.15).
   * Both ends are written, because either or both may be a merged-away row and
   * the plan has already decided what each resolves to.
   */
  function repointItemDependency(
    dependencyId: string,
    itemId: string,
    dependsOnItemId: string,
  ): Mutation {
    return make('upsert', TABLE.itemDependencies, dependencyId, {
      item_id: itemId,
      depends_on_item_id: dependsOnItemId,
    })
  }

  /**
   * Point a Vorlage position at the survivor of a merge (FR-24.15).
   *
   * Deliberately an update and not the delete-and-add M8's editor uses to
   * *move* a position: the row's FR-27.7 preparation tasks hang off its id
   * (`template_item_tasks.template_item_id`, `ON DELETE CASCADE`), so
   * re-creating the position would silently take the user's own words with it.
   */
  function repointTemplateItem(templateItemId: string, itemId: string): Mutation {
    return make('upsert', TABLE.templateItems, templateItemId, { item_id: itemId })
  }

  /** Remove a tag. Only ever called once nothing carries it (ADR-063). */
  function deleteTag(tagId: string): Mutation {
    return make('delete', TABLE.tags, tagId)
  }

  return {
    createMasterItem,
    updateMasterItem,
    deleteMasterItem,
    addItemDependency,
    updateItemDependency,
    deleteItemDependency,
    createTag,
    assignTag,
    unassignTag,
    moveTag,
    renameTag,
    setTagMark,
    reorderTag,
    retagAssignment,
    reassignItemTag,
    repointItemDependency,
    repointTemplateItem,
    deleteTag,
  }
}
