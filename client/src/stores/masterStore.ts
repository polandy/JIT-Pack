/**
 * Master store — reactive state for tags, items, and templates.
 *
 * Populated from pull responses on the master partition.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  DestinationChecklistItem,
  DestinationProfile,
  ItemDependency,
  ItemTag,
  MasterItem,
  Tag,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  TemplateKind,
  TripSeries,
} from '@/types/domain'
import type { PullChange } from '@/api/types'
import { resolveTemplate, type Resolution } from '@/domain/templates'
import { groupByPrimaryTag, primaryTagOf, tagsOfItem } from '@/domain/tags'

export const useMasterStore = defineStore('master', () => {
  const tags = ref<Map<string, Tag>>(new Map())
  const itemTags = ref<Map<string, ItemTag>>(new Map())
  const items = ref<Map<string, MasterItem>>(new Map())
  const templates = ref<Map<string, Template>>(new Map())
  const templateItems = ref<Map<string, TemplateItem[]>>(new Map())
  const templateIncludes = ref<Map<string, TemplateInclude>>(new Map())
  const templateItemTasks = ref<Map<string, TemplateItemTask>>(new Map())
  const series = ref<Map<string, TripSeries>>(new Map())
  const profiles = ref<Map<string, DestinationProfile>>(new Map())
  const checklistItems = ref<Map<string, DestinationChecklistItem>>(new Map())
  const dependencies = ref<Map<string, ItemDependency>>(new Map())

  // --- Getters ---

  const tagList = computed(() =>
    [...tags.value.values()].sort((a, b) => a.sort_order - b.sort_order),
  )

  const itemTagList = computed(() => [...itemTags.value.values()])

  const itemList = computed(() => [...items.value.values()])

  const templateList = computed(() => [...templates.value.values()])

  function getItem(id: string): MasterItem | undefined {
    return items.value.get(id)
  }

  function getTemplate(id: string): Template | undefined {
    return templates.value.get(id)
  }

  function getTemplateItems(templateId: string): TemplateItem[] {
    return templateItems.value.get(templateId) ?? []
  }

  function templateItemCount(templateId: string): number {
    return getTemplateItems(templateId).length
  }

  // --- Template composition (§3.27, FR-27.1) ---

  const includeList = computed(() => [...templateIncludes.value.values()])

  /** The groups this Ferien-Vorlage includes. */
  function getIncludes(templateId: string): TemplateInclude[] {
    return includeList.value.filter((i) => i.template_id === templateId)
  }

  /** The Ferien-Vorlagen that include this group — FR-27.6's "Eingebunden in: …". */
  function getIncludedBy(templateId: string): Template[] {
    return includeList.value
      .filter((i) => i.included_template_id === templateId)
      .map((i) => templates.value.get(i.template_id))
      .filter((t): t is Template => t !== undefined)
  }

  /** Every preparation task on the device (FR-27.7) — generation resolves by position. */
  const templateItemTaskList = computed(() => [...templateItemTasks.value.values()])

  /** The preparation tasks of one position (FR-27.7), in insertion order. */
  function getTemplateItemTasks(templateItemId: string): TemplateItemTask[] {
    return templateItemTaskList.value.filter((t) => t.template_item_id === templateItemId)
  }

  /**
   * What this template amounts to after include expansion and dedup (FR-27.2)
   * — the M7 row count and the M8 resolution footer read the same resolution,
   * so the two can never disagree about what a trip would get.
   */
  function resolve(templateId: string): Resolution {
    return resolveTemplate(templateId, {
      templates: templateList.value,
      includes: includeList.value,
      positions: [...templateItems.value.values()].flat(),
    })
  }

  const seriesList = computed(() => [...series.value.values()])

  function getSeries(id: string): TripSeries | undefined {
    return series.value.get(id)
  }

  /** The series' destination profile — unique per series (FR-13.2). */
  function getDestinationProfile(seriesId: string): DestinationProfile | undefined {
    return [...profiles.value.values()].find((p) => p.series_id === seriesId)
  }

  function getChecklistItems(profileId: string): DestinationChecklistItem[] {
    return [...checklistItems.value.values()].filter((c) => c.profile_id === profileId)
  }

  // --- Item dependencies (Addendum 3.20, FR-20.1) ---

  const dependencyList = computed(() => [...dependencies.value.values()])

  /** What this item depends on — the "Depends on" rows in M10. */
  function getItemDependencies(itemId: string): ItemDependency[] {
    return dependencyList.value.filter((d) => d.item_id === itemId)
  }

  /** This item's companions — dependencies pointing at it as the main item. */
  function getCompanionDependencies(itemId: string): ItemDependency[] {
    return dependencyList.value.filter((d) => d.depends_on_item_id === itemId)
  }

  /**
   * Items grouped by primary-tag name for the M9 list (FR-24.2), defaulting
   * to the whole inventory. M9 passes its filtered subset, so the grouping
   * rule and the store wiring stay in one place rather than each screen
   * assembling the three arguments itself.
   */
  function itemsByPrimaryTag(items: MasterItem[] = itemList.value): Map<string, MasterItem[]> {
    return groupByPrimaryTag(items, itemTagList.value, tagList.value)
  }

  /** This item's tags, primary first (FR-24.1). */
  function getItemTags(itemId: string): Tag[] {
    return tagsOfItem(itemId, itemTagList.value, tagList.value)
  }

  /** The single tag M9 files this item under, if it carries one. */
  function getPrimaryTag(itemId: string): Tag | undefined {
    return primaryTagOf(itemId, itemTagList.value, tagList.value)
  }

  /** Search items by name substring (case-insensitive). */
  function searchItems(query: string): MasterItem[] {
    if (!query) return itemList.value
    const q = query.toLowerCase()
    return itemList.value.filter((i) => i.name.toLowerCase().includes(q))
  }

  // --- Mutations ---

  function applyChange(change: PullChange): void {
    const row = change.row as Record<string, unknown> | null

    switch (change.table) {
      case 'tags':
        if (change.deleted) {
          tags.value.delete(change.id)
          // The server cascades the assignments and sends their tombstones,
          // but a pull can deliver them in either order — dropping them here
          // keeps the list from grouping under a heading already gone.
          for (const [id, a] of itemTags.value) {
            if (a.tag_id === change.id) itemTags.value.delete(id)
          }
        } else if (row) {
          tags.value.set(change.id, rowToTag(change.id, row))
        }
        break

      case 'item_tags':
        if (change.deleted) {
          itemTags.value.delete(change.id)
        } else if (row) {
          itemTags.value.set(change.id, rowToItemTag(change.id, row))
        }
        break

      case 'items':
        if (change.deleted) {
          items.value.delete(change.id)
          for (const [id, a] of itemTags.value) {
            if (a.item_id === change.id) itemTags.value.delete(id)
          }
        } else if (row) {
          items.value.set(change.id, rowToItem(change.id, row))
        }
        break

      case 'templates':
        if (change.deleted) {
          templates.value.delete(change.id)
          templateItems.value.delete(change.id)
          // ON DELETE CASCADE removes the include rows server-side; mirror it
          // here so a resolution taken before the next pull cannot name a
          // template that is already gone.
          for (const [id, inc] of templateIncludes.value) {
            if (inc.template_id === change.id || inc.included_template_id === change.id) {
              templateIncludes.value.delete(id)
            }
          }
        } else if (row) {
          templates.value.set(change.id, rowToTemplate(change.id, row))
        }
        break

      case 'template_includes':
        if (change.deleted) {
          templateIncludes.value.delete(change.id)
        } else if (row) {
          templateIncludes.value.set(change.id, rowToInclude(change.id, row))
        }
        break

      case 'template_items':
        if (change.deleted) {
          removeTemplateItem(change.id)
          // ON DELETE CASCADE removes the tasks server-side; mirror it so a
          // count chip cannot outlive its own position between two pulls.
          for (const [id, task] of templateItemTasks.value) {
            if (task.template_item_id === change.id) templateItemTasks.value.delete(id)
          }
        } else if (row) {
          upsertTemplateItem(rowToTemplateItem(change.id, row))
        }
        break

      case 'template_item_tasks':
        if (change.deleted) {
          templateItemTasks.value.delete(change.id)
        } else if (row) {
          templateItemTasks.value.set(change.id, rowToTask(change.id, row))
        }
        break

      case 'trip_series':
        if (change.deleted) {
          series.value.delete(change.id)
        } else if (row) {
          series.value.set(change.id, rowToSeries(change.id, row))
        }
        break

      case 'destination_profiles':
        if (change.deleted) {
          profiles.value.delete(change.id)
        } else if (row) {
          profiles.value.set(change.id, rowToProfile(change.id, row))
        }
        break

      case 'destination_checklist_items':
        if (change.deleted) {
          checklistItems.value.delete(change.id)
        } else if (row) {
          checklistItems.value.set(change.id, rowToChecklistItem(change.id, row))
        }
        break

      case 'item_dependencies':
        if (change.deleted) {
          dependencies.value.delete(change.id)
        } else if (row) {
          dependencies.value.set(change.id, rowToDependency(change.id, row))
        }
        break
    }
  }

  function applyChanges(changes: PullChange[]): void {
    for (const c of changes) {
      applyChange(c)
    }
  }

  // --- Internal helpers ---

  function upsertTemplateItem(ti: TemplateItem): void {
    const list = templateItems.value.get(ti.template_id) ?? []
    const idx = list.findIndex((t) => t.id === ti.id)
    if (idx >= 0) {
      list[idx] = ti
    } else {
      list.push(ti)
    }
    templateItems.value.set(ti.template_id, list)
  }

  function removeTemplateItem(id: string): void {
    for (const [templateId, list] of templateItems.value) {
      const filtered = list.filter((t) => t.id !== id)
      if (filtered.length !== list.length) {
        templateItems.value.set(templateId, filtered)
        break
      }
    }
  }

  return {
    tags,
    itemTags,
    items,
    templates,
    tagList,
    itemTagList,
    itemList,
    templateList,
    getItem,
    getTemplate,
    getTemplateItems,
    templateItemCount,
    templateIncludes,
    includeList,
    getIncludes,
    getIncludedBy,
    templateItemTaskList,
    getTemplateItemTasks,
    resolve,
    seriesList,
    getSeries,
    getDestinationProfile,
    getChecklistItems,
    dependencyList,
    getItemDependencies,
    getCompanionDependencies,
    itemsByPrimaryTag,
    getItemTags,
    getPrimaryTag,
    searchItems,
    applyChange,
    applyChanges,
  }
})

// --- Row converters ---

function rowToTag(id: string, row: Record<string, unknown>): Tag {
  return {
    id,
    name: row['name'] as string,
    sort_order: (row['sort_order'] as number) ?? 0,
  }
}

function rowToItemTag(id: string, row: Record<string, unknown>): ItemTag {
  return {
    id,
    item_id: row['item_id'] as string,
    tag_id: row['tag_id'] as string,
    position: (row['position'] as number) ?? 0,
  }
}

function rowToItem(id: string, row: Record<string, unknown>): MasterItem {
  return {
    id,
    name: row['name'] as string,
    weight_grams: (row['weight_grams'] as number) ?? null,
    value_cents: (row['value_cents'] as number) ?? null,
    image_hash: (row['image_hash'] as string) ?? null,
  }
}

function rowToTemplate(id: string, row: Record<string, unknown>): Template {
  return {
    id,
    owner_id: row['owner_id'] as string,
    name: row['name'] as string,
    // Migration 016 defaults pre-scope rows to 'template', which is what they
    // were used as; a row from an older client is read the same way.
    kind: (row['kind'] as TemplateKind) ?? 'template',
  }
}

function rowToInclude(id: string, row: Record<string, unknown>): TemplateInclude {
  return {
    id,
    template_id: row['template_id'] as string,
    included_template_id: row['included_template_id'] as string,
  }
}

function rowToTask(id: string, row: Record<string, unknown>): TemplateItemTask {
  return {
    id,
    template_item_id: row['template_item_id'] as string,
    task: row['task'] as string,
  }
}

function rowToSeries(id: string, row: Record<string, unknown>): TripSeries {
  return {
    id,
    owner_id: row['owner_id'] as string,
    name: row['name'] as string,
    default_attributes: row['default_attributes']
      ? JSON.parse(row['default_attributes'] as string)
      : null,
  }
}

function rowToProfile(id: string, row: Record<string, unknown>): DestinationProfile {
  return {
    id,
    series_id: row['series_id'] as string,
    notes: (row['notes'] as string) ?? null,
  }
}

function rowToChecklistItem(id: string, row: Record<string, unknown>): DestinationChecklistItem {
  return {
    id,
    profile_id: row['profile_id'] as string,
    label: row['label'] as string,
    mode: (row['mode'] as DestinationChecklistItem['mode']) ?? 'buy_local',
  }
}

function rowToDependency(id: string, row: Record<string, unknown>): ItemDependency {
  return {
    id,
    item_id: row['item_id'] as string,
    depends_on_item_id: row['depends_on_item_id'] as string,
    mode: (row['mode'] as ItemDependency['mode']) ?? 'required',
    quantity: (row['quantity'] as number) ?? null,
  }
}

function rowToTemplateItem(id: string, row: Record<string, unknown>): TemplateItem {
  return {
    id,
    template_id: row['template_id'] as string,
    item_id: row['item_id'] as string,
    quantity: (row['quantity'] as number) ?? 1,
    assignment: (row['assignment'] as TemplateItem['assignment']) ?? 'per_person',
    dedup: (row['dedup'] as TemplateItem['dedup']) ?? 'max',
    conditions: row['conditions'] ? JSON.parse(row['conditions'] as string) : null,
    default_mode: (row['default_mode'] as TemplateItem['default_mode']) ?? 'pack',
    late_packer: Boolean(row['late_packer']),
  }
}
