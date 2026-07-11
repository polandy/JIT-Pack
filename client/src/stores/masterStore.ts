/**
 * Master store — reactive state for categories, items, and templates.
 *
 * Populated from pull responses on the master partition.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Category,
  DestinationChecklistItem,
  DestinationProfile,
  ItemDependency,
  MasterItem,
  Template,
  TemplateItem,
  TripSeries,
} from '@/types/domain'
import type { PullChange } from '@/api/types'

export const useMasterStore = defineStore('master', () => {
  const categories = ref<Map<string, Category>>(new Map())
  const items = ref<Map<string, MasterItem>>(new Map())
  const templates = ref<Map<string, Template>>(new Map())
  const templateItems = ref<Map<string, TemplateItem[]>>(new Map())
  const series = ref<Map<string, TripSeries>>(new Map())
  const profiles = ref<Map<string, DestinationProfile>>(new Map())
  const checklistItems = ref<Map<string, DestinationChecklistItem>>(new Map())
  const dependencies = ref<Map<string, ItemDependency>>(new Map())

  // --- Getters ---

  const categoryList = computed(() =>
    [...categories.value.values()].sort((a, b) => a.sort_order - b.sort_order),
  )

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

  /** Items grouped by category name, sorted by category sort_order. */
  function itemsByCategory(): Map<string, MasterItem[]> {
    const catMap = new Map<string, string>() // catId -> catName
    for (const cat of categories.value.values()) {
      catMap.set(cat.id, cat.name)
    }

    const groups = new Map<string, MasterItem[]>()
    for (const item of items.value.values()) {
      const catName = item.category_id
        ? (catMap.get(item.category_id) ?? 'Uncategorized')
        : 'Uncategorized'
      const group = groups.get(catName) ?? []
      group.push({ ...item, category_name: catName })
      groups.set(catName, group)
    }
    return groups
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
      case 'categories':
        if (change.deleted) {
          categories.value.delete(change.id)
        } else if (row) {
          categories.value.set(change.id, rowToCategory(change.id, row))
        }
        break

      case 'items':
        if (change.deleted) {
          items.value.delete(change.id)
        } else if (row) {
          items.value.set(change.id, rowToItem(change.id, row))
        }
        break

      case 'templates':
        if (change.deleted) {
          templates.value.delete(change.id)
          templateItems.value.delete(change.id)
        } else if (row) {
          templates.value.set(change.id, rowToTemplate(change.id, row))
        }
        break

      case 'template_items':
        if (change.deleted) {
          removeTemplateItem(change.id)
        } else if (row) {
          upsertTemplateItem(rowToTemplateItem(change.id, row))
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
    categories,
    items,
    templates,
    categoryList,
    itemList,
    templateList,
    getItem,
    getTemplate,
    getTemplateItems,
    templateItemCount,
    seriesList,
    getSeries,
    getDestinationProfile,
    getChecklistItems,
    dependencyList,
    getItemDependencies,
    getCompanionDependencies,
    itemsByCategory,
    searchItems,
    applyChange,
    applyChanges,
  }
})

// --- Row converters ---

function rowToCategory(id: string, row: Record<string, unknown>): Category {
  return {
    id,
    name: row['name'] as string,
    sort_order: (row['sort_order'] as number) ?? 0,
  }
}

function rowToItem(id: string, row: Record<string, unknown>): MasterItem {
  return {
    id,
    name: row['name'] as string,
    category_id: (row['category_id'] as string) ?? null,
    weight_grams: (row['weight_grams'] as number) ?? null,
    value_cents: (row['value_cents'] as number) ?? null,
    is_consumable: Boolean(row['is_consumable']),
    unit: (row['unit'] as MasterItem['unit']) ?? 'pieces',
    per_day_rate: (row['per_day_rate'] as number) ?? null,
    image_hash: (row['image_hash'] as string) ?? null,
  }
}

function rowToTemplate(id: string, row: Record<string, unknown>): Template {
  return {
    id,
    owner_id: row['owner_id'] as string,
    name: row['name'] as string,
    is_published: Boolean(row['is_published']),
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
    quantity_formula: (row['quantity_formula'] as string) ?? null,
  }
}

function rowToTemplateItem(id: string, row: Record<string, unknown>): TemplateItem {
  return {
    id,
    template_id: row['template_id'] as string,
    item_id: row['item_id'] as string,
    quantity_formula: (row['quantity_formula'] as string) ?? '1',
    assignment: (row['assignment'] as TemplateItem['assignment']) ?? 'per_person',
    dedup: (row['dedup'] as TemplateItem['dedup']) ?? 'max',
    conditions: row['conditions'] ? JSON.parse(row['conditions'] as string) : null,
    default_mode: (row['default_mode'] as TemplateItem['default_mode']) ?? 'pack',
    late_packer: Boolean(row['late_packer']),
  }
}
