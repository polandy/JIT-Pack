/**
 * M4's view state, and how long each part of it lives (FR-25.18).
 *
 * Packing is a constantly interrupted activity — you leave for M5, the
 * shopping list or the dashboard, or the app is backgrounded and the web
 * view is reloaded — and re-picking four facet values on every return is
 * the friction that makes people stop filtering at all. So it is kept.
 *
 * Two lifetimes, deliberately different:
 *
 *  - **The filter, the Erledigte switch and the FR-25.20 switch: the
 *    session.** A filter *hides rows*, and on a packing list a hidden row
 *    reads as "nothing left to do". Carrying a forgotten filter into next
 *    week's packing is that failure with no visible cause, so a fresh
 *    session always starts from the default.
 *  - **The grouping: durable.** It arranges rows rather than hiding them,
 *    so nothing can be lost behind it.
 *
 * Both are scoped **per trip**: a Person filter on one trip means nothing
 * on another. The search term is deliberately not kept — it is a momentary
 * lookup whose field collapses behind its icon (G-12), so a restored term
 * would filter with no control on screen.
 *
 * Storage refused by the browser (private mode, disabled) degrades to
 * today's behaviour: filtering still works, it simply forgets.
 */
import { ref, watch, type Ref } from 'vue'

import { noFacets } from '@/domain/packingView'
import type { Facets, GroupBy } from '@/types/domain'

const FILTER_PREFIX = 'jitpack.m4filter.'
const GROUP_PREFIX = 'jitpack.m4group.'

interface StoredFilter {
  facets?: Partial<Facets>
  showDone?: boolean
  showOthers?: boolean
}

function readStored(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeStored(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value)
  } catch {
    // Refused: the view still works, it just will not be there next time.
  }
}

function isGroupBy(value: string | null): value is GroupBy {
  return value === 'category' || value === 'container' || value === 'person' || value === 'status'
}

/**
 * The grouping ref of the M4 currently mounted for a trip, if there is
 * one. ADR-012 leaves a single router outlet, so returning to M4 from
 * M12 does not remount it — a grouping written only to storage would sit
 * there unread until the next cold start, which is precisely how the
 * defect this replaces presented. One entry per trip visited this
 * session, replaced whenever M4 mounts again.
 */
const mountedGroupBy = new Map<string, Ref<GroupBy>>()

/**
 * Sets the grouping M4 shows, for a screen that is about to send the
 * reader there — M12's slice tap is the only one today.
 *
 * Storage is written synchronously rather than left to the composable's
 * watcher, which flushes after the current tick and so races the
 * navigation; the live ref is moved as well, for the mount that is
 * already on screen.
 */
export function setStoredGroupBy(tripId: string, groupBy: GroupBy): void {
  writeStored(globalThis.localStorage as Storage | undefined, GROUP_PREFIX + tripId, groupBy)
  const mounted = mountedGroupBy.get(tripId)
  if (mounted) mounted.value = groupBy
}

export function usePackingFilter(tripId: string) {
  // Read through globalThis rather than the bare globals so a caller can
  // hand in a throwing or absent storage in a test without stubbing the
  // window itself.
  const session = globalThis.sessionStorage as Storage | undefined
  const local = globalThis.localStorage as Storage | undefined

  const facets = ref<Facets>(noFacets())
  const showDone = ref(false)
  const showOthers = ref(false)
  const groupBy = ref<GroupBy>('category')

  const filterKey = FILTER_PREFIX + tripId
  const groupKey = GROUP_PREFIX + tripId

  const raw = readStored(session, filterKey)
  if (raw) {
    try {
      const stored = JSON.parse(raw) as StoredFilter
      facets.value = { ...noFacets(), ...stored.facets }
      showDone.value = stored.showDone === true
      showOthers.value = stored.showOthers === true
    } catch {
      // Corrupt entry (a half-written value, a format from another
      // version): start unfiltered rather than refusing to render.
    }
  }

  const storedGroup = readStored(local, groupKey)
  if (isGroupBy(storedGroup)) groupBy.value = storedGroup
  mountedGroupBy.set(tripId, groupBy)

  // One watcher over the whole filter: with a save call per mutation site,
  // the site added next is the one that forgets.
  watch(
    [facets, showDone, showOthers],
    () => {
      writeStored(
        session,
        filterKey,
        JSON.stringify({
          facets: facets.value,
          showDone: showDone.value,
          showOthers: showOthers.value,
        } satisfies StoredFilter),
      )
    },
    { deep: true },
  )

  watch(groupBy, (next) => writeStored(local, groupKey, next))

  /** Clears everything the filter hides behind — the sheet's *Zurücksetzen*. */
  function reset(): void {
    facets.value = noFacets()
    showOthers.value = false
    showDone.value = false
  }

  /** Toggles one value of one facet; the sheet has no other kind of edit. */
  function toggleValue(key: keyof Facets, value: string): void {
    const selected = facets.value[key]
    facets.value = {
      ...facets.value,
      [key]: selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    }
  }

  /** Clears a single facet, for the sheet's per-group *Keine*. */
  function clearFacet(key: keyof Facets): void {
    facets.value = { ...facets.value, [key]: [] }
  }

  return { facets, showDone, showOthers, groupBy, reset, toggleValue, clearFacet }
}
