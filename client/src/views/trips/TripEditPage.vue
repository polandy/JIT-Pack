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
  IonSelect,
  IonSelectOption,
  alertController,
} from '@ionic/vue'
import { addOutline, closeOutline } from 'ionicons/icons'
import { computed, inject, ref, watch } from 'vue'

import DateField from '@/components/global/DateField.vue'
import { tripYearChoices } from '@/domain/tripYears'
import { t } from '@/i18n'
import { presentToast } from '@/lib/toast'
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
/**
 * FR-2.1b: the trip's year, editable here since 2026-08-31.
 *
 * `TripEdit`'s only writers were M3's wizard and the clone form, both at
 * creation, so a typo on the one temporal fact a trip is required to have was
 * permanent — and it is the fact M2 sorts and groups by. The picker offers
 * the same years those two do, from the one rule they all read.
 */
const thisYear = new Date().getFullYear()
const yearChoices = computed(() => {
  const current = trip.value?.year
  const offered = tripYearChoices(thisYear)
  // A trip already outside the window keeps its own year on the list, or the
  // picker would silently offer to move it. An imported 2014 trip is the
  // ordinary case here, not a curiosity.
  if (current == null || offered.includes(current)) return offered
  return [...offered, current].sort((a, b) => a - b)
})
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
  await presentToast({ message, duration: 3000 })
}

/** Commits on blur/Enter, the M8 pattern — no save button to forget. */
/**
 * The year commits on change, like the dates: this screen has no save button
 * (the M8 pattern), and a select has no blur to commit on.
 */
function onYear(value: number): void {
  if (!Number.isFinite(value) || value === trip.value?.year) return
  orchestrator.updateTrip(props.tripId, { year: value })
}

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
 * reads "0 added, 0 removed" trains the user to stop reading it.
 *
 * `kept` deliberately says only *that* rows stayed, not why. FR-27.4 protects
 * a row that was packed, skipped **or** hand-edited, and the confirmation the
 * user just answered already explains the packed case; naming one of the three
 * here would be wrong for the other two.
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
  const packed = orchestrator.packedRowsOf(props.tripId, travelerId)

  /*
   * The choice is offered only when there is something to choose about
   * (FR-2.7). With nothing packed the removal has one outcome, and a question
   * with one answer teaches the user to dismiss questions.
   */
  const buttons = packed
    ? [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('tripEdit.removeKeepPacked'), role: 'keep' },
        { text: t('tripEdit.removeAll'), role: 'destructive' },
      ]
    : [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('tripEdit.removeConfirm'), role: 'destructive' },
      ]

  const alert = await alertController.create({
    header: t('tripEdit.removeConfirmTitle', { name: travelerName }),
    message: packed
      ? t('tripEdit.removeConfirmPacked', { n: packed })
      : t('tripEdit.removeConfirmBody'),
    buttons,
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive' && role !== 'keep') return

  const report = orchestrator.removeTraveler(props.tripId, travelerId, {
    includePacked: role === 'destructive' && packed > 0,
  })
  await reportTravelerChange(report, t('tripEdit.reportNothing'))
}
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <!--
        Above both cards, because it is about the screen and not about one of
        them: an archived trip loses the ✕, the add row and the started-trip
        note together, so without this it answers no tap and says nothing —
        the shape the owner ruled against on 2026-08-21 for the started trip,
        reached here by a different route (owner decision 2026-08-31). Its own
        sentence, not that one's: the reason is that the trip is over, and
        borrowing the other wording would claim it has not left yet.
        Rendering it inside the travellers card read as a rule about people.
      -->
      <p v-if="readOnly" class="note page-note" data-testid="trip-edit-archived-note">
        {{ t('tripEdit.archivedNote') }}
      </p>

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
            <IonSelect
              data-testid="trip-edit-year"
              :label="t('tripEdit.year')"
              label-placement="stacked"
              interface="popover"
              :disabled="readOnly"
              :value="trip?.year"
              @ionChange="(e: CustomEvent) => onYear(Number(e.detail.value))"
            >
              <IonSelectOption v-for="option in yearChoices" :key="option" :value="option">
                {{ option }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <DateField
              testid="trip-edit-start"
              :max="endDate"
              :label="t('tripEdit.startDate')"
              :value="startDate"
              :readonly="readOnly"
              @update="onStartDate($event)"
            />
          </IonItem>
          <IonItem>
            <DateField
              testid="trip-edit-end"
              :min="startDate"
              :label="t('tripEdit.endDate')"
              :value="endDate"
              :readonly="readOnly"
              @update="onEndDate($event)"
            />
          </IonItem>
        </IonList>
      </section>

      <section class="jp-card block">
        <h2 class="jp-eyebrow">{{ t('tripEdit.sectionTravelers') }}</h2>

        <IonList lines="none">
          <!--
            Keyed by name, like M4's per-person child rows: the id is a random
            uuid, so a test can only address a person by the one thing the user
            can see.
          -->
          <IonItem
            v-for="traveler in travelers"
            :key="traveler.id"
            :data-testid="`traveler-row-${traveler.name}`"
          >
            <IonInput
              :aria-label="t('tripEdit.travelerName')"
              :value="traveler.name"
              :readonly="readOnly"
              :data-testid="`traveler-name-${traveler.id}`"
              @ionBlur="renameTraveler(traveler.id, String($event.target.value ?? ''))"
            />
            <!--
              Absent rather than disabled once the trip has started (owner,
              2026-08-21). The first version rendered it refusing every tap, on
              the reasoning that a vanished control gets hunted for; in the hand
              it reads as a broken app instead, and the note under the list
              already answers the question the ✕ would have raised.
            -->
            <IonButton
              v-if="!readOnly && canRemove"
              slot="end"
              fill="clear"
              :aria-label="t('tripEdit.removeTraveler', { name: traveler.name })"
              :data-testid="`traveler-remove-${traveler.id}`"
              @click="removeTraveler(traveler.id, traveler.name)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>

        <!--
          The reason removal is gone is stated once, under the list: it is a
          fact about the trip, not about a person — and with the ✕ absent it is
          the only thing that answers "why can I not take her off".
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

        <!-- What joining and leaving does — a rule that no longer applies once
             the trip is over, so it goes with the controls it explains. -->
        <p v-if="!readOnly" class="note">{{ t('tripEdit.travelerNote') }}</p>
      </section>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-note {
  margin-inline: var(--jp-space-4, 16px);
}

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
