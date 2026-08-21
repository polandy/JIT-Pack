<script setup lang="ts">
/**
 * M22 — Trip properties (FR-2.7).
 *
 * A trip's name, dates and travellers were decided in M3 and frozen there.
 * This is where they stop being frozen. It is deliberately *not* the sharing
 * screen: roles and members are FR-4.5's roster and stay Server-Mode-only
 * (G-8), while travellers are trip records that exist in every mode (FR-19.3).
 *
 * A screen rather than a sheet (owner, 2026-08-21): the roster is a list with
 * its own add and remove affordances, and the M5 grammar would nest a list
 * inside an overlay over a list.
 *
 * The consequences of a traveller change are FR-27.4's rule, applied
 * immediately (2026-08-21 amendment) by the orchestrator — this screen's job
 * is to *say* what happened, because a row that stays behind after its person
 * left is exactly the thing a user finds later and does not understand.
 */
import {
  IonPage,
  IonContent,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  alertController,
  toastController,
} from '@ionic/vue'
import { addOutline, closeOutline } from 'ionicons/icons'
import { computed, inject, ref, watch } from 'vue'

import { t } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { TRIP_STATUS_ARCHIVED, TRIP_STATUS_PLANNING } from '@/types/domain'
import type { TravelerChangeReport } from '@/types/domain'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const trip = computed(() => store.getTrip(props.tripId))
const travelers = computed(() => store.getTravelers(props.tripId))

/**
 * An archived trip is read-only here for the same reason FR-27.4 never touches
 * a past trip: it is a record of what happened, not a plan any more.
 */
const readOnly = computed(() => trip.value?.status === TRIP_STATUS_ARCHIVED)
/** FR-2.7: removal is offered only before departure. */
const canRemove = computed(() => trip.value?.status === TRIP_STATUS_PLANNING)

const name = ref('')
const startDate = ref('')
const endDate = ref('')
const newTraveler = ref('')

/*
 * The form mirrors the trip until the user types. Watching the *loaded* trip
 * rather than initialising once matters in Local Mode: the page can render
 * before its partition has arrived, and a form seeded from `undefined` would
 * then save an empty name over a real one.
 */
watch(
  trip,
  (value) => {
    if (!value) return
    if (document.activeElement?.tagName === 'INPUT') return
    name.value = value.name
    startDate.value = value.start_date ?? ''
    endDate.value = value.end_date ?? ''
  },
  { immediate: true },
)

async function say(message: string): Promise<void> {
  const el = await toastController.create({ message, duration: 3000, position: 'bottom' })
  await el.present()
}

/** Commits on blur/Enter, the M8 pattern — no save button to forget. */
function commitName(): void {
  const value = name.value.trim()
  if (!value || value === trip.value?.name) return
  orchestrator.updateTrip(props.tripId, { name: value })
}

/*
 * A handler rather than two statements inline: Vue parses an inline handler as
 * a single expression, and a two-line one compiles under vue-tsc and eslint
 * alike while failing at runtime — found by rendering, not by a check.
 */
function onStartDate(value: string): void {
  startDate.value = value
  commitDates()
}

function onEndDate(value: string): void {
  endDate.value = value
  commitDates()
}

function commitDates(): void {
  const start = startDate.value || null
  const end = endDate.value || null
  if (start === (trip.value?.start_date ?? null) && end === (trip.value?.end_date ?? null)) return
  orchestrator.updateTrip(props.tripId, { start_date: start, end_date: end })
}

/**
 * reportTravelerChange turns the FR-27.4 outcome into one sentence. Three
 * numbers, and each is said only when it is not zero: a report that always
 * reads "0 hinzugefügt, 0 entfernt" trains the user to stop reading it.
 */
async function reportTravelerChange(
  report: TravelerChangeReport | null,
  fallback: string,
): Promise<void> {
  if (!report) return
  const parts: string[] = []
  if (report.added > 0) parts.push(t('tripEdit.reportAdded', { n: report.added }))
  if (report.removed > 0) parts.push(t('tripEdit.reportRemoved', { n: report.removed }))
  if (report.kept > 0) parts.push(t('tripEdit.reportKept', { n: report.kept }))
  await say(parts.length > 0 ? parts.join(' · ') : fallback)
}

async function addTraveler(): Promise<void> {
  const value = newTraveler.value.trim()
  if (!value) return
  newTraveler.value = ''
  const report = orchestrator.addTravelerToTrip(props.tripId, value)
  await reportTravelerChange(report, t('tripEdit.reportNothing'))
}

function renameTraveler(travelerId: string, value: string): void {
  const next = value.trim()
  const current = travelers.value.find((tr) => tr.id === travelerId)
  if (!next || !current || next === current.name) return
  orchestrator.renameTraveler(props.tripId, travelerId, next)
}

/**
 * Removal confirms first and names the person, because what it takes with
 * them is not visible from this screen — their untouched rows are on M4.
 */
async function removeTraveler(travelerId: string, travelerName: string): Promise<void> {
  const alert = await alertController.create({
    header: t('tripEdit.removeConfirmTitle', { name: travelerName }),
    message: t('tripEdit.removeConfirmBody'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('tripEdit.removeConfirm'), role: 'destructive' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role === 'cancel' || role === 'backdrop') return

  const report = orchestrator.removeTraveler(props.tripId, travelerId)
  await reportTravelerChange(report, t('tripEdit.reportNothing'))
}
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <section class="jp-card block">
        <h2 class="jp-eyebrow">{{ t('tripEdit.sectionTrip') }}</h2>
        <IonList lines="none">
          <IonItem>
            <IonInput
              :label="t('tripEdit.name')"
              label-placement="stacked"
              :value="name"
              :readonly="readOnly"
              data-testid="trip-edit-name"
              @ionInput="name = String($event.detail.value ?? '')"
              @ionBlur="commitName"
              @keyup.enter="commitName"
            />
          </IonItem>
          <IonItem>
            <IonInput
              type="date"
              :label="t('tripEdit.startDate')"
              label-placement="stacked"
              :value="startDate"
              :readonly="readOnly"
              data-testid="trip-edit-start"
              @ionChange="onStartDate(String($event.detail.value ?? ''))"
            />
          </IonItem>
          <IonItem>
            <IonInput
              type="date"
              :label="t('tripEdit.endDate')"
              label-placement="stacked"
              :value="endDate"
              :readonly="readOnly"
              data-testid="trip-edit-end"
              @ionChange="onEndDate(String($event.detail.value ?? ''))"
            />
          </IonItem>
        </IonList>
      </section>

      <section class="jp-card block">
        <h2 class="jp-eyebrow">{{ t('tripEdit.sectionTravelers') }}</h2>

        <IonList lines="none">
          <IonItem v-for="traveler in travelers" :key="traveler.id">
            <IonInput
              :aria-label="t('tripEdit.travelerName')"
              :value="traveler.name"
              :readonly="readOnly"
              :data-testid="`traveler-name-${traveler.id}`"
              @ionBlur="renameTraveler(traveler.id, String($event.target.value ?? ''))"
            />
            <IonButton
              v-if="!readOnly"
              slot="end"
              fill="clear"
              :disabled="!canRemove"
              :aria-label="t('tripEdit.removeTraveler', { name: traveler.name })"
              :title="canRemove ? undefined : t('tripEdit.removeAfterStart')"
              :data-testid="`traveler-remove-${traveler.id}`"
              @click="removeTraveler(traveler.id, traveler.name)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>

        <!--
          The reason removal is gone is stated once, under the list, rather
          than repeated on every disabled button: it is a fact about the trip,
          not about a person.
        -->
        <p v-if="!canRemove && !readOnly" class="note" data-testid="traveler-remove-note">
          {{ t('tripEdit.removeAfterStart') }}
        </p>

        <!--
          The add field is an IonItem like the rows above it, not a bare input
          in a flex row: without an item's own surface it rendered as a label
          over nothing, with no visible box to type into. Found by rendering.
        -->
        <IonItem v-if="!readOnly" lines="none" class="add-row">
          <IonInput
            :aria-label="t('tripEdit.addTraveler')"
            fill="outline"
            :value="newTraveler"
            :placeholder="t('tripEdit.addTraveler')"
            data-testid="traveler-add-input"
            @ionInput="newTraveler = String($event.detail.value ?? '')"
            @keyup.enter="addTraveler"
          />
          <IonButton
            slot="end"
            :disabled="newTraveler.trim().length === 0"
            data-testid="traveler-add"
            @click="addTraveler"
          >
            <IonIcon slot="start" :icon="addOutline" />
            {{ t('tripEdit.add') }}
          </IonButton>
        </IonItem>

        <p class="note">{{ t('tripEdit.travelerNote') }}</p>
      </section>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.block {
  margin-bottom: 12px;
  padding: 12px;
}

.add-row {
  --padding-start: 0;
  margin-top: 8px;
}

.note {
  color: var(--ct-subtext0);
  margin: 8px 0 0;
}
</style>
