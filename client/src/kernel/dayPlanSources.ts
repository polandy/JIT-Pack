/**
 * Where the composition root (`App.vue`) binds the day plan's sources and
 * travellers (FR-29.15) — the shapes are `domain/dayPlanLine.ts`, so the
 * planner's rules read them without reaching up into `kernel/`.
 */
import type { InjectionKey } from 'vue'

import type { DayPlanSource, DayPlanTravelers } from '@/domain/dayPlanLine'

/** The injection key the day plan reads its sources from. */
export const DAY_PLAN_SOURCES = Symbol('dayPlanSources') as InjectionKey<readonly DayPlanSource[]>

/** The injection key the day plan reads the trip's travellers from. */
export const DAY_PLAN_TRAVELERS = Symbol('dayPlanTravelers') as InjectionKey<DayPlanTravelers>
