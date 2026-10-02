/**
 * Templates, their positions, includes and tasks, and the planning-trip refresh (FR-27). Spread
 * into `createMutations` (`../mutations.ts`).
 */

import { TABLE } from '@/types/tables'
import { dbBool, jsonColumn, rowFrom } from '@/sync/columns'
import { newId } from '@/lib/ids'
import type { Mutation } from '@/api/types'
import {
  type AppliedChange,
  type GeneratedPosition,
  ITEM_MODE_PACK,
  type ItemMode,
  type TaskPhase,
  type Template,
  type TemplateItem,
  type TemplateKind,
  type TripItem,
} from '@/types/domain'
import type { MutationContext } from './context'

/** M8's Vorlage header, plus FR-24.3's marker on the same terms. */
export type TemplateEdit = Partial<Pick<Template, 'name' | 'icon' | 'kind' | 'retired_at'>>

/** M8's position sheet. `template_id` and `item_id` are what the row *is*;
 * moving a position means deleting it and adding another. */
export type TemplateItemEdit = Partial<
  Pick<
    TemplateItem,
    'quantity' | 'assignment' | 'dedup' | 'conditions' | 'default_mode' | 'late_packer'
  >
>

/** The FR-27.4 refresh's propagated fields — the only ones a group may
 * overwrite on a trip row it generated. Everything the user decided on the
 * trip (state, counts, container, assignment) is deliberately absent. */
export type GeneratedTripItemEdit = Partial<
  Pick<
    TripItem,
    'name' | 'quantity' | 'mode' | 'late_packer' | 'weight_grams' | 'value_cents' | 'category_name'
  >
>

export function createTemplatesMutations({ make, nowIso }: MutationContext) {
  // --- Template mutations ---

  function createTemplate(
    name: string,
    ownerId: string,
    kind: TemplateKind = 'template',
    /** FR-28.8: the optional mark, carried in by a portable import. */
    icon: string | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templates, id, {
      owner_id: ownerId,
      name,
      kind,
      icon,
    })
    return { mutation, id }
  }

  function updateTemplate(templateId: string, fields: TemplateEdit): Mutation {
    return make('upsert', TABLE.templates, templateId, rowFrom(fields))
  }

  function deleteTemplate(templateId: string): Mutation {
    return make('delete', TABLE.templates, templateId)
  }

  function addTemplateItem(
    templateId: string,
    itemId: string,
    opts: {
      quantity?: number
      assignment?: string
      dedup?: string
      defaultMode?: ItemMode
      latePacker?: boolean
      conditions?: Record<string, unknown> | null
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templateItems, id, {
      template_id: templateId,
      item_id: itemId,
      quantity: opts.quantity ?? 1,
      assignment: opts.assignment ?? 'per_person',
      dedup: opts.dedup ?? 'max',
      default_mode: opts.defaultMode ?? ITEM_MODE_PACK,
      late_packer: dbBool(opts.latePacker),
      conditions: jsonColumn(opts.conditions),
    })
    return { mutation, id }
  }

  function updateTemplateItem(templateItemId: string, fields: TemplateItemEdit): Mutation {
    return make(
      'upsert',
      TABLE.templateItems,
      templateItemId,
      rowFrom(fields, { conditions: jsonColumn, late_packer: dbBool }),
    )
  }

  function deleteTemplateItem(templateItemId: string): Mutation {
    return make('delete', TABLE.templateItems, templateItemId)
  }

  /** addTemplateInclude references a Gruppe from a Ferien-Vorlage (FR-27.1). */
  function addTemplateInclude(
    templateId: string,
    includedTemplateId: string,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templateIncludes, id, {
      template_id: templateId,
      included_template_id: includedTemplateId,
    })
    return { mutation, id }
  }

  function removeTemplateInclude(includeId: string): Mutation {
    return make('delete', TABLE.templateIncludes, includeId)
  }

  /** addTemplateItemTask attaches one FR-27.7 preparation task to a position. */
  function addTemplateItemTask(
    templateItemId: string,
    task: string,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templateItemTasks, id, {
      template_item_id: templateItemId,
      task,
    })
    return { mutation, id }
  }

  function deleteTemplateItemTask(taskId: string): Mutation {
    return make('delete', TABLE.templateItemTasks, taskId)
  }

  /** addTemplateTask attaches one FR-7.4 trip task to a template. */
  /**
   * FR-7.4 with FR-7.7's phase: a Vorlage can author a task for the trip
   * itself — „am Bahnhof die Zugverbindung abklären" is not something you do
   * before leaving, and the trip it generates has to start with it in the
   * right place.
   */
  function addTemplateTask(
    templateId: string,
    task: string,
    phase: TaskPhase,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templateTasks, id, {
      template_id: templateId,
      task,
      phase,
    })
    return { mutation, id }
  }

  /** FR-7.7: the same task, due at the other end of the trip. */
  function setTemplateTaskPhase(taskId: string, phase: TaskPhase): Mutation {
    return make('upsert', TABLE.templateTasks, taskId, { phase })
  }

  function deleteTemplateTask(taskId: string): Mutation {
    return make('delete', TABLE.templateTasks, taskId)
  }

  // --- The planning-trip refresh (FR-27.4) ---

  /**
   * updateGeneratedTripItem writes the fields the FR-27.4 refresh may
   * overwrite. A field map rather than one setter per field: the diff
   * decides which of them moved, and the caller has no business restating
   * that list. `late_packer` is normalised here because the wire carries
   * 0/1 where the domain carries a boolean. FR-27.16 writes `name` through
   * it too — the same inventory-owned field, taken over on request.
   */
  function updateGeneratedTripItem(itemId: string, fields: GeneratedTripItemEdit): Mutation {
    return make('upsert', TABLE.tripItems, itemId, rowFrom(fields, { late_packer: dbBool }))
  }

  /** registerTripSource records that a trip follows this template (FR-27.4/27.10). */
  function registerTripSource(
    tripId: string,
    templateId: string,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.tripTemplateSources, id, {
      trip_id: tripId,
      template_id: templateId,
    })
    return { mutation, id }
  }

  /**
   * writeGeneratedPosition records what generation produced for one position.
   * An upsert with the entry's derived id: the refresh re-states the whole
   * snapshot each time rather than patching fields, because the snapshot is
   * only meaningful as a set — a half-updated one would read as a manual edit.
   */
  function writeGeneratedPosition(entry: GeneratedPosition): Mutation {
    return make('upsert', TABLE.tripGeneratedPositions, entry.id, {
      trip_id: entry.trip_id,
      trip_item_id: entry.trip_item_id,
      source_template_id: entry.source_template_id,
      source_item_id: entry.source_item_id,
      traveler_id: entry.traveler_id,
      name: entry.name,
      quantity: entry.quantity,
      mode: entry.mode,
      late_packer: dbBool(entry.late_packer),
      weight_grams: entry.weight_grams,
      value_cents: entry.value_cents,
      category_name: entry.category_name,
      tasks: JSON.stringify(entry.tasks),
    })
  }

  function deleteGeneratedPosition(entryId: string): Mutation {
    return make('delete', TABLE.tripGeneratedPositions, entryId)
  }

  /**
   * logAppliedChange writes one line of M2's applied-changes log (FR-27.4).
   * created_at is the client's: the refresh runs on the device, and only it
   * knows when the change actually landed on this trip.
   *
   * `createdAt` overrides it for the one caller that is not making history but
   * replaying it — the ADR-015 restore, whose entries happened long before the
   * restore did and must not sort to the top of M2's list as today's news.
   */
  function logAppliedChange(
    change: Omit<AppliedChange, 'id' | 'created_at'>,
    createdAt?: string,
  ): {
    mutation: Mutation
    id: string
  } {
    const id = newId()
    const mutation = make('insert', TABLE.tripAppliedChanges, id, {
      trip_id: change.trip_id,
      source_template_id: change.source_template_id,
      source_template_name: change.source_template_name,
      kind: change.kind,
      item_name: change.item_name,
      detail: change.detail === null ? null : JSON.stringify(change.detail),
      created_at: createdAt ?? nowIso(),
    })
    return { mutation, id }
  }

  return {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    addTemplateItem,
    updateTemplateItem,
    deleteTemplateItem,
    addTemplateInclude,
    removeTemplateInclude,
    addTemplateItemTask,
    deleteTemplateItemTask,
    addTemplateTask,
    setTemplateTaskPhase,
    deleteTemplateTask,
    updateGeneratedTripItem,
    registerTripSource,
    writeGeneratedPosition,
    deleteGeneratedPosition,
    logAppliedChange,
  }
}
