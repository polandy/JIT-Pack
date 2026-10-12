<script setup lang="ts">
/**
 * M27 — a trip's excursions (FR-31), the fifth view a trip is worked in: a day
 * hike, a hut night, each with its own small list (ADR-077).
 *
 * Upcoming ones first by their first day, then the ones without a day yet,
 * then the past ones folded away. A row says when, who goes where not
 * everybody does, and how far its list is. The FAB opens the sheet that names
 * the excursion and the Gruppe it starts from; creating it opens its list,
 * with the one undo the act owes.
 */
import { IonContent, IonFab, IonFabButton, IonIcon, IonPage, IonItem, IonLabel } from '@ionic/vue'
import { addOutline, bicycleOutline, trainOutline, walkOutline } from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/global/EmptyState.vue'
import FoldToggle from '@/components/global/FoldToggle.vue'
import IdeaOrigin from '@/components/global/IdeaOrigin.vue'
import ListSection from '@/components/global/ListSection.vue'
import ExcursionSheet, { type ExcursionSheetResult } from './excursion/ExcursionSheet.vue'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { useIdeaSeed } from '@/composables/shared/useIdeaSeed'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useTripScreen } from '@/composables/shared/useTripScreen'
import { participantsOf, sumUnits } from '@/domain/excursionLines'
import { arrangeExcursions, spanOf } from '@/domain/excursionSchedule'
import { orderTracks } from '@/domain/shared/track'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { EXCURSION_JOURNEY_LINE } from '@/kernel/excursionConnections'
import { EXCURSION_EXTRA_LINES, extraLinesOf, withExtraUnits } from '@/kernel/excursionExtraLines'
import { excursionDays } from '@/lib/excursionText'
import { tracksSummary } from '@/lib/trackFormat'
import { presentToast } from '@/composables/shared/toast'
import { beforeIsOver, standingOf } from '@/domain/shared/tripPhase'
import type { IdeaSeed } from '@/domain/shared/ideaBridge'
import { ORIGIN_QUERY_PARAM, tripExcursionsPath } from '@/router/paths'
import { useTripStore } from '@/stores/tripStore'
import type { Excursion } from '@/types/domain'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const tripStore = useTripStore()
const router = useRouter()
const route = useRoute()

// ADR-033: excursions travel the trip partition; „none" is only true of a
// partition that has arrived.
const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)

const travelers = computed(() => tripStore.getTravelers(props.tripId))
const arranged = computed(() =>
  arrangeExcursions(tripStore.getExcursions(props.tripId), orchestrator.today()),
)
const empty = computed(
  () =>
    arranged.value.upcoming.length + arranged.value.undated.length + arranged.value.past.length ===
    0,
)
const pastOpen = ref(false)

const suitcaseOpen = computed(
  () => trip.value !== undefined && !beforeIsOver(standingOf(trip.value), orchestrator.today()),
)

/** The row's second line: who goes, where it is not everybody. */
function whoLine(excursion: Excursion): string | null {
  const rows = tripStore.getExcursionTravelers(props.tripId)
  if (!rows.some((r) => r.excursion_id === excursion.id)) return null
  return participantsOf(excursion.id, rows, travelers.value)
    .map((p) => p.name)
    .join(', ')
}

/** FR-31.15: its tracks in a line — the first one's distance and climb, and how many more. */
function trackLine(excursion: Excursion) {
  return tracksSummary(orderTracks(tripStore.getExcursionTracks(props.tripId, excursion.id)))
}

/** FR-29.18: its way there and back in a line, the planner's to say; absent where no planner is bound. */
const journeyLineOf = inject(EXCURSION_JOURNEY_LINE, null)
function journeyLine(excursion: Excursion): string | null {
  return journeyLineOf?.(props.tripId, excursion.id) ?? null
}

/** FR-33.6: another module's lines on an excursion's list count in its share. */
const extraSources = inject(EXCURSION_EXTRA_LINES, [])
function units(excursion: Excursion) {
  return withExtraUnits(
    sumUnits(tripStore.getExcursionItems(props.tripId, excursion.id)),
    extraLinesOf(extraSources, props.tripId, excursion.id),
  )
}

/** The days, or null for an undated one — its section already says so. */
function when(excursion: Excursion): string | null {
  return excursionDays(spanOf(excursion))
}

function open(excursion: Excursion) {
  void router.push(tripExcursionsPath(props.tripId, excursion.id))
}

// --- a new excursion ---

const creating = ref(false)
/** FR-29.13: the idea the sheet was opened from, while it is open. */
const fromIdea = ref<IdeaSeed | null>(null)
const seed = computed(() =>
  fromIdea.value ? { name: fromIdea.value.title, day: fromIdea.value.plannedOn } : null,
)

useIdeaSeed(
  props.tripId,
  () => loaded.value,
  (idea) => {
    fromIdea.value = idea
    creating.value = true
  },
)

function dismiss() {
  creating.value = false
  fromIdea.value = null
}

async function create(result: ExcursionSheetResult) {
  const ideaId = fromIdea.value?.id ?? null
  dismiss()
  const report = orchestrator.excursions.createExcursion(props.tripId, { ...result, ideaId })
  if (!report) return
  // Made from an idea, its list keeps the way back to the idea (FR-29.13).
  const origin = ideaId ? route.query[ORIGIN_QUERY_PARAM] : undefined
  await router.push({
    path: tripExcursionsPath(props.tripId, report.excursionId),
    query: typeof origin === 'string' ? { [ORIGIN_QUERY_PARAM]: origin } : {},
  })
  await presentToast({
    message:
      report.addedToSuitcase > 0
        ? t('excursions.createdAdded', { name: result.name, n: report.addedToSuitcase })
        : t('excursions.created', { name: result.name }),
    buttons: [
      {
        text: t('packing.undo'),
        handler: () => {
          report.undo()
          void router.replace(tripExcursionsPath(props.tripId))
        },
      },
    ],
  })
}

onMounted(ensure)

setHeaderTitle(
  () => t('excursions.title'),
  () => trip.value?.name,
)
</script>

<template>
  <IonPage>
    <IonContent class="excursions-content" data-testid="m27-page">
      <template v-if="loaded">
        <EmptyState v-if="empty" :title="t('excursions.empty')" testid="m27-empty" />

        <template v-for="section in ['upcoming', 'undated'] as const" :key="section">
          <ListSection
            v-if="arranged[section].length > 0"
            :title="t(section === 'upcoming' ? 'excursions.upcoming' : 'excursions.undated')"
            :testid="`m27-section-${section}`"
          >
            <IonItem
              v-for="excursion in arranged[section]"
              :key="excursion.id"
              button
              detail
              class="excursion"
              :data-testid="`m27-excursion-${excursion.name}`"
              @click="open(excursion)"
            >
              <IonLabel>
                <span
                  v-if="when(excursion)"
                  class="when jp-num"
                  :data-testid="`m27-when-${excursion.name}`"
                  >{{ when(excursion) }}</span
                >
                <span class="name">{{ excursion.name }}</span>
                <span v-if="whoLine(excursion)" class="who">{{ whoLine(excursion) }}</span>
                <IdeaOrigin
                  :trip-id="tripId"
                  :idea-id="excursion.idea_id"
                  :testid="`m27-idea-${excursion.name}`"
                />
                <span
                  v-if="trackLine(excursion)"
                  class="tracks jp-num"
                  :data-testid="`m27-tracks-${excursion.name}`"
                >
                  <IonIcon
                    :icon="trackLine(excursion)!.kind === 'bike' ? bicycleOutline : walkOutline"
                    aria-hidden="true"
                  />
                  {{ trackLine(excursion)!.text }}
                </span>
                <span
                  v-if="journeyLine(excursion)"
                  class="tracks jp-num"
                  :data-testid="`m27-journey-line-${excursion.name}`"
                >
                  <IonIcon :icon="trainOutline" aria-hidden="true" />
                  {{ journeyLine(excursion) }}
                </span>
              </IonLabel>
              <span slot="end" class="count jp-num" :data-testid="`m27-count-${excursion.name}`">
                {{ units(excursion).done }}/{{ units(excursion).total }}
              </span>
            </IonItem>
          </ListSection>
        </template>

        <template v-if="arranged.past.length > 0">
          <FoldToggle
            :open="pastOpen"
            :label="t('excursions.past', { n: arranged.past.length })"
            testid="m27-past-toggle"
            @toggle="pastOpen = !pastOpen"
          />
          <ListSection v-if="pastOpen" title="" headless testid="m27-section-past">
            <IonItem
              v-for="excursion in arranged.past"
              :key="excursion.id"
              button
              detail
              class="excursion past"
              :data-testid="`m27-excursion-${excursion.name}`"
              @click="open(excursion)"
            >
              <IonLabel>
                <span class="when jp-num">{{ when(excursion) }}</span>
                <span class="name">{{ excursion.name }}</span>
              </IonLabel>
            </IonItem>
          </ListSection>
        </template>
      </template>

      <IonFab :id="FAB_ANCHOR.m27" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton
          :aria-label="t('excursions.new')"
          data-testid="m27-fab"
          @click="creating = true"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <ExcursionSheet
        :is-open="creating"
        :travelers="travelers"
        :suitcase-open="suitcaseOpen"
        :trip-start="trip?.start_date"
        :trip-end="trip?.end_date"
        :seed="seed"
        @dismiss="dismiss"
        @save="create"
      />
    </IonContent>
  </IonPage>
</template>

<style scoped>
.excursions-content {
  --padding-top: 10px;
  /* Room for the FAB over the last row. */
  --padding-bottom: 88px;
}

.excursion ion-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.when {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.name {
  font-weight: var(--jp-weight-semibold);
}

.who {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.tracks {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.tracks ion-icon {
  color: var(--ct-larch);
  font-size: var(--jp-icon-xs);
}

.count {
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.past {
  opacity: 0.75;
}
</style>
