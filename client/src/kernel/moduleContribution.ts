/**
 * The one shape a feature module registers in (ADR-066 amendment 3).
 *
 * A module hands the kernel two things: its store, which the orchestrator is
 * built with, and a `contribute(host)` that names everything else it offers
 * the kernel's contracts — its activity readers, its dashboard cards, its
 * lines on the shopping list, the day plan or an excursion, its counts. The
 * composition root (`App.vue`) folds every module's contribution and the
 * kernel's own (`kernelPorts.ts`) into one {@link Composition} and provides
 * it, so the root names no module and no contract per module.
 *
 * Some answers need every contributor's: the shopping count reads every
 * shopping source, meals' included; whether the plan's day is empty reads
 * every day-plan source. The host hands those lists back **lazily** — read
 * inside a call, after the fold — so a module reads the folded list and never
 * another module. Nothing is registered at start-up: the list of modules is a
 * constant (`featureModules.ts`), which a spec folds the same way.
 */
import { provide, type Component } from 'vue'

import type { ActivityReaders } from '@/domain/shared/activityReader'
import type { DayPlanSource, DayPlanTravelers } from '@/domain/shared/dayPlanLine'
import type { IdeaLookup, IdeaResultSource } from '@/domain/shared/ideaBridge'
import type { MealContext, MealPlaceIdea } from '@/domain/shared/mealContext'
import type { OpeningTrip } from '@/lib/tripOpening'
import type { TripViewCounts } from '@/lib/tripViews'
import type { FeatureStore, ModuleHost } from '@/sync/featureModule'
import { ACTIVITY_READERS } from './activityReaders'
import { DAY_PLAN_SOURCES, DAY_PLAN_TRAVELERS } from './dayPlanSources'
import {
  EXCURSION_CONNECTIONS,
  EXCURSION_JOURNEY_LINE,
  type ExcursionJourneyLine,
} from './excursionConnections'
import { EXCURSION_EXTRA_LINES, type ExcursionExtraSource } from './excursionExtraLines'
import { IDEA_LOOKUP, IDEA_RESULT_SOURCES } from './ideaBridge'
import { MEAL_CONTEXT } from './mealContext'
import { PACKING_CLOSE_CROSSINGS, type PackingCloseCrossing } from './packingClose'
import { SHOPPING_SOURCES, type ShoppingSource } from './shoppingSources'
import { DUE_PURCHASES, TRIP_CARDS, type DuePurchases } from './tripCards'
import { TRIP_VIEW_COUNTS } from './tripViewCounts'

/** A trip's shortlisted ideas — the planner's answer to the meal plan's question (M31). */
export type IdeaShortlist = (tripId: string) => MealPlaceIdea[]

/** Whether the day a trip's plan opens on holds nothing (FR-29.7) — the planner's answer. */
export type DayPlanEmpty = (tripId: string, trip: OpeningTrip, today: string) => boolean

/** The lists every contributor adds to, read when called — never while contributing. */
export interface FoldedSources {
  /** Every shopping source, the kernel's and each module's (FR-30.2, FR-33.3). */
  shoppingSources(): readonly ShoppingSource[]
  /** Every day-plan source (FR-29.15, FR-33.5). */
  dayPlanSources(): readonly DayPlanSource[]
  /** Every other module's lines on an excursion's list (FR-33.6). */
  excursionExtraLines(): readonly ExcursionExtraSource[]
  /** Every contributor's shortlisted ideas of a trip. */
  shortlist(tripId: string): MealPlaceIdea[]
}

/** What a module is handed to contribute with. */
export interface CompositionHost extends FoldedSources {
  /** The write path a module's actions are built on. */
  readonly module: ModuleHost
  /** Today as the device reckons it (`orchestrator.today()`). */
  today(): string
  /** What the meal plan reads of the trip, answered by the kernel (`kernelPorts.ts`). */
  readonly mealContext: MealContext
}

/**
 * One contributor's share of the kernel's contracts, each optional. A list
 * is appended to in contributor order; a record is merged and refuses a key
 * twice; a single answer may come from one contributor at most.
 */
export interface ModuleContribution {
  /** FR-32.2: the activity log's readers of the contributor's tables. */
  activityReaders?: ActivityReaders
  /** FR-30.7: M1's cards under each trip, in the order given. */
  tripCards?: readonly Component[]
  /** Components the shell mounts once, beside the outlet — a sheet opened from several screens. */
  shell?: readonly Component[]
  shoppingSources?: readonly ShoppingSource[]
  dayPlanSources?: readonly DayPlanSource[]
  excursionExtraLines?: readonly ExcursionExtraSource[]
  /** FR-29.13: what came of an idea, by the side that made it. */
  ideaResults?: readonly IdeaResultSource[]
  shortlist?: IdeaShortlist
  /** FR-21.21: the trip switcher's numbers, one per view. */
  viewCounts?: TripViewCounts
  /** FR-7.12: what closing the packing moves across besides the packing rows. */
  closeCrossings?: readonly PackingCloseCrossing[]
  ideaLookup?: IdeaLookup
  excursionConnections?: Component
  excursionJourneyLine?: ExcursionJourneyLine
  duePurchases?: DuePurchases
  dayPlanEmpty?: DayPlanEmpty
}

/** A feature module as the composition root reads it — its whole registration. */
export interface FeatureModule {
  /** The module's store for the orchestrator, which exists before any host does. */
  featureStore(): FeatureStore
  contribute(host: CompositionHost): ModuleContribution
}

/** Every contribution folded, with the kernel's own ports beside it. */
export interface Composition {
  activityReaders: ActivityReaders
  tripCards: readonly Component[]
  shell: readonly Component[]
  shoppingSources: readonly ShoppingSource[]
  dayPlanSources: readonly DayPlanSource[]
  excursionExtraLines: readonly ExcursionExtraSource[]
  ideaResults: readonly IdeaResultSource[]
  shortlists: readonly IdeaShortlist[]
  viewCounts: TripViewCounts
  closeCrossings: readonly PackingCloseCrossing[]
  ideaLookup: IdeaLookup | null
  excursionConnections: Component | null
  excursionJourneyLine: ExcursionJourneyLine | null
  duePurchases: DuePurchases | null
  dayPlanEmpty: DayPlanEmpty | null
  mealContext: MealContext
  dayPlanTravelers: DayPlanTravelers
}

/** The kernel's own ports, built over the folded lists (`kernelPorts.ts`). */
export interface KernelPorts {
  contribution: ModuleContribution
  mealContext: MealContext
  dayPlanTravelers: DayPlanTravelers
}

/** The contributions folded in order — refusing a record key or a single answer given twice. */
export function foldContributions(
  contributions: readonly ModuleContribution[],
): Omit<Composition, 'mealContext' | 'dayPlanTravelers'> {
  const each = <K extends keyof ModuleContribution>(key: K) =>
    contributions.flatMap((c) => (c[key] === undefined ? [] : [c[key]!]))
  return {
    activityReaders: merged('activityReaders', each('activityReaders')),
    viewCounts: merged('viewCounts', each('viewCounts')),
    tripCards: each('tripCards').flat(),
    shell: each('shell').flat(),
    shoppingSources: each('shoppingSources').flat(),
    dayPlanSources: each('dayPlanSources').flat(),
    excursionExtraLines: each('excursionExtraLines').flat(),
    ideaResults: each('ideaResults').flat(),
    closeCrossings: each('closeCrossings').flat(),
    shortlists: each('shortlist'),
    ideaLookup: single('ideaLookup', each('ideaLookup')),
    excursionConnections: single('excursionConnections', each('excursionConnections')),
    excursionJourneyLine: single('excursionJourneyLine', each('excursionJourneyLine')),
    duePurchases: single('duePurchases', each('duePurchases')),
    dayPlanEmpty: single('dayPlanEmpty', each('dayPlanEmpty')),
  }
}

function merged<V>(name: string, records: readonly Readonly<Partial<Record<string, V>>>[]) {
  const out: Partial<Record<string, V>> = {}
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (key in out) throw new Error(`module contributions: ${name}.${key} is given twice`)
      out[key] = value
    }
  }
  return out
}

function single<V>(name: string, given: readonly V[]): V | null {
  if (given.length > 1) throw new Error(`module contributions: ${name} is answered twice`)
  return given[0] ?? null
}

/**
 * Folds the kernel's ports and each module's contribution, kernel first, then
 * the modules in the order given. A folded list read before the fold is done
 * — by a contributor reading it while it contributes — throws.
 */
export function composeModules(
  modules: readonly FeatureModule[],
  base: {
    module: ModuleHost
    today(): string
    kernel(sources: FoldedSources): KernelPorts
  },
): Composition {
  let composition: Composition | null = null
  const folded = (): Composition => {
    if (!composition) throw new Error('module contributions: a folded list read before the fold')
    return composition
  }
  const sources: FoldedSources = {
    shoppingSources: () => folded().shoppingSources,
    dayPlanSources: () => folded().dayPlanSources,
    excursionExtraLines: () => folded().excursionExtraLines,
    shortlist: (tripId) => folded().shortlists.flatMap((shortlist) => shortlist(tripId)),
  }
  const kernel = base.kernel(sources)
  const host: CompositionHost = {
    ...sources,
    module: base.module,
    today: base.today,
    mealContext: kernel.mealContext,
  }
  const contributions = [kernel.contribution, ...modules.map((m) => m.contribute(host))]
  composition = {
    ...foldContributions(contributions),
    mealContext: kernel.mealContext,
    dayPlanTravelers: kernel.dayPlanTravelers,
  }
  return composition
}

/** Provides the composition under the kernel's keys, for the screens that inject them. */
export function provideComposition(composition: Composition): void {
  provide(ACTIVITY_READERS, composition.activityReaders)
  provide(TRIP_CARDS, composition.tripCards)
  provide(SHOPPING_SOURCES, composition.shoppingSources)
  provide(DAY_PLAN_SOURCES, composition.dayPlanSources)
  provide(DAY_PLAN_TRAVELERS, composition.dayPlanTravelers)
  provide(EXCURSION_EXTRA_LINES, composition.excursionExtraLines)
  provide(IDEA_RESULT_SOURCES, composition.ideaResults)
  provide(TRIP_VIEW_COUNTS, composition.viewCounts)
  provide(PACKING_CLOSE_CROSSINGS, composition.closeCrossings)
  provide(MEAL_CONTEXT, composition.mealContext)
  provide(EXCURSION_CONNECTIONS, composition.excursionConnections)
  provide(EXCURSION_JOURNEY_LINE, composition.excursionJourneyLine)
  if (composition.ideaLookup) provide(IDEA_LOOKUP, composition.ideaLookup)
  // M1 reads `undefined` as "no shopping module" and counts nothing.
  if (composition.duePurchases) provide(DUE_PURCHASES, composition.duePurchases)
}
