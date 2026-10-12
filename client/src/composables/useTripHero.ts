/**
 * The hero card's element list (FR-21.13, FR-21.15): one wording of a trip
 * for both screens that draw it.
 *
 * M1 and M2 draw the same `TripHero`, and while each screen worked out its
 * props on its own, M2's card lost the phase word, the day counter and the
 * open count without anything failing (UX-06). The list lives here so that a
 * line is on both cards or on neither; what a screen adds *below* the head
 * and the figure — M1's preview and day blocks, M2's change chips — stays the
 * screen's.
 */
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { isOpenRow } from '@/domain/dashboardSections'
import { tripDay } from '@/domain/tripDay'
import { t } from '@/i18n'
import { formatTripPeriod } from '@/lib/format'
import { dayText, phaseWord, type DayText } from '@/lib/tripDayText'
import { pastPacking } from '@/domain/shared/tripPhase'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { Trip } from '@/types/domain'

/** The phase word after the dates (FR-7.10). */
export interface TripHeroPhase {
  label: string
  done: boolean
}

/** Everything `TripHero` states about a trip, in the order it states it. */
export interface TripHeroCard {
  name: string
  when: string
  phase: TripHeroPhase
  counter: DayText | null
  meta: string | null
  percent: number
  progress: string
  detail: string | null
}

/**
 * useTripHero words a trip as the hero card, and exposes the phase and the
 * counter on their own for M1's list cards, which carry the same two.
 *
 * The day is read where it is asked, so a screen left open across midnight
 * reads the new day on its next render rather than a cached one.
 */
export function useTripHero() {
  const tripStore = useTripStore()
  const masterStore = useMasterStore()
  const orchestrator = useOrchestrator()

  /** FR-7.10: the trip is past its packing — stamped, or its first day has come. */
  function movedOn(trip: Trip): boolean {
    return pastPacking(trip, orchestrator.today())
  }

  function phaseOf(trip: Trip): TripHeroPhase {
    const moved = movedOn(trip)
    return { label: phaseWord(moved), done: moved }
  }

  function counterOf(trip: Trip): DayText | null {
    return dayText(tripDay(trip, new Date(orchestrator.now())))
  }

  /**
   * The series the trip came out of, then who it is for. A trip whose rows
   * are not on the device yet (ADR-033) has no travellers to name, which is
   * not the same as having none — so the names are simply left out.
   */
  function metaOf(trip: Trip, known: boolean): string | null {
    const series = trip.series_id
      ? (masterStore.getSeries(trip.series_id)?.name ?? t('trips.seriesFallback'))
      : null
    const names = known
      ? tripStore
          .getTravelers(trip.id)
          .map((traveler) => traveler.name)
          .join(', ')
      : ''
    return [series, names].filter(Boolean).join(' · ') || null
  }

  function heroOf(trip: Trip): TripHeroCard {
    const known = orchestrator.tripDataLoaded(trip.id)
    const kpis = tripStore.kpis(trip.id)
    const open = known ? tripStore.getItems(trip.id).filter(isOpenRow).length : 0
    return {
      name: trip.name,
      when: formatTripPeriod(trip),
      phase: phaseOf(trip),
      counter: counterOf(trip),
      meta: metaOf(trip, known),
      percent:
        known && kpis.totalItems > 0 ? Math.round((kpis.packedItems / kpis.totalItems) * 100) : 0,
      progress: known
        ? t('trips.itemSummary', { packed: kpis.packedItems, total: kpis.totalItems })
        : t('trips.itemsUnknown'),
      detail: open > 0 ? t('dashboard.openCount', { n: open }) : null,
    }
  }

  return { heroOf, movedOn, phaseOf, counterOf }
}
