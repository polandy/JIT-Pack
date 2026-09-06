/**
 * The orchestrator's injection key, and the one way a view asks for it.
 *
 * The facade was provided under the string `'orchestrator'` and injected at
 * 27 sites as `inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!`
 * — the type written out at every site, and a non-null assertion standing in
 * for the check nobody made. An `InjectionKey` carries the type instead, so a
 * view names neither.
 *
 * The assertion was also not true. `App.vue` provides `null` until a mode is
 * chosen (M17), and the views below it are unreachable in that state rather
 * than guarded against it — so an injection that ever came back empty would
 * have surfaced as `Cannot read properties of undefined` at whatever the view
 * called first. {@link useOrchestrator} says what actually went wrong.
 */
import { inject, type InjectionKey } from 'vue'
import type { Orchestrator } from './useSyncOrchestrator'

/**
 * Nullable on purpose: `App.vue` genuinely holds no orchestrator until a mode
 * is chosen, and a key that claimed otherwise would push the lie one level up
 * into the provider. {@link useOrchestrator} is where the null is turned into
 * a sentence, once, instead of at 27 call sites.
 */
export const ORCHESTRATOR = Symbol('orchestrator') as InjectionKey<Orchestrator | null>

/**
 * The orchestrator this app was mounted with.
 *
 * Throws where none was provided — which for a view means it was rendered
 * outside `App.vue`, or before a mode was chosen. Both are wiring mistakes
 * with no sensible fallback: returning null would only move the failure to
 * the first write and hide where it came from.
 */
export function useOrchestrator(): Orchestrator {
  const orchestrator = inject(ORCHESTRATOR, null)
  if (!orchestrator) {
    throw new Error(
      'No orchestrator was provided. A view that writes must be rendered under App.vue, ' +
        'and only after a mode has been chosen (M17).',
    )
  }
  return orchestrator
}
