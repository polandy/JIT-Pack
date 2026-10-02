/**
 * M3 step 1 — the trip's metadata (FR-2.1/2.1a/15.1): name, year, the folded
 * optional fields, the series (FR-13.1) and the attributes they prefill.
 */
import { computed, ref } from 'vue'

import { formatDay, formatDayRange } from '@/i18n'
import { attributeLabel } from '@/lib/attributeLabels'
import { tripYearChoices } from '@/domain/tripYears'
import { durationDays } from '@/domain/instantiate'
import { useMasterStore } from '@/stores/masterStore'
import { useOrchestrator } from '@/composables/useOrchestrator'

/** Step 1's draft and what is derived from it. */
export type WizardMetadata = ReturnType<typeof useWizardMetadata>

/**
 * Builds {@link WizardMetadata}. `preselect` is the `?series=<id>` M16's
 * "New trip in series" arrives with.
 */
export function useWizardMetadata(preselect: unknown) {
  const masterStore = useMasterStore()
  const orchestrator = useOrchestrator()

  const name = ref('')
  /**
   * FR-2.1b: the year is the only temporal fact a trip needs, and it starts
   * on the current one — the overwhelmingly common case is a trip this year
   * or the next, and a preselected value means the required field is
   * already satisfied when the screen opens.
   */
  const thisYear = new Date().getFullYear()
  const yearChoices = tripYearChoices(thisYear)
  const year = ref(thisYear)

  /**
   * FR-2.1c: step 1 shows the two fields it requires and folds the rest
   * away — the FR-25.7/FR-24.5 idiom applied to trip creation. A trip is
   * created far more often than it is configured, and seven fields at once
   * make the common case look like the rare one.
   */
  const moreOpen = ref(false)

  const startDate = ref('')
  const endDate = ref('')

  function onDates(start: string, end: string): void {
    startDate.value = start
    endDate.value = end
  }
  const season = ref('')
  const transportMode = ref('')
  const accommodation = ref('')
  const tagsInput = ref('')

  // --- Series picker (FR-13.1) — '' none, 'new' inline creation ---
  const seriesChoice = ref<string>('')
  const newSeriesName = ref('')

  /** Picking a series prefills empty attribute chips from its defaults. */
  function pickSeries(choice: string) {
    seriesChoice.value = choice
    const defaults =
      choice && choice !== 'new' ? masterStore.getSeries(choice)?.default_attributes : null
    if (!defaults) return
    if (!season.value && typeof defaults.season === 'string') season.value = defaults.season
    if (!transportMode.value && typeof defaults.transport_mode === 'string')
      transportMode.value = defaults.transport_mode
    if (!accommodation.value && typeof defaults.accommodation === 'string')
      accommodation.value = defaults.accommodation
  }

  if (typeof preselect === 'string' && masterStore.getSeries(preselect)) {
    pickSeries(preselect)
  }

  const duration = computed(() => durationDays(startDate.value || null, endDate.value))

  const attributes = computed<Record<string, unknown> | null>(() => {
    const attrs: Record<string, unknown> = {}
    if (season.value) attrs.season = season.value
    if (transportMode.value) attrs.transport_mode = transportMode.value
    if (accommodation.value) attrs.accommodation = accommodation.value
    const tags = tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (tags.length > 0) attrs.tags = tags
    return Object.keys(attrs).length > 0 ? attrs : null
  })

  /**
   * What is set behind the fold, on the fold itself. An option nobody can
   * see is one nobody remembers setting — the same reason FR-25.11a keeps
   * the filter's chips on screen.
   */
  const optionalSummary = computed(() => {
    const parts: string[] = []
    if (startDate.value && endDate.value) {
      parts.push(formatDayRange(startDate.value, endDate.value))
    } else if (startDate.value || endDate.value) {
      parts.push(formatDay(startDate.value || endDate.value))
    }
    const series = masterStore.seriesList.find((s) => s.id === seriesChoice.value)
    if (series) parts.push(series.name)
    else if (seriesChoice.value === 'new' && newSeriesName.value.trim()) {
      parts.push(newSeriesName.value.trim())
    }
    // Through the catalogue, not raw: the summary is the only place these
    // values are read outside their own select, and "holiday_flat" is not
    // a word in either language.
    for (const attribute of [season.value, transportMode.value, accommodation.value]) {
      if (attribute) parts.push(attributeLabel(attribute))
    }
    return parts.join(' · ')
  })

  /**
   * FR-13.1: `trip_series.name` is UNIQUE instance-wide. The series the user is
   * describing is already in the select right above this field, so the step
   * points at it rather than inventing a second one — attaching the trip to it
   * silently would be a choice made on their behalf about whose series it is.
   */
  const seriesTaken = computed(() =>
    seriesChoice.value === 'new'
      ? (orchestrator.seriesNameCollision(newSeriesName.value) ?? null)
      : null,
  )

  return {
    name,
    yearChoices,
    year,
    moreOpen,
    startDate,
    endDate,
    onDates,
    season,
    transportMode,
    accommodation,
    tagsInput,
    seriesChoice,
    newSeriesName,
    pickSeries,
    duration,
    attributes,
    optionalSummary,
    seriesTaken,
  }
}
