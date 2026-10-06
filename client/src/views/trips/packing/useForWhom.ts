/**
 * FR-25.28: who an item is for, answered on the row — the seat column, the one
 * strip that may be open, and which leaving row is only changing shape.
 */
import { computed, ref, type ComputedRef } from 'vue'

import { forWhomColumn, membershipKey } from '@/domain/membership'
import { isReshaped, type PackingEntry, type PackingView } from '@/domain/packingView'
import type { TripItem } from '@/types/domain'

import type { PackingCore } from './usePackingCore'

/** The strip's state and the resolvers `PackingGroupList` reads it through. */
export type ForWhom = ReturnType<typeof useForWhom>

/** Builds {@link ForWhom} over the page's core and the view it renders. */
export function useForWhom(core: PackingCore, view: ComputedRef<PackingView>) {
  /** FR-25.28's *who* column — the rule is `forWhomColumn`'s. */
  const seatColumn = computed(() =>
    forWhomColumn(core.travelers.value.length, core.closingPass.value),
  )

  /**
   * Which item's strip is open — at most one, so working down a list costs one
   * tap per row to move on. Held by {@link membershipKey} rather than by a row
   * id: the first traveler turns a row into a cluster and the last one turns it
   * back, and the strip has to stay open across both.
   */
  const openKey = ref<string | null>(null)

  function keyOf(entry: PackingEntry): string | null {
    if (entry.kind === 'item') return membershipKey(entry.item)
    const instance = core.allItems.value.find((i) => i.id === entry.instanceIds[0])
    return instance ? membershipKey(instance) : null
  }

  /**
   * The entry the open strip hangs under: the first one of that item in list
   * order. Grouped by traveler, one item is several rows in several groups, and
   * a strip under each would be one control drawn N times.
   */
  const anchor = computed<PackingEntry | null>(() => {
    if (openKey.value === null || !seatColumn.value) return null
    for (const group of view.value.groups) {
      for (const entry of group.entries) {
        if (keyOf(entry) === openKey.value) return entry
      }
    }
    return null
  })

  /** What the list shows right now, as `isReshaped` wants it: which items, and which rows. */
  const shown = computed(() => {
    const keys = new Set<string>()
    const rowIds = new Set<string>()
    for (const group of view.value.groups) {
      for (const entry of group.entries) {
        const key = keyOf(entry)
        if (key !== null) keys.add(key)
        if (entry.kind === 'item') rowIds.add(entry.item.id)
        else for (const id of entry.instanceIds) rowIds.add(id)
      }
    }
    return { keys, rowIds }
  })

  const existingRowIds = computed(() => new Set(core.allItems.value.map((i) => i.id)))

  function openOn(entry: PackingEntry): boolean {
    return anchor.value === entry
  }

  function seatFor(entry: PackingEntry): { open: boolean } | null {
    return seatColumn.value ? { open: openOn(entry) } : null
  }

  function toggle(entry: PackingEntry) {
    toggleKey(keyOf(entry))
  }

  /**
   * The row menu's door (FR-25.28): it knows the row, not the entry it stands
   * in, and a child row's item is its head's — the strip hangs under that.
   */
  function toggleItem(item: TripItem) {
    toggleKey(membershipKey(item))
  }

  function toggleKey(key: string | null) {
    openKey.value = openKey.value === key ? null : key
  }

  /**
   * Whether a leaving row is only the old shape of an item still on the list
   * (`isReshaped`) — that one goes at once rather than standing beside its
   * replacement.
   */
  function reshaped(key: string, rowId: string | null): boolean {
    return isReshaped({ key, rowId }, shown.value, existingRowIds.value)
  }

  return { seatColumn, keyOf, openOn, seatFor, toggle, toggleItem, reshaped }
}
