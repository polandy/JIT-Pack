/**
 * FR-29.19 — a route being edited: the draft, its undo and redo, and the
 * requests its new legs make. The rules are `domain/route.ts`; this is the
 * part that waits on a network.
 *
 * Every edit pushes the draft it replaces. An answer arriving for a leg is
 * written into every draft that still has the leg waiting, so undoing to a
 * draft does not ask again for what was already answered. A leg whose
 * request fails is drawn straight and said so (`onFallback`).
 */
import { computed, shallowRef, type ComputedRef } from 'vue'

import type { TrackKind } from '@/api/types'
import {
  pendingLegs,
  resolveLeg,
  type LatLon,
  type NewLegMode,
  type RouteDraft,
  type RoutePoint,
} from '@/domain/route'

/** What a leg is fetched with — `lib/routing.ts` in the app, fakes in a test. */
export interface LegFetchers {
  path(from: LatLon, to: LatLon, kind: TrackKind, signal: AbortSignal): Promise<RoutePoint[]>
  straight(from: LatLon, to: LatLon, signal: AbortSignal): Promise<RoutePoint[]>
}

export interface RouteEditor {
  draft: ComputedRef<RouteDraft>
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  /** Whether anything was edited — what the discard question asks about. */
  edited: ComputedRef<boolean>
  /** Applies one edit; the draft it replaces becomes the undo. */
  edit(change: (draft: RouteDraft) => RouteDraft): void
  undo(): void
  redo(): void
  /** The kind the route is fetched for; a route drawn from nothing chooses it. */
  setKind(kind: TrackKind): void
  /** Resolves once no leg is waiting — the seam a test and saving wait on. */
  settled(): Promise<void>
  /** Stops every request; the editor is closed. */
  dispose(): void
}

export interface RouteEditorOptions {
  draft: RouteDraft
  kind: TrackKind
  fetchers: LegFetchers
  /** A path leg came back without a path and is drawn straight. */
  onFallback?: () => void
}

/** How a new leg is made: along paths where routing is on and chosen, else straight. */
export function legMode(followPaths: boolean, routingOn: boolean): NewLegMode {
  return followPaths && routingOn ? 'path' : 'line'
}

export function createRouteEditor(options: RouteEditorOptions): RouteEditor {
  const current = shallowRef(options.draft)
  const undos = shallowRef<RouteDraft[]>([])
  const redos = shallowRef<RouteDraft[]>([])
  let kind = options.kind
  const asked = new Map<number, AbortController>()
  let waiters: (() => void)[] = []

  function resolveEverywhere(id: number, points: RoutePoint[]) {
    current.value = resolveLeg(current.value, id, points)
    undos.value = undos.value.map((draft) => resolveLeg(draft, id, points))
    redos.value = redos.value.map((draft) => resolveLeg(draft, id, points))
  }

  function wake() {
    if (pendingLegs(current.value).length > 0) return
    const ready = waiters
    waiters = []
    ready.forEach((resolve) => resolve())
  }

  /** Asks for every waiting leg not yet asked for. */
  function ask() {
    for (const leg of pendingLegs(current.value)) {
      if (asked.has(leg.id)) continue
      const controller = new AbortController()
      asked.set(leg.id, controller)
      const request =
        leg.mode === 'path'
          ? options.fetchers
              .path(leg.from, leg.to, kind, controller.signal)
              .catch(async (error: unknown) => {
                if (controller.signal.aborted) throw error
                options.onFallback?.()
                return options.fetchers.straight(leg.from, leg.to, controller.signal)
              })
          : options.fetchers.straight(leg.from, leg.to, controller.signal)
      request
        .then((points) => resolveEverywhere(leg.id, points))
        .catch(() => {
          // Aborted: the editor closed, nothing is left to draw.
        })
        .finally(() => {
          asked.delete(leg.id)
          wake()
        })
    }
    wake()
  }

  function edit(change: (draft: RouteDraft) => RouteDraft) {
    const next = change(current.value)
    if (next === current.value) return
    undos.value = [...undos.value, current.value]
    redos.value = []
    current.value = next
    ask()
  }

  function step(from: typeof undos, to: typeof undos) {
    const last = from.value[from.value.length - 1]
    if (!last) return
    to.value = [...to.value, current.value]
    from.value = from.value.slice(0, -1)
    current.value = last
    ask()
  }

  ask()

  return {
    draft: computed(() => current.value),
    canUndo: computed(() => undos.value.length > 0),
    canRedo: computed(() => redos.value.length > 0),
    edited: computed(() => undos.value.length > 0),
    edit,
    undo: () => step(undos, redos),
    redo: () => step(redos, undos),
    setKind(next) {
      kind = next
    },
    settled() {
      if (pendingLegs(current.value).length === 0) return Promise.resolve()
      return new Promise((resolve) => waiters.push(resolve))
    },
    dispose() {
      asked.forEach((controller) => controller.abort())
      asked.clear()
    },
  }
}
