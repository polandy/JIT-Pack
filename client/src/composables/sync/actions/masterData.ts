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
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { cascadeChanges } from '@/sync/cascade'
import { TABLE } from '@/types/tables'
import { masterItemRow, templateItemRow, templateRow } from '../rows'
import { isTakenRename } from '../names'
import type { MasterItem, Template, TemplateItem, TemplateKind, TripItem } from '@/types/domain'
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

/** createMasterDataActions binds the master-data group to one sync context. */
export function createMasterDataActions(ctx: SyncContext) {
  const { mutations, enqueueAndDrain, masterStore, tripStore, names, local } = ctx

  /** Create a tag by typing its name (FR-24.1) — there is no tag admin. */
  function createTag(name: string): string {
    const { mutation, id } = mutations.createTag(name, masterStore.tagList.length)
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

  function updateMasterItem(item: MasterItem, fields: Record<string, unknown>) {
    const mutation = mutations.updateMasterItem(item.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, masterItemRow(item)),
    })
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

  /** Every trip row this device holds. Complete in Local Mode only. */
  function knownTripItems(): TripItem[] {
    return tripStore.tripList.flatMap((t) => tripStore.getItems(t.id))
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
        [RETIRED_FIELD]: new Date().toISOString(),
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
    const mutation = mutations.updateMasterItem(itemId, fields)
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

  function updateTemplate(template: Template, fields: Record<string, unknown>): boolean {
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

  function updateTemplateItem(templateItem: TemplateItem, fields: Record<string, unknown>) {
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
        [RETIRED_FIELD]: new Date().toISOString(),
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

  return {
    createTag,
    assignTag,
    unassignTag,
    createMasterItem,
    updateMasterItem,
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
  }
}
