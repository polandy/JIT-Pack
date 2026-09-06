/**
 * The orchestrator's injection key, and the one way a consumer asks for it.
 *
 * The key carries the type, so a consumer restates neither it nor the null
 * check — which is what a string key costs: `inject<T>('orchestrator')` names
 * the type at every site and hands back `T | undefined` for each of them to
 * assert away.
 */
import { inject, type InjectionKey } from 'vue'
import type { Orchestrator } from './useSyncOrchestrator'

/**
 * Nullable on purpose: `App.vue` genuinely holds no orchestrator until a mode
 * is chosen (M17), and a key that claimed otherwise would push the lie one
 * level up into the provider. {@link useOrchestrator} is the one place that
 * null becomes a sentence.
 */
export const ORCHESTRATOR = Symbol('orchestrator') as InjectionKey<Orchestrator | null>

/**
 * The orchestrator this app was mounted with.
 *
 * Throws where none was provided. In the app that means the caller was
 * rendered outside `App.vue` or before a mode was chosen; in a spec it means
 * the mount did not provide the key. All three are wiring mistakes with no
 * sensible fallback — returning null would only move the failure to the first
 * write and hide where it came from.
 *
 * It throws at *setup*, not at first use. That matters for a component which
 * reaches for the orchestrator only sometimes — `ItemThumbnail` calls it only
 * for an item that has a photo — because such a component needs the provide
 * even in a spec that never exercises the photo branch.
 */
export function useOrchestrator(): Orchestrator {
  const orchestrator = inject(ORCHESTRATOR, null)
  if (!orchestrator) {
    throw new Error(
      'No orchestrator was provided under the ORCHESTRATOR key. In the app, render under ' +
        'App.vue and only after a mode has been chosen (M17); in a test, pass it as ' +
        '`global.provide: { [ORCHESTRATOR]: … }`.',
    )
  }
  return orchestrator
}
