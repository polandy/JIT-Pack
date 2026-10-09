/**
 * The feature modules this build composes (ADR-066 amendment 3) — the one
 * list `App.vue` folds and the wiring specs fold the same way. A constant,
 * never a registry filled at start-up: a spec that reads it sees every module.
 *
 * The order is M1's order of the modules' dashboard cards (FR-29.7, FR-33.7,
 * FR-30.7), and the order their lines follow the kernel's on a shared list.
 */
import type { FeatureModule } from '@/kernel/moduleContribution'
import { mealsModule } from '@/meals'
import { plannerModule } from '@/planner'
import { shoppingModule } from '@/shopping'

export const FEATURE_MODULES: readonly FeatureModule[] = [
  plannerModule,
  mealsModule,
  shoppingModule,
]
