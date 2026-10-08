/**
 * Whether an excursion's route card is open (FR-31.15). While something on
 * the excursion's list is still to pack, the card starts folded — the list is
 * what the screen is for then; once nothing is open, it starts open, since
 * the way is what is left to look at.
 *
 * A fold or unfold is kept per excursion on this device — a viewing
 * preference, never synced (`blockFold.ts`'s stance) — together with whether
 * packing was still open when it was made: a choice made while packing does
 * not outlast the packing, so a finished list shows the route again.
 */
import { computed, ref, watch, type ComputedRef } from 'vue'

/** Namespaced so an excursion's key cannot collide with another preference's. */
const KEY_PREFIX = 'jp_route_fold_'

/** A remembered choice, and the phase it was made in. */
export interface RouteFoldChoice {
  open: boolean
  /** Whether the list still had something to pack when the choice was made. */
  packing: boolean
}

/** The card's state: the choice made in this phase, else the phase's default. */
export function routeCardOpen(choice: RouteFoldChoice | null, packing: boolean): boolean {
  return choice !== null && choice.packing === packing ? choice.open : !packing
}

function read(excursionId: string): RouteFoldChoice | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY_PREFIX + excursionId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RouteFoldChoice>
    return typeof parsed.open === 'boolean' && typeof parsed.packing === 'boolean'
      ? { open: parsed.open, packing: parsed.packing }
      : null
  } catch {
    return null
  }
}

function write(excursionId: string, choice: RouteFoldChoice) {
  try {
    globalThis.localStorage?.setItem(KEY_PREFIX + excursionId, JSON.stringify(choice))
  } catch {
    // A preference that cannot be kept is still honoured for this visit.
  }
}

/** The route card's fold for one excursion, following whether its list still has something to pack. */
export function useRouteFold(
  excursionId: () => string,
  packing: () => boolean,
): { open: ComputedRef<boolean>; toggle: () => void } {
  const choice = ref<RouteFoldChoice | null>(read(excursionId()))
  // A page kept by the router across excursions reads the next one's own choice.
  watch(excursionId, (id) => (choice.value = read(id)))
  const open = computed(() => routeCardOpen(choice.value, packing()))
  function toggle() {
    choice.value = { open: !open.value, packing: packing() }
    write(excursionId(), choice.value)
  }
  return { open, toggle }
}
