/**
 * The cards M4 leads with that read beyond the trip's own rows: the archived
 * trip's review teaser (FR-9.4) and the planning trip's forgotten radar
 * (FR-9.5). Both call the domain's rule and only shape its answer for a card.
 */
import { computed, ref, watch } from 'vue'

import type { RadarCardEntry } from '@/components/trips/ForgottenRadarCard.vue'
import { presentToast } from '@/composables/shared/toast'
import { useIdentity } from '@/composables/shared/useTripIdentity'
import {
  RADAR_ENTRY_STAYED_HOME,
  RADAR_REASON_SERIES,
  radarEntries,
  radarReference,
  type RadarEntry,
} from '@/domain/forgottenRadar'
import { buildReviewProposals } from '@/domain/review'
import { formatDay, t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { hideRadar, isRadarHidden } from '@/local/radarHidden'
import { TRIP_STATUS_PLANNING } from '@/types/domain'

import type { PackingCore } from './usePackingCore'

/**
 * FR-9.4: how many proposals the closing card names. UI-Spec M14 promises the
 * card *„teases the first two proposals"*: one that names none says the same
 * thing whether eleven suggestions are waiting or none, which is the one
 * question the tap answers. Two, because the list is one tap away.
 */
const CLOSING_TEASER_COUNT = 2

/** Builds the head cards' bindings over the page's core. */
export function usePackingHead(core: PackingCore) {
  const { tripId, tripStore, masterStore, orchestrator, trip, allItems } = core

  /**
   * The first proposals the review would offer, for the closing card. It
   * calls the same rule M14 calls (invariant 4): a cheaper approximation here
   * would be a rule implemented twice, and the one that drifts is always the
   * summary. Read only inside the card's own `v-if`, so on an active trip it
   * never runs.
   */
  const closingProposals = computed(() =>
    buildReviewProposals({
      items: allItems.value,
      templates: masterStore.templateList,
      templateItems: (id) => masterStore.getTemplateItems(id),
      masterItems: masterStore.itemList,
    }).slice(0, CLOSING_TEASER_COUNT),
  )

  // --- FR-9.5: the forgotten radar ----------------------------------------
  const { directory } = useIdentity(orchestrator.identity)
  const radarHidden = ref(isRadarHidden(tripId))

  const reference = computed(() => {
    const current = trip.value
    if (!current || current.status !== TRIP_STATUS_PLANNING || radarHidden.value) return null
    const trips = tripStore.tripList
    return radarReference(
      current,
      trips,
      trips.flatMap((other) => tripStore.getTemplateSources(other.id)),
      masterStore.templateList,
    )
  })

  // ADR-033: the reference trip's rows travel in its own partition, which
  // Server Mode pulls only when that trip is opened. Same request M2's ring
  // makes; it resolves at once where the rows are already here.
  watch(
    () => reference.value?.trip.id,
    (id) => id && void orchestrator.ensureTripData(id),
    { immediate: true },
  )

  /** Absent where nobody can be named (Local, Single-User) — FR-27.9's rule. */
  function authorName(userId: string): string | null {
    return directory.value.find((u) => u.user_id === userId)?.display_name ?? null
  }

  function cardEntry(entry: RadarEntry, key: string): RadarCardEntry {
    return {
      key,
      name: entry.name,
      why:
        entry.kind === RADAR_ENTRY_STAYED_HOME
          ? t('packing.forgotten')
          : t('packing.radarNotOnList'),
      comments: entry.comments.map((c) => ({
        id: c.commentId,
        body: c.body,
        meta: [authorName(c.authorId), c.writtenOn ? formatDay(c.writtenOn) : null]
          .filter(Boolean)
          .join(' · '),
      })),
    }
  }

  /** The radar's entries keyed for the card, or null while its rows are not here. */
  const entries = computed(() => {
    const ref = reference.value
    if (!ref || !orchestrator.tripDataLoaded(ref.trip.id)) return null
    const found = radarEntries(
      {
        tripId: ref.trip.id,
        tripName: ref.trip.name,
        items: tripStore.getItems(ref.trip.id),
        comments: tripStore.getComments(ref.trip.id),
      },
      allItems.value,
    )
    return new Map(found.map((entry) => [entry.sourceItemId ?? `name:${entry.name}`, entry]))
  })

  /**
   * What the card renders, or null where it is absent: no reference trip, or
   * one whose rows are here and leave nothing to show (FR-9.5 — absent, not
   * empty).
   */
  const radar = computed(() => {
    const ref = reference.value
    if (!ref) return null
    const loaded = entries.value
    if (loaded && loaded.size === 0) return null
    const reason = ref.reason
    return {
      tripName: ref.trip.name,
      reason:
        reason.kind === RADAR_REASON_SERIES
          ? t('packing.radarBySeries', {
              name: masterStore.getSeries(reason.seriesId)?.name ?? t('trips.seriesFallback'),
            })
          : t('packing.radarByTemplate', {
              name: masterStore.getTemplate(reason.templateId)?.name ?? '',
            }),
      entries: loaded ? [...loaded].map(([key, entry]) => cardEntry(entry, key)) : [],
      pending: loaded === null,
    }
  })

  /**
   * „Auf die Liste": one trip-global row from the inventory item, the M14
   * harvest's shape (E2E-FLOW-04), unflagged. The entry leaves by itself —
   * the planning trip now holds the item.
   */
  function onRadarAdd(key: string) {
    const entry = entries.value?.get(key)
    if (!entry) return
    const item = entry.sourceItemId ? masterStore.getItem(entry.sourceItemId) : undefined
    const opts = item
      ? {
          sourceItemId: item.id,
          weightGrams: item.weight_grams,
          valueCents: item.value_cents,
          categoryName: masterStore.categoryOf(item.id),
        }
      : {}
    const name = item?.name ?? entry.name
    const { companions } = orchestrator.packing.setTravelerAssignment(
      tripId,
      name,
      opts,
      core.active.value,
      [],
      [],
    )
    void presentToast({
      message: [
        t('packing.radarAdded', { name }),
        companions.length > 0
          ? t('packing.companionsAdded', { n: companions.length, names: companions.join(', ') })
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      positionAnchor: FAB_ANCHOR.m4,
    })
  }

  function onRadarHide() {
    hideRadar(tripId)
    radarHidden.value = true
  }

  return { closingProposals, radar, onRadarAdd, onRadarHide }
}
