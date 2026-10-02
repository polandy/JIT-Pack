/**
 * What every part of M3 reads and writes through: the step, each step's draft
 * (one composable per step), the navigation between them and the create.
 *
 * Made once by `TripWizardPage` and handed to each step component, so none of
 * them reaches into another — they meet here. The draft lives in this state
 * until "Create trip"; Cancel leaves no residue.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { tripPath } from '@/router/paths'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useSubmitOnce } from '@/composables/useSubmitOnce'
import { useWizardComposition } from './useWizardComposition'
import { NEW_SERIES, useWizardMetadata } from './useWizardMetadata'
import { useWizardReview } from './useWizardReview'
import { useWizardTravelers } from './useWizardTravelers'

/** M3's shared state: the four drafts, the step and its navigation. */
export type WizardCore = ReturnType<typeof useWizardCore>

/** Builds {@link WizardCore}; call once, in the page's setup. */
export function useWizardCore() {
  const route = useRoute()
  const router = useRouter()
  const orchestrator = useOrchestrator()

  const step = ref(1)

  // M16 "New trip in series" arrives with ?series=<id>.
  const metadata = useWizardMetadata(route.query.series)
  const roster = useWizardTravelers()
  const composition = useWizardComposition(metadata, roster)
  const review = useWizardReview(metadata, composition)

  const stepValid = computed(() => {
    if (step.value === 1) {
      // No date gate (FR-2.1b): the year is preselected, so the
      // only thing that can be missing here is a name.
      return (
        metadata.name.value.trim() !== '' &&
        (metadata.seriesChoice.value !== NEW_SERIES ||
          (metadata.newSeriesName.value.trim() !== '' && metadata.seriesTaken.value === null))
      )
    }
    if (step.value === 2) return roster.travelers.value.every((t) => t.name.trim() !== '')
    return true
  })

  function next() {
    if (step.value < 4) step.value++
  }

  /**
   * G-16: Enter in a step's plain text field is the step's own navigation
   * button — same handler, same validity gate, so the key can never do more
   * than the click. Bound per field (opt-in), never as a page-wide capture:
   * step 3's item search owns its Enter and must not have it stolen.
   */
  function stepDefaultAction() {
    if (!stepValid.value) return
    if (step.value === 4) createTrip()
    else next()
  }

  function back() {
    if (step.value > 1) step.value--
  }

  /** G-17: the create runs once, and the screen leaves behind it. */
  const creation = useSubmitOnce()

  function createTrip() {
    const { seriesChoice, newSeriesName } = metadata
    creation.submit(() => {
      const tripId = orchestrator.createTripFromWizard({
        name: metadata.name.value.trim(),
        year: metadata.year.value,
        startDate: metadata.startDate.value || null,
        endDate: metadata.endDate.value || null,
        attributes: metadata.attributes.value,
        travelers: roster.travelers.value.map((t) => ({
          name: t.name.trim(),
          linkedUserId: roster.linkedAccountOf(t),
        })),
        items: review.draftItems.value,
        // FR-27.4: what the trip follows from here on. The picks, not the
        // resolved composition — a group reached through a Vorlage is followed
        // *because* the Vorlage includes it, and re-resolving that link each
        // time is what lets a group added to the Vorlage later reach the trip.
        sourceTemplateIds: [...composition.selectedTemplateIds.value],
        tripTasks: composition.generation.value.tripTasks,
        seriesId:
          seriesChoice.value && seriesChoice.value !== NEW_SERIES ? seriesChoice.value : null,
        newSeriesName: seriesChoice.value === NEW_SERIES ? newSeriesName.value.trim() : null,
        checklistItems: review.includeChecklist.value
          ? review.offeredChecklist.value.map((c) => ({ label: c.label, mode: c.mode }))
          : [],
        members: roster.allMembers.value,
      })
      router.replace(tripPath(tripId))
    })
  }

  return {
    step,
    metadata,
    roster,
    composition,
    review,
    stepValid,
    next,
    back,
    stepDefaultAction,
    creation,
    createTrip,
  }
}
