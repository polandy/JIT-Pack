/**
 * M3 step 4 — the quantity review (FR-2.6): overrides, conscious drops, the
 * series' history as a one-tap default (FR-14.2), the suggested companions the
 * user taps in (FR-20.4) and the destination checklist offer (FR-13.3).
 */
import { computed, ref, watchEffect } from 'vue'

import {
  applyReviewOverrides,
  durationDays,
  reviewKeyOf,
  withCompanions,
  type GeneratedItem,
} from '@/domain/instantiate'
import { suggestQuantities, type QuantitySuggestion } from '@/domain/suggestions'
import { tripOrderKey } from '@/domain/trips'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { WizardComposition } from './useWizardComposition'
import { NEW_SERIES, type WizardMetadata } from './useWizardMetadata'

/** Step 4's draft and the rows the trip will be created from. */
export type WizardReview = ReturnType<typeof useWizardReview>

/** Builds {@link WizardReview} over step 1's series and step 3's generation. */
export function useWizardReview(metadata: WizardMetadata, composition: WizardComposition) {
  const masterStore = useMasterStore()
  const tripStore = useTripStore()
  const orchestrator = useOrchestrator()
  const { seriesChoice, duration } = metadata
  const { generation, companionResolution } = composition

  // FR-20.4: suggested companions never join without the user's tap.
  const acceptedSuggestions = ref<Set<string>>(new Set())

  function toggleSuggestion(itemId: string, checked: boolean) {
    const next = new Set(acceptedSuggestions.value)
    if (checked) next.add(itemId)
    else next.delete(itemId)
    acceptedSuggestions.value = next
  }

  // Keyed by `reviewKeyOf`, not by position — the review list can reorder
  // while it is open (a drop, a suggestion accepted, a step-2 change
  // upstream), and an override must follow the row it was made on.
  const quantityOverrides = ref<Record<string, number>>({})
  const includeChecklist = ref(true)

  const offeredChecklist = computed(() => {
    if (!seriesChoice.value || seriesChoice.value === NEW_SERIES) return []
    const profile = masterStore.getDestinationProfile(seriesChoice.value)
    return profile ? masterStore.getChecklistItems(profile.id) : []
  })

  function reviewQuantity(item: GeneratedItem): number {
    return quantityOverrides.value[reviewKeyOf(item)] ?? item.quantity
  }

  /**
   * The rows the trip will be created from: the generated list as the review
   * left it, plus the companions it pulls in. One derivation, so the count the
   * user reads and the list `createTrip` sends cannot come apart.
   */
  const draftItems = computed(() =>
    withCompanions(
      applyReviewOverrides(generation.value.items, quantityOverrides.value),
      companionResolution.value,
      acceptedSuggestions.value,
    ),
  )

  /**
   * FR-2.6: dropping a row is FR-5.5 *„bewusst weggelassen"*, not deletion — the
   * row stays, struck through and reversible, and reaches the trip with quantity
   * 0, which `addGeneratedTripItem` turns into `skipped`. Deleting it instead
   * would leave the next trip nothing to learn from, and would mean this one act
   * behaved differently here than everywhere else in the product.
   */
  function dropRow(item: GeneratedItem) {
    quantityOverrides.value = { ...quantityOverrides.value, [reviewKeyOf(item)]: 0 }
  }

  function restoreRow(item: GeneratedItem) {
    const key = reviewKeyOf(item)
    const { [key]: _dropped, ...rest } = quantityOverrides.value
    quantityOverrides.value = rest
  }

  function isDropped(item: GeneratedItem): boolean {
    return reviewQuantity(item) === 0
  }

  /** What is actually coming — a count that ignored a dropped row would lie. */
  const comingCount = computed(() => draftItems.value.filter((i) => i.quantity > 0).length)

  function overrideQuantity(item: GeneratedItem, value: string) {
    const qty = Number(value)
    if (!Number.isFinite(qty) || qty < 0) return
    quantityOverrides.value = { ...quantityOverrides.value, [reviewKeyOf(item)]: Math.floor(qty) }
  }

  /** The series' own trips — the history FR-14.2's median is taken over. */
  const seriesTrips = computed(() => {
    const seriesId =
      seriesChoice.value && seriesChoice.value !== NEW_SERIES ? seriesChoice.value : null
    return seriesId ? tripStore.tripList.filter((t) => t.series_id === seriesId) : []
  })

  /*
   * Their rows live in each trip's own partition, which Server and
   * Single-User Mode pull only when a trip is *opened* (ADR-033). Ask for
   * them here, or the screen reads `getItems` of trips this device never
   * pulled — which does not read as "unknown" but as "that trip packed none
   * of it".
   */
  watchEffect(() => {
    for (const trip of seriesTrips.value) void orchestrator.ensureTripData(trip.id)
  })

  /**
   * historyReady: every one of those partitions is actually here. Same
   * doctrine as M2's ring and the clone page — a median taken over the
   * subset that happens to have arrived is not a weaker suggestion, it is a
   * different number, and the hint states it with the same confidence.
   */
  const historyReady = computed(() =>
    seriesTrips.value.every((trip) => orchestrator.tripDataLoaded(trip.id)),
  )

  // FR-14.2: duration-normalized median of the series' recent trips (synced
  // on-device), so step 4 can offer a one-tap history default per item.
  const suggestions = computed(() => {
    if (!historyReady.value) return new Map<string, QuantitySuggestion>()
    // Fall back an unknown duration to the target, making normalization a
    // no-op for that trip rather than distorting it (FR-2.1a spirit).
    const target = duration.value ?? 1
    const history = seriesTrips.value.map((t) => ({
      id: t.id,
      orderKey: tripOrderKey(t),
      year: t.year,
      durationDays: durationDays(t.start_date, t.end_date) ?? target,
      items: tripStore
        .getItems(t.id)
        .filter((i) => i.source_item_id)
        .map((i) => ({ sourceItemId: i.source_item_id as string, quantity: i.quantity })),
    }))
    return suggestQuantities(history, target)
  })

  /** The history suggestion for a row, only when it differs from the value
   * currently shown (nothing to offer otherwise). */
  function suggestionFor(item: GeneratedItem): QuantitySuggestion | null {
    const s = suggestions.value.get(item.source_item_id)
    return s && s.suggested !== reviewQuantity(item) ? s : null
  }

  function acceptSuggestion(item: GeneratedItem) {
    const s = suggestionFor(item)
    if (s)
      quantityOverrides.value = { ...quantityOverrides.value, [reviewKeyOf(item)]: s.suggested }
  }

  return {
    acceptedSuggestions,
    toggleSuggestion,
    includeChecklist,
    offeredChecklist,
    reviewQuantity,
    draftItems,
    dropRow,
    restoreRow,
    isDropped,
    comingCount,
    overrideQuantity,
    suggestionFor,
    acceptSuggestion,
  }
}
