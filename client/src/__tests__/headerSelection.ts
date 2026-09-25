import { nextTick } from 'vue'

import type { HeaderSelection } from '@/composables/useHeaderSelection'
import { selectionLabel } from '@/lib/selectionLabel'

/**
 * The selection a page hands the app bar (G-20), captured for a spec that
 * mounts the page without the frame. The bar itself is AppHeader's and is
 * specified there; a page spec asserts what the page registered.
 *
 * Wire it with a factory that imports this module, since `vi.mock` is hoisted
 * above the spec's own imports:
 *
 *     vi.mock('@/composables/useHeaderSelection', async (actual) => ({
 *       ...(await actual()),
 *       setHeaderSelection: (await import('@/__tests__/headerSelection')).captureSelection,
 *     }))
 */
let getter: (() => HeaderSelection | null) | null = null

/** Stands in for `setHeaderSelection`: keeps the page's getter. */
export function captureSelection(next: () => HeaderSelection | null): void {
  getter = next
}

/** The selection the page shows right now, or `null` while it is not selecting. */
export function barSelection(): HeaderSelection | null {
  return getter?.() ?? null
}

/** What the bar reads: the count in the words AppHeader renders it in. */
export function barCount(): string {
  const selection = barSelection()
  if (!selection) throw new Error('the page is not selecting')
  return selectionLabel(selection.count)
}

/** Presses the bar's ✕. */
export async function barExit(): Promise<void> {
  barSelection()?.onExit()
  await nextTick()
}

/** Presses the bar's „Alle N". */
export async function barAll(): Promise<void> {
  barSelection()?.onAll()
  await nextTick()
}
