/**
 * Master store — reactive state for tags, items, and templates.
 *
 * Populated from pull responses on the master partition.
 */

import { bucketedRows, bucketSink, keyedSink } from '@/stores/bucketedRows'
import { TABLE, type SyncTable } from '@/types/tables'
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
  TripSeries,
} from '@/types/domain'
import type { PullChange } from '@/api/types'
import { applyToSink, codecFor, type RowSinks, type SyncRow } from '@/sync/tableRegistry'
import { resolveTemplate, type Resolution } from '@/domain/templates'
import { groupByPrimaryTag, primaryTagOf, tagsOfItem } from '@/domain/tags'
import { activeOnly } from '@/domain/masterDeletion'
import { retiredOnly } from '@/domain/masterRestore'

/**
 * How much a user has to type before an inventory search offers anything
 * (§4a). Two surfaces ask it — M4/M8's quick-add and M3's FR-27.3 picker —
 * and a single letter over a full inventory is a list, not an answer.
 */
export const MIN_SEARCH_LENGTH = 2

export const useMasterStore = defineStore('master', () => {
  const tags = ref<Map<string, Tag>>(new Map())
  const itemTags = ref<Map<string, ItemTag>>(new Map())
  const items = ref<Map<string, MasterItem>>(new Map())
  const templates = ref<Map<string, Template>>(new Map())
  const templateItems = ref<Map<string, TemplateItem[]>>(new Map())
  const templateItemRows = bucketedRows(templateItems, (r) => r.template_id)
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

  /**
   * The whole inventory, retired rows included (FR-24.3). Everything that
   * *resolves* — template expansion, generation, export, the NFR-4.11 backup,
   * import matching — reads this one, because a retired row missing where
   * history reads it is data loss. Display surfaces read `activeItemList`.
   */
  const itemList = computed(() => [...items.value.values()])

  /** Every template, retired ones included — see `itemList` (ADR-032). */
  const templateList = computed(() => [...templates.value.values()])

  /** What the inventory, the pickers and the autocomplete may offer (FR-24.3). */
  const activeItemList = computed(() => activeOnly(itemList.value))

  /** What M7, the group pickers and M3's scope lists may offer (FR-24.3). */
  const activeTemplateList = computed(() => activeOnly(templateList.value))

  /**
   * The retired rows, newest first — M23's whole content and nothing else's.
   * A third list rather than a filter at the call site: the restore surface
   * is the one place a retired row is the subject, and ADR-032's split (the
   * complete lists resolve, the active lists offer) has no room for it.
   */
  const retiredItemList = computed(() => byRetiredDesc(retiredOnly(itemList.value)))

  /** The retired Vorlagen, newest first — see `retiredItemList`. */
  const retiredTemplateList = computed(() => byRetiredDesc(retiredOnly(templateList.value)))

  /**
   * Newest retire first: the row someone wants back is almost always the one
   * they just lost. RFC3339 stamps compare correctly as strings.
   */
  function byRetiredDesc<T extends { retired_at?: string | null }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => (b.retired_at ?? '').localeCompare(a.retired_at ?? ''))
  }

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
  /**
   * Every template position on the device, flat. One definition, because
   * resolution and FR-27.8's containment answer the same question about the
   * same rows and a second flatten would be a second reading of them.
   */
  const positionList = computed(() => [...templateItems.value.values()].flat())

  function resolve(templateId: string): Resolution {
    return resolveTemplate(templateId, {
      templates: templateList.value,
      includes: includeList.value,
      positions: positionList.value,
    })
  }

  /**
   * What a portable file needs of this device beyond one template's own
   * positions: the groups it composes (FR-27.1) and every position's
   * preparation tasks (FR-27.7).
   *
   * Assembled here for the same reason `resolve` is: M7's row export, the
   * settings export and the NFR-4.11 backup all feed it to `compositionFrom`,
   * and a source built separately at each site would let the three files
   * disagree about what a composition is.
   */
  function compositionSource() {
    return {
      includes: includeList.value,
      templates: templateList.value,
      itemsOf: (id: string) => getTemplateItems(id),
      tasksOf: (id: string) => getTemplateItemTasks(id).map((t) => t.task),
    }
  }

  /**
   * What a portable writer needs to describe a position's master item: the
   * item itself, and its tags in position order (FR-24.1/24.2, ADR-024).
   *
   * Assembled here rather than at each caller because four screens write
   * portable files — the device backup, both single exports and the template
   * list — and the pair was written out at each. Nothing drove any copy: with
   * all of them returning no tags, the whole unit suite and the whole M18 e2e
   * unit stayed green while the backup silently lost every tag. One named
   * source is one thing to get right, and `serializeTrip` takes it as a
   * *required* argument so a caller cannot quietly omit it — which is how the
   * fourth call site, exporting templates without tags, was found at all.
   */
  function portableResolvers() {
    return {
      masterItem: (id: string) => getItem(id),
      tagsOf: (id: string) => getItemTags(id).map((t) => t.name),
    }
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

  /**
   * Search items by name substring (case-insensitive). See MIN_SEARCH_LENGTH.
   * Retired items are absent: every caller is an offer — the quick-add
   * autocomplete, M3's picker, M10's dependency picker — and offering a row
   * the inventory no longer shows is how a retired item comes back by itself.
   */
  function searchItems(query: string): MasterItem[] {
    if (!query) return activeItemList.value
    const q = query.toLowerCase()
    return activeItemList.value.filter((i) => i.name.toLowerCase().includes(q))
  }

  /**
   * childRows names the master-owned rows a delete of this row takes with
   * it, leaf-first — the client's half of the server's `cascadeChildren`
   * (`internal/store/master.go`), which this switch mirrors case for case.
   *
   * It reads the maps directly rather than through the getters because the
   * cascade wants row *ids*, and every public getter here resolves its rows
   * to what a screen needs instead.
   */
  function childRows(table: string, id: string): Array<{ table: SyncTable; id: string }> {
    const rows: Array<{ table: SyncTable; id: string }> = []
    const tasksOfPosition = (positionId: string) => {
      for (const [taskId, task] of templateItemTasks.value) {
        if (task.template_item_id === positionId) {
          rows.push({ table: TABLE.templateItemTasks, id: taskId })
        }
      }
    }

    switch (table) {
      case TABLE.items:
        for (const [assignmentId, a] of itemTags.value) {
          if (a.item_id === id) rows.push({ table: TABLE.itemTags, id: assignmentId })
        }
        for (const [depId, d] of dependencies.value) {
          if (d.item_id === id || d.depends_on_item_id === id) {
            rows.push({ table: TABLE.itemDependencies, id: depId })
          }
        }
        break

      case TABLE.tags:
        // FR-24.1: a deleted tag unassigns itself everywhere.
        for (const [assignmentId, a] of itemTags.value) {
          if (a.tag_id === id) rows.push({ table: TABLE.itemTags, id: assignmentId })
        }
        break

      case TABLE.templates:
        for (const position of templateItems.value.get(id) ?? []) {
          tasksOfPosition(position.id)
          rows.push({ table: TABLE.templateItems, id: position.id })
        }
        // FR-27.1: the include vanishes from both sides of the relation.
        for (const [includeId, inc] of templateIncludes.value) {
          if (inc.template_id === id || inc.included_template_id === id) {
            rows.push({ table: TABLE.templateIncludes, id: includeId })
          }
        }
        break

      case TABLE.templateItems:
        tasksOfPosition(id)
        break

      case TABLE.tripSeries:
        for (const [profileId, p] of profiles.value) {
          if (p.series_id !== id) continue
          for (const [checklistId, c] of checklistItems.value) {
            if (c.profile_id === profileId) {
              rows.push({ table: TABLE.destinationChecklistItems, id: checklistId })
            }
          }
          rows.push({ table: TABLE.destinationProfiles, id: profileId })
        }
        break

      case TABLE.destinationProfiles:
        for (const [checklistId, c] of checklistItems.value) {
          if (c.profile_id === id) {
            rows.push({ table: TABLE.destinationChecklistItems, id: checklistId })
          }
        }
        break
    }
    return rows
  }

  // --- Mutations ---

  /**
   * The sinks, one per table this store holds — the *only* place that says
   * where a table's rows live.
   */
  const sinks: RowSinks = {
    [TABLE.tags]: keyedSink(tags),
    [TABLE.itemTags]: keyedSink(itemTags),
    [TABLE.items]: keyedSink(items),
    [TABLE.templates]: keyedSink(templates),
    [TABLE.templateItems]: bucketSink(templateItemRows),
    [TABLE.templateIncludes]: keyedSink(templateIncludes),
    [TABLE.templateItemTasks]: keyedSink(templateItemTasks),
    [TABLE.tripSeries]: keyedSink(series),
    [TABLE.destinationProfiles]: keyedSink(profiles),
    [TABLE.destinationChecklistItems]: keyedSink(checklistItems),
    [TABLE.itemDependencies]: keyedSink(dependencies),
  }

  /**
   * removeRow drops a row and everything `childRows` says hangs off it.
   *
   * The cascade used to be written twice — once here, arm by arm inside
   * `applyChange`, and once in `childRows` for the optimistic path — and the
   * two disagreed: a deleted item left its dependency rows behind, a deleted
   * template left its positions' tasks. Both only until the children's own
   * tombstones arrived, which is the *next* pull page when the parent's
   * lands on a page boundary.
   */
  function removeRow(table: SyncTable, id: string): void {
    for (const child of childRows(table, id)) {
      sinks[child.table]?.remove(child.id)
    }
    sinks[table]?.remove(id)
  }

  function applyChange(change: PullChange): void {
    const known = codecFor(change.table)
    if (!known || !sinks[known.table]) return
    const { table, codec } = known
    if (change.deleted) {
      removeRow(table, change.id)
    } else if (change.row) {
      applyToSink(sinks, table, codec.parse(change.id, change.row as SyncRow))
    }
  }

  function applyChanges(changes: PullChange[]): void {
    for (const c of changes) {
      applyChange(c)
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
    activeItemList,
    activeTemplateList,
    retiredItemList,
    retiredTemplateList,
    getItem,
    getTemplate,
    getTemplateItems,
    templateItemCount,
    positionList,
    templateIncludes,
    includeList,
    getIncludes,
    getIncludedBy,
    templateItemTaskList,
    getTemplateItemTasks,
    compositionSource,
    portableResolvers,
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
    childRows,
    applyChange,
    applyChanges,
  }
})
