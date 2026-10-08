/**
 * Where the composition root (`App.vue`) binds the bridge from an idea to the
 * packing side (FR-29.13, ADR-078) — the shapes are `domain/ideaBridge.ts`, so
 * the planner's rules read them without reaching up into `kernel/`. The screen
 * each kind of result is made on stays here: it names a route.
 */
import type { InjectionKey } from 'vue'

import type { IdeaLookup, IdeaResultKind, IdeaResultSource } from '@/domain/ideaBridge'
import { IDEA_RESULT_EXCURSION, IDEA_RESULT_SHOPPING, IDEA_RESULT_TASK } from '@/domain/ideaBridge'
import type { IdeaBridgeScreen } from '@/router/paths'

/** The screen each kind of result is made on. */
export const IDEA_RESULT_SCREEN: Record<IdeaResultKind, IdeaBridgeScreen> = {
  [IDEA_RESULT_EXCURSION]: 'excursions',
  [IDEA_RESULT_TASK]: 'tasks',
  [IDEA_RESULT_SHOPPING]: 'shopping',
}

/** The injection key the packing side and the shopping module read the idea through. */
export const IDEA_LOOKUP = Symbol('ideaLookup') as InjectionKey<IdeaLookup>

/** The injection key the planner reads an idea's results from. */
export const IDEA_RESULT_SOURCES = Symbol('ideaResultSources') as InjectionKey<
  readonly IdeaResultSource[]
>
