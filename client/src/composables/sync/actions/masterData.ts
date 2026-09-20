/**
 * Master-data actions (M7–M10, master partition): tags (FR-24.1/24.2), master
 * items and Vorlagen (FR-24.3, FR-27.1, FR-28.8). One group because FR-24.3's
 * retire/restore machinery is shared by items and Vorlagen — the reference
 * count, the outlook and the restore verdict are written once and asked twice.
 *
 * The item *photo* is deliberately not here: ADR-002 keeps image bytes outside
 * the sync envelope, so `setItemImage` and its two siblings queue no mutation
 * and share nothing with this group but the row they paint. They stay on the
 * orchestrator until the transport itself is cut.
 */
import { planItemMerge, type FilledFields } from '@/domain/itemMerge'
import {
  DELETION_RETIRE,
  RETIRED_FIELD,
  countItemReferences,
  countTemplateReferences,
  deletionKind,
  type DeletionKind,
} from '@/domain/masterDeletion'
import {
  RESTORE_READY,
  restoreFields,
  restoreVerdict,
  type RestoreVerdict,
} from '@/domain/masterRestore'
import {
  assignmentOf,
  planTagGrant,
  planTagMergeMany,
  planTagRemoval,
  planTagReorder,
  primaryPosition,
  tagDeletion,
  TAG_DELETE_REFUSED,
} from '@/domain/tags'
import { planDefaultAssignee, type AssigneeChange } from '@/domain/defaultAssignee'
import { findNameCollision } from '@/domain/nameCollision'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { cascadeChanges } from '@/sync/cascade'
import { TABLE } from '@/types/tables'
import { masterItemRow, templateItemRow, templateRow } from '../rows'
import { isTakenRename } from '../names'
import type { MasterItemEdit, TemplateEdit, TemplateItemEdit } from '@/sync/mutations'
import type { ItemTag, MasterItem, Template, TemplateItem, TemplateKind } from '@/types/domain'
import type { SyncContext } from '../context'

/**
 * FR-24.3: what a delete of one master row will do, as far as this device can
 * tell. `certain` is false exactly where the count may be short — Server Mode,
 * where trip partitions arrive only as trips are opened (ADR-032).
 */
export interface DeletionOutlook {
  kind: DeletionKind
  references: number
  certain: boolean
}

/**
 * What a rename answered (FR-24.10). The refusal carries the *name* of the
 * tag already holding it rather than its id: the screen says it out loud,
 * and an id would make the caller look it up again to do so.
 */
export type TagRenameResult = { ok: true } | { ok: false; collision: string }

/**
 * What a delete answered (FR-24.10, ADR-063). A refusal carries how many
 * items carry the tag, because „still in use" without a number tells the
 * user nothing about how big the merge they now have to do is.
 */
export type TagDeleteResult = { ok: true } | { ok: false; references: number }

/**
 * What one bulk tag batch wrote, and how to write it back (FR-24.9): the
 * assignments it created (to remove) and the ones it moved or removed (to put
 * back where they were, position included).
 */
export interface BulkTagUndo {
  created: string[]
  moved: { assignmentId: string; position: number }[]
  removed: ItemTag[]
  /**
   * A tag the batch itself created (FR-24.9's create row). Undone last, once
   * the assignments above have emptied it — an undo that left the tag behind
   * would leave a name typed by mistake on the axis for good.
   */
  createdTag?: string
}

/** A bulk batch's answer: how many items it changed, and its undo. */
export interface BulkTagResult {
  touched: number
  undo: BulkTagUndo
}

/**
 * What one bulk assignee batch wrote (FR-1.9 over FR-24.9): each item it
 * rewrote, with the value it held before. Per item rather than one previous
 * value for the batch, because a selection is rarely uniform — the point of
 * the action is that it spans items that named different people, or nobody.
 */
export interface BulkAssigneeUndo {
  changed: AssigneeChange[]
}

/** A bulk assignee batch's answer: how many items it changed, and its undo. */
export interface BulkAssigneeResult {
  touched: number
  undo: BulkAssigneeUndo
}

/** createMasterDataActions binds the master-data group to one sync context. */
export function createMasterDataActions(ctx: SyncContext) {
  const { mutations, enqueueAndDrain, masterStore, tripStore, knownTripItems, names, local } = ctx

  /**
   * Create a tag by typing its name (FR-24.1), optionally with its mark
   * (FR-24.13); FR-24.10 is where one is fixed.
   */
  function createTag(name: string, icon: string | null = null): string {
    const { mutation, id } = mutations.createTag(name, masterStore.tagList.length, icon)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  /** Assign a tag to an item; appended last unless it is the first (FR-24.2). */
  function assignTag(itemId: string, tagId: string): string {
    const position = masterStore.getItemTags(itemId).length
    const { mutation, id } = mutations.assignTag(itemId, tagId, position)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function unassignTag(assignmentId: string): void {
    const mutation = mutations.unassignTag(assignmentId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /**
   * Assign a tag at a position the caller chose (FR-24.9) — how an item is
   * *refiled* rather than merely tagged: {@link primaryPosition} lands below
   * every sibling, so the inventory groups the item under the new tag.
   */
  function assignTagAt(itemId: string, tagId: string, position: number): string {
    const { mutation, id } = mutations.assignTag(itemId, tagId, position)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  /**
   * Move one assignment to a position (FR-24.9). Exposed beside
   * {@link setPrimaryTag} because an *undo* has to put a row back where it
   * was, and „first" is not where it was.
   */
  function moveTag(assignmentId: string, position: number): void {
    const assignment = masterStore.itemTagList.find((a) => a.id === assignmentId)
    if (!assignment || assignment.position === position) return
    const mutation = mutations.moveTag(assignmentId, position)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, { ...assignment }),
    })
  }

  /**
   * Make a tag the item already carries its primary one (FR-24.9) — the
   * write M10's chip row and M9's bulk action share. A no-op where the item
   * does not carry the tag at all: the caller's plan says which items those
   * are, and writing a position for an assignment that does not exist would
   * invent one.
   */
  function setPrimaryTag(itemId: string, tagId: string): void {
    const assignment = assignmentOf(itemId, tagId, masterStore.itemTagList)
    if (!assignment) return
    moveTag(assignment.id, primaryPosition(itemId, masterStore.itemTagList))
  }

  /**
   * Give a tag to many items at once (FR-24.9), optionally filing them under
   * it. Items already carrying it as asked are not rewritten, so a second run
   * of the same batch is a no-op. `createdTag` marks the tag as made for this
   * batch, so the undo removes it too.
   *
   * One action for M9's bulk sheet and `jitpack tags give`: the plan decides
   * which items write what, and the loop below is where positions are read.
   */
  function giveTagToItems(
    items: MasterItem[],
    tagId: string,
    primary: boolean,
    createdTag = false,
  ): BulkTagResult {
    const plan = planTagGrant(items, masterStore.itemTagList, tagId, primary)
    const undo: BulkTagUndo = { created: [], moved: [], removed: [] }
    if (createdTag) undo.createdTag = tagId

    for (const item of plan.missing) {
      // Read per item, immediately before its own write: each insert changes
      // what the next one has to land below.
      const position = primary
        ? primaryPosition(item.id, masterStore.itemTagList)
        : masterStore.getItemTags(item.id).length
      undo.created.push(assignTagAt(item.id, tagId, position))
    }
    for (const { item, assignment } of plan.demoted) {
      undo.moved.push({ assignmentId: assignment.id, position: assignment.position })
      setPrimaryTag(item.id, tagId)
    }
    return { touched: plan.missing.length + plan.demoted.length, undo }
  }

  /** Take a tag away from every one of these items that carries it (FR-24.9). */
  function takeTagFromItems(items: MasterItem[], tagId: string): BulkTagResult {
    const rows = planTagRemoval(items, masterStore.itemTagList, tagId)
    const undo: BulkTagUndo = { created: [], moved: [], removed: rows.map((row) => ({ ...row })) }
    for (const row of rows) unassignTag(row.id)
    return { touched: rows.length, undo }
  }

  /** Write one bulk batch back (FR-24.9's „Rückgängig"). */
  function undoBulkTag(undo: BulkTagUndo): void {
    for (const assignmentId of undo.created) unassignTag(assignmentId)
    for (const { assignmentId, position } of undo.moved) moveTag(assignmentId, position)
    // Re-created rather than revived: the row was deleted, so it comes back as
    // a new assignment at the position it held.
    for (const row of undo.removed) assignTagAt(row.item_id, row.tag_id, row.position)
    // The guarded delete, deliberately: the unassignments above painted
    // synchronously, so the guard sees an empty tag — and if another device has
    // meanwhile filed something under it, refusing is the right answer.
    if (undo.createdTag) deleteTag(undo.createdTag)
  }

  // --- Managing the tags themselves (FR-24.10) ---

  /**
   * Rename a tag, unless another tag already holds the name (FR-24.10).
   *
   * `tags.name` is the third `UNIQUE (name)` space beside Vorlagen (FR-1.6)
   * and series (FR-13.1), and the device holds the whole master partition —
   * so the collision is found here, where the name was typed, rather than
   * arriving later as a refused push. The result names the *existing* tag,
   * because „Technik gibt es schon" is the sentence the screen has to say.
   */
  function renameTag(tagId: string, name: string): TagRenameResult {
    const collision = findNameCollision(name, masterStore.tagList, tagId)
    if (collision) return { ok: false, collision: collision.name }

    const mutation = mutations.renameTag(tagId, name.trim())
    const tag = masterStore.tagList.find((t) => t.id === tagId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, tag ? { ...tag } : {}),
    })
    return { ok: true }
  }

  /**
   * Set or clear a tag's mark (FR-24.13). Choosing the mark the tag already
   * has writes nothing — a picker tapped twice is not an edit, and under
   * field-level LWW an empty write would still win against a real one made
   * elsewhere in the meantime.
   */
  function setTagMark(tagId: string, icon: string | null): void {
    const tag = masterStore.tagList.find((t) => t.id === tagId)
    if (!tag || (tag.icon ?? null) === icon) return
    const mutation = mutations.setTagMark(tagId, icon)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, { ...tag }),
    })
  }

  /**
   * Delete a tag, unless items still carry it (FR-24.10, ADR-063).
   *
   * Unlike FR-24.3's outlook this count is *exact in every mode*: tags and
   * their assignments are both master-partition tables, and the device holds
   * that partition in full. So there is no `certain` flag to carry here —
   * the client and the server are looking at the same rows.
   */
  function deleteTag(tagId: string): TagDeleteResult {
    const { kind, references } = tagDeletion(tagId, masterStore.itemTagList)
    if (kind === TAG_DELETE_REFUSED) return { ok: false, references }

    const mutation = mutations.deleteTag(tagId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
    return { ok: true }
  }

  /**
   * Merge one tag into another and remove it (FR-24.10) — the way out of a
   * tag that {@link deleteTag} refuses, and of a duplicate typed twice.
   *
   * Returns how many items ended up under the target, which is the number
   * the confirmation reports. The source is deleted **last**, after the
   * writes that empty it: the two orders differ only if a device stops
   * between them, and this one leaves a tag whose assignments are gone
   * rather than assignments whose tag is gone — the first is a tag to delete
   * again, the second is rows the inventory has to skip (`tagsOfItem`).
   */
  function mergeTags(sourceId: string, targetId: string): number {
    return mergeTagsMany([sourceId], targetId)
  }

  /**
   * Merge a whole selection of tags into one of them (FR-24.14).
   *
   * Not a loop over {@link mergeTags}: each call plans against
   * `masterStore.itemTagList`, and the optimistic writes of the previous
   * merge are not in it yet, so an item carrying two of the sources would be
   * re-pointed twice — two `item_tags` rows naming the target for one item,
   * which `UNIQUE (item_id, tag_id)` refuses once the push reaches the
   * server, after the outbox has accepted both. `planTagMergeMany` decides
   * the whole set in one pass instead, so exactly one assignment per item
   * survives whatever the user selected.
   */
  function mergeTagsMany(sourceIds: readonly string[], targetId: string): number {
    const plan = planTagMergeMany(sourceIds, targetId, masterStore.itemTagList)

    for (const { assignment, position } of plan.repoint) {
      const mutation = mutations.retagAssignment(assignment.id, targetId, position)
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: optimisticUpdate(mutation, { ...assignment }),
      })
    }
    for (const { assignment, position } of plan.promote) {
      moveTag(assignment.id, position)
    }
    for (const assignment of plan.drop) {
      unassignTag(assignment.id)
    }

    // Items, not assignments: an item carrying two of the sources is one row
    // that ends up under the target, and the number is what the toast reports
    // („N Artikel liegen jetzt unter X"). For a single source the two counts
    // are the same, because one tag is on an item at most once.
    const moved = new Set([
      ...plan.repoint.map(({ assignment }) => assignment.item_id),
      ...plan.drop.map((assignment) => assignment.item_id),
    ]).size
    // `mutations.deleteTag` and not the guarded {@link deleteTag}: the plan was
    // computed from the store this loop has just been writing to, so asking
    // the guard again is a read of state mid-change — and where the optimistic
    // writes have not landed yet it sees the assignments the merge just took
    // away, refuses, and leaves a tag behind that nothing carries. The plan
    // already knows the tag is empty; that is what makes it a merge rather
    // than a delete. The **target** is what the guard here is for: a merge
    // into itself must not delete the tag it was asked to keep.
    for (const sourceId of sourceIds) {
      if (sourceId === targetId) continue
      const mutation = mutations.deleteTag(sourceId)
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: optimisticDelete(mutation),
      })
    }
    return moved
  }

  /**
   * What a merge did, for the sentence the screen owes afterwards (FR-24.15).
   */
  interface ItemMergeOutcome {
    /** How many rows were merged away. */
    merged: number
    /** Assignments that moved to the survivor. */
    tags: number
    /** Vorlage positions that collapsed into one. */
    positions: number
    /** Dependency edges dropped as a self-edge, a duplicate or a cycle. */
    edgesDropped: number
    /** Losers FR-24.3 answered by retiring rather than removing. */
    retired: number
    /** Which of the survivor's empty fields the losers filled. */
    filled: (keyof FilledFields)[]
  }

  /**
   * Merge duplicate master items into one (FR-24.15, ADR-068).
   *
   * The whole act is planned first, over the rows this device holds, and only
   * then written — `planItemMerge`'s doc says why four tables make that
   * necessary. The order here is the part that is not in the plan:
   *
   * 1. everything that still points at a loser moves to the survivor;
   * 2. the survivor takes over the fields it had none of;
   * 3. the losers are aliased at the survivor and then deleted.
   *
   * The alias is written **before** the delete, and it is written even for a
   * loser that is about to be removed outright: a device that only ever sees
   * the two changes in the feed still learns where the row went, and one that
   * sees the delete alone would otherwise have a `source_item_id` pointing at
   * nothing. The delete itself is FR-24.3's ordinary one — retire where
   * something still resolves against the row, remove where nothing does — and
   * not a third lifecycle invented for merging.
   */
  function mergeMasterItems(survivorId: string, loserIds: string[]): ItemMergeOutcome {
    const plan = planItemMerge(survivorId, loserIds, {
      items: masterStore.itemList,
      assignments: masterStore.itemTagList,
      dependencies: masterStore.dependencyList,
      positions: masterStore.positionList,
      tasks: masterStore.templateItemTaskList,
    })

    for (const assignment of plan.tags.repoint) {
      const mutation = mutations.reassignItemTag(
        assignment.id,
        survivorId,
        plan.tags.positionOf(assignment.id),
      )
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: optimisticUpdate(mutation, { ...assignment }),
      })
    }
    for (const assignment of plan.tags.drop) unassignTag(assignment.id)

    for (const { edge, item_id, depends_on_item_id } of plan.dependencies.repoint) {
      const mutation = mutations.repointItemDependency(edge.id, item_id, depends_on_item_id)
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: optimisticUpdate(mutation, { ...edge }),
      })
    }
    for (const edge of plan.dependencies.drop) {
      const mutation = mutations.deleteItemDependency(edge.id)
      enqueueAndDrain('master', null, { mutation, optimistic: optimisticDelete(mutation) })
    }

    for (const position of plan.positions.repoint) {
      const mutation = mutations.repointTemplateItem(position.id, survivorId)
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: optimisticUpdate(mutation, { ...position }),
      })
    }
    for (const { keep, drop, quantity, tasks } of plan.positions.collapse) {
      if (quantity !== keep.quantity) {
        const mutation = mutations.updateTemplateItem(keep.id, { quantity })
        enqueueAndDrain('master', null, {
          mutation,
          optimistic: optimisticUpdate(mutation, { ...keep }),
        })
      }
      for (const task of tasks) {
        const { mutation } = mutations.addTemplateItemTask(keep.id, task)
        enqueueAndDrain('master', null, { mutation, optimistic: optimisticInsert(mutation) })
      }
      const mutation = mutations.deleteTemplateItem(drop.id)
      enqueueAndDrain('master', null, { mutation, optimistic: optimisticDelete(mutation) })
    }

    const survivor = masterStore.getItem(survivorId)
    if (survivor && Object.keys(plan.fields).length > 0) {
      updateMasterItem(survivor, plan.fields)
    }

    let retired = 0
    for (const itemId of plan.aliases) {
      const row = masterStore.getItem(itemId)
      const alias = mutations.updateMasterItem(itemId, { merged_into_id: survivorId })
      enqueueAndDrain('master', null, {
        mutation: alias,
        optimistic: optimisticUpdate(alias, row ? masterItemRow(row) : {}),
      })
      if (!loserIds.includes(itemId)) continue
      if (row && masterItemDeletionOutlook(itemId).kind === DELETION_RETIRE) retired += 1
      deleteMasterItem(itemId)
    }

    return {
      merged: loserIds.length,
      tags: plan.tags.repoint.length,
      positions: plan.positions.collapse.length,
      edgesDropped: plan.dependencies.drop.length,
      retired,
      filled: Object.keys(plan.fields) as (keyof FilledFields)[],
    }
  }

  /**
   * Move a tag on the inventory's axis (FR-24.10). The indices are into
   * `tagList`, which is the order the user is dragging in; the plan
   * renumbers from there and returns only the rows that change.
   */
  function reorderTags(from: number, to: number): void {
    for (const { tagId, sortOrder } of planTagReorder(masterStore.tagList, from, to)) {
      const mutation = mutations.reorderTag(tagId, sortOrder)
      const tag = masterStore.tagList.find((t) => t.id === tagId)
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: optimisticUpdate(mutation, tag ? { ...tag } : {}),
      })
    }
  }

  function createMasterItem(
    name: string,
    opts: Parameters<typeof mutations.createMasterItem>[1] = {},
  ): string {
    const { mutation, id } = mutations.createMasterItem(name, opts)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateMasterItem(item: MasterItem, fields: MasterItemEdit) {
    const mutation = mutations.updateMasterItem(item.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, masterItemRow(item)),
    })
  }

  /**
   * Name who many items are usually assigned to (FR-1.9 over FR-24.9), or
   * nobody when `assigneeId` is null. Items already naming that person are
   * not rewritten — see `planDefaultAssignee` for why a no-op write is worse
   * than pointless here.
   */
  function assignDefaultAssignee(
    items: MasterItem[],
    assigneeId: string | null,
  ): BulkAssigneeResult {
    const changed = planDefaultAssignee(items, assigneeId)
    for (const { item } of changed) {
      updateMasterItem(item, { default_assignee_id: assigneeId })
    }
    return { touched: changed.length, undo: { changed } }
  }

  /** Write one assignee batch back (FR-24.9's „Rückgängig"). */
  function undoBulkAssignee(undo: BulkAssigneeUndo): void {
    for (const { item, previous } of undo.changed) {
      // Re-read: the batch above has painted the row, and the optimistic twin
      // is built from what the row holds now, not from the pre-batch snapshot.
      const current = masterStore.getItem(item.id) ?? item
      updateMasterItem(current, { default_assignee_id: previous })
    }
  }

  /**
   * FR-24.3: what deleting this master item will do, and whether this device
   * can be sure of it. A count of zero is only certain where the device holds
   * every trip — Local Mode. In Server Mode the trip partitions arrive as
   * trips are opened, so "nothing references it" means "nothing I have seen",
   * and the server may still answer the delete by retiring the row (ADR-032).
   */
  function masterItemDeletionOutlook(itemId: string): DeletionOutlook {
    const references = countItemReferences(itemId, {
      positions: masterStore.templateList.flatMap((t) => masterStore.getTemplateItems(t.id)),
      tripItems: knownTripItems(),
    })
    return outlookOf(references)
  }

  /** FR-24.3 for a Vorlage: the trip rows that still name it (FR-9.2). */
  function templateDeletionOutlook(templateId: string): DeletionOutlook {
    return outlookOf(countTemplateReferences(templateId, { tripItems: knownTripItems() }))
  }

  function outlookOf(references: number): DeletionOutlook {
    const kind = deletionKind(references)
    return { kind, references, certain: kind === DELETION_RETIRE || local !== null }
  }

  /**
   * FR-24.3: a delete is one of two acts. A master item something resolves
   * against is retired — the row stays and stops being offered — and one
   * nothing has ever used is removed. The server decides the same thing over
   * the complete picture and corrects this device through the next pull, so
   * a short count here costs a wrong sentence, never a wrong row.
   */
  function deleteMasterItem(itemId: string) {
    const item = masterStore.getItem(itemId)
    if (item && masterItemDeletionOutlook(itemId).kind === DELETION_RETIRE) {
      const retire = mutations.updateMasterItem(itemId, {
        [RETIRED_FIELD]: ctx.nowIso(),
      })
      enqueueAndDrain('master', null, {
        mutation: retire,
        optimistic: optimisticUpdate(retire, masterItemRow(item)),
      })
      return
    }
    const mutation = mutations.deleteMasterItem(itemId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: [
        ...cascadeChanges(TABLE.items, itemId, { tripStore, masterStore }),
        optimisticDelete(mutation),
      ],
    })
  }

  /**
   * FR-24.3's restore, for a master item. The marker is an ordinary field,
   * so bringing the row back is one mutation — but the *name* is not free:
   * retiring released it (the unique indexes are partial over the active
   * rows), so an active row may hold it by now. That is checked here, over
   * the complete master partition every device holds, and it is the one
   * FR-24.3 question the client can answer exactly in all three modes.
   */
  function masterItemRestoreVerdict(
    itemId: string,
    proposedName?: string,
  ): RestoreVerdict<MasterItem> | null {
    const item = masterStore.getItem(itemId)
    if (!item) return null
    return restoreVerdict(item, masterStore.activeItemList, proposedName)
  }

  /** The same for a Vorlage — `templates.name` is UNIQUE across both scopes. */
  function templateRestoreVerdict(
    templateId: string,
    proposedName?: string,
  ): RestoreVerdict<Template> | null {
    const template = masterStore.getTemplate(templateId)
    if (!template) return null
    return restoreVerdict(template, masterStore.activeTemplateList, proposedName)
  }

  /**
   * restoreMasterItem clears FR-24.3's marker, optionally under a new name
   * when the old one was taken while the row was hidden. Returns false when
   * the name it would write is still taken — refused *before* the outbox, so
   * the user meets a sentence instead of an optimistic row that reverses
   * itself when the push is rejected (ADR-031).
   */
  function restoreMasterItem(itemId: string, name?: string): boolean {
    const item = masterStore.getItem(itemId)
    if (!item) return false
    const verdict = restoreVerdict(item, masterStore.activeItemList, name)
    if (verdict.kind !== RESTORE_READY) return false
    const fields = restoreFields(name === undefined ? null : verdict.name)
    // FR-24.15: a row brought back has a past of its own again, so the merge
    // alias goes with the marker. Written whether or not the row carries one:
    // the two are the same decision, and asking first would read the store
    // for a field the patch is about to overwrite anyway.
    const mutation = mutations.updateMasterItem(itemId, { ...fields, merged_into_id: null })
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, masterItemRow(item)),
    })
    return true
  }

  /** restoreTemplate is restoreMasterItem for a Vorlage (FR-24.3). */
  function restoreTemplate(templateId: string, name?: string): boolean {
    const template = masterStore.getTemplate(templateId)
    if (!template) return false
    const verdict = restoreVerdict(template, masterStore.activeTemplateList, name)
    if (verdict.kind !== RESTORE_READY) return false
    const fields = restoreFields(name === undefined ? null : verdict.name)
    const mutation = mutations.updateTemplate(templateId, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, templateRow(template)),
    })
    return true
  }

  /** createTemplate makes a new template. Templates are shared
   * instance-wide (FR-1.6 MVP), so owner_id is creator metadata only; it is
   * stamped server-side on push and the optimistic row leaves it empty.
   * Returns the new id so the caller can open M8.
   *
   * The scope is chosen at creation and never derived from usage (FR-27.1):
   * a group nothing includes yet would otherwise be unclassifiable. */
  function createTemplate(
    name: string,
    kind: TemplateKind = 'template',
    /** FR-28.8: the optional mark, set at creation by the seed and the import. */
    icon: string | null = null,
  ): string | null {
    if (names.templateNameCollision(name)) return null
    const { mutation, id } = mutations.createTemplate(name, '', kind, icon)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateTemplate(template: Template, fields: TemplateEdit): boolean {
    if (isTakenRename(fields, template.id, names.templateNameCollision)) return false
    const mutation = mutations.updateTemplate(template.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, templateRow(template)),
    })
    return true
  }

  function addTemplateItem(
    templateId: string,
    itemId: string,
    opts: Parameters<typeof mutations.addTemplateItem>[2] = {},
  ): string {
    const { mutation, id } = mutations.addTemplateItem(templateId, itemId, opts)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateTemplateItem(templateItem: TemplateItem, fields: TemplateItemEdit) {
    const mutation = mutations.updateTemplateItem(templateItem.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, templateItemRow(templateItem)),
    })
  }

  function deleteTemplateItem(templateItemId: string) {
    const mutation = mutations.deleteTemplateItem(templateItemId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: [
        ...cascadeChanges(TABLE.templateItems, templateItemId, { tripStore, masterStore }),
        optimisticDelete(mutation),
      ],
    })
  }

  /**
   * deleteTemplate applies FR-24.3 to a Vorlage: a group a trip was generated
   * from is retired rather than removed, because FR-9.2 keeps those rows
   * naming their source for the life of the archived trip. Otherwise the row
   * goes and the store mirrors the cascades.
   */
  function deleteTemplate(templateId: string) {
    const template = masterStore.getTemplate(templateId)
    if (template && templateDeletionOutlook(templateId).kind === DELETION_RETIRE) {
      const retire = mutations.updateTemplate(templateId, {
        [RETIRED_FIELD]: ctx.nowIso(),
      })
      enqueueAndDrain('master', null, {
        mutation: retire,
        optimistic: optimisticUpdate(retire, templateRow(template)),
      })
      return
    }
    const mutation = mutations.deleteTemplate(templateId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: [
        ...cascadeChanges(TABLE.templates, templateId, { tripStore, masterStore }),
        optimisticDelete(mutation),
      ],
    })
  }

  /** addTemplateInclude references a Gruppe from a Ferien-Vorlage (FR-27.1). */
  function addTemplateInclude(templateId: string, includedTemplateId: string): string {
    const { mutation, id } = mutations.addTemplateInclude(templateId, includedTemplateId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function removeTemplateInclude(includeId: string) {
    const mutation = mutations.removeTemplateInclude(includeId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /** addTemplateItemTask attaches one FR-27.7 preparation task to a position. */
  function addTemplateItemTask(templateItemId: string, task: string): string {
    const { mutation, id } = mutations.addTemplateItemTask(templateItemId, task)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function deleteTemplateItemTask(taskId: string) {
    const mutation = mutations.deleteTemplateItemTask(taskId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /** addTemplateTask attaches one FR-7.4 trip task to a template. */
  function addTemplateTask(templateId: string, task: string): string {
    const { mutation, id } = mutations.addTemplateTask(templateId, task)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function deleteTemplateTask(taskId: string) {
    const mutation = mutations.deleteTemplateTask(taskId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  return {
    createTag,
    renameTag,
    setTagMark,
    deleteTag,
    mergeTags,
    mergeTagsMany,
    mergeMasterItems,
    reorderTags,
    assignTag,
    assignTagAt,
    unassignTag,
    moveTag,
    setPrimaryTag,
    giveTagToItems,
    takeTagFromItems,
    undoBulkTag,
    createMasterItem,
    updateMasterItem,
    assignDefaultAssignee,
    undoBulkAssignee,
    masterItemDeletionOutlook,
    templateDeletionOutlook,
    deleteMasterItem,
    masterItemRestoreVerdict,
    templateRestoreVerdict,
    restoreMasterItem,
    restoreTemplate,
    createTemplate,
    updateTemplate,
    addTemplateItem,
    updateTemplateItem,
    deleteTemplateItem,
    deleteTemplate,
    addTemplateInclude,
    removeTemplateInclude,
    addTemplateItemTask,
    deleteTemplateItemTask,
    addTemplateTask,
    deleteTemplateTask,
  }
}
