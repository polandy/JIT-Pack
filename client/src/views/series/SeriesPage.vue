<script setup lang="ts">
/**
 * M16 — Series & Destination Profile (FR-13.1/13.2/13.3).
 *
 * Recurring-trip context: series name and default attribute chips
 * (seed M3 prefills, FR-15.1), destination notes, the reusable
 * destination checklist (offered on new trips in the series), the
 * series' trip history with per-trip stats, and attach/detach.
 */
import {
  IonPage,
  IonContent,
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonNote,
} from '@ionic/vue'
import { addOutline, closeOutline, copyOutline, trendingUpOutline } from 'ionicons/icons'
import { computed, onMounted, ref } from 'vue'

import { t } from '@/i18n'
import { formatTripPeriod } from '@/lib/format'
import { modeLabel } from '@/lib/modeLabels'
import { seriesLeadChipName, seriesLeadLineText } from '@/lib/seriesTaskText'
import { shortDueDay } from '@/lib/taskDueText'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { DestinationTask, ItemMode, Trip } from '@/types/domain'
import { TRIP_STATUS_ARCHIVED } from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK } from '@/types/domain'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { tripOrderKey } from '@/domain/trips'
import { tripMemberProfiles } from '@/domain/members'
import {
  SERIES_TASK_LEADS,
  seriesTaskDue,
  type SeriesTaskDraft,
  type SeriesTaskMaterialization,
} from '@/domain/shared/seriesTask'
import { presentToast } from '@/composables/shared/toast'
import { PATH, tripOpenPath, tripSubPath } from '@/router/paths'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useIdentity } from '@/composables/shared/useTripIdentity'
import AssigneeSeat from '@/components/global/AssigneeSeat.vue'
import ChipRow from '@/components/global/ChipRow.vue'
import ChoiceChip from '@/components/global/ChoiceChip.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import SeriesTaskOfferSheet from '@/views/trips/SeriesTaskOfferSheet.vue'

const props = defineProps<{ seriesId: string }>()

const master = useMasterStore()
const tripStore = useTripStore()
const orchestrator = useOrchestrator()
const { directory, load: loadIdentity } = useIdentity(orchestrator.identity)
onMounted(loadIdentity)

const series = computed(() => master.getSeries(props.seriesId))
const profile = computed(() => master.getDestinationProfile(props.seriesId))
const checklist = computed(() => (profile.value ? master.getChecklistItems(profile.value.id) : []))

// --- Series name & default attributes (FR-15.1) ---

/**
 * FR-13.1: `trip_series.name` is UNIQUE instance-wide, so a rename onto a
 * taken name is refused here rather than by a push. The field goes back to
 * what the series is still called — a refused spelling left in it reads as
 * saved (G-5's auto-save has no other acknowledgement).
 */
async function saveName(field: HTMLIonInputElement) {
  const name = String(field.value ?? '').trim()
  const current = series.value
  if (!current || !name || name === current.name) return
  const taken = orchestrator.names.seriesNameCollision(name, current.id)
  if (taken) {
    field.value = current.name
    await presentToast({ message: t('series.nameTaken', { name: taken.name }) })
    return
  }
  orchestrator.series.updateSeries(current, { name })
}

function attribute(key: string): string {
  return (series.value?.default_attributes?.[key] as string) ?? ''
}

function saveAttribute(key: string, value: string) {
  if (!series.value) return
  const attrs = { ...series.value.default_attributes }
  if (value) attrs[key] = value
  else delete attrs[key]
  orchestrator.series.updateSeries(series.value, {
    default_attributes: Object.keys(attrs).length > 0 ? attrs : null,
  })
}

// --- Destination profile (FR-13.2) ---

function saveNotes(notes: string) {
  const profileId = orchestrator.series.ensureDestinationProfile(props.seriesId)
  const current = master.getDestinationProfile(props.seriesId)
  if (!current || current.id !== profileId) return
  orchestrator.series.updateDestinationProfile(current, { notes: notes || null })
}

// --- Destination checklist (FR-13.3) ---

/** FR-13.3: a destination checklist is mostly bought there, so that mode leads. */
const CHECKLIST_MODE_ORDER = [
  ITEM_MODE_BUY_LOCAL,
  ITEM_MODE_BUY_BEFORE,
  ITEM_MODE_PACK,
] as const satisfies readonly ItemMode[]

const newLabel = ref('')
const newMode = ref<ItemMode>(ITEM_MODE_BUY_LOCAL)

function addChecklistEntry() {
  const label = newLabel.value.trim()
  if (!label) return
  const profileId = orchestrator.series.ensureDestinationProfile(props.seriesId)
  orchestrator.series.addChecklistItem(profileId, label, newMode.value)
  newLabel.value = ''
}

// --- Trip history & attach/detach (FR-13.1) ---

const seriesTrips = computed(() =>
  tripStore.tripList
    .filter((t) => t.series_id === props.seriesId)
    .sort((a, b) => tripOrderKey(b).localeCompare(tripOrderKey(a))),
)

const attachableTrips = computed(() => tripStore.tripList.filter((t) => !t.series_id))

function tripStats(trip: Trip): string {
  const k = tripStore.kpis(trip.id)
  return t('trips.itemSummary', { packed: k.packedItems, total: k.totalItems })
}

/** The temporal line of a history row (FR-2.1b, UX-5). */
const tripWhen = formatTripPeriod

/** Trend shortcut (M12): analytics of the series' most recent trip. */
const trendTripId = computed(() => seriesTrips.value[0]?.id ?? null)

/** FR-12.1: the series' most recent archived trip is the default clone source. */
const cloneSource = computed(
  () => seriesTrips.value.find((t) => t.status === TRIP_STATUS_ARCHIVED) ?? null,
)

// --- Series tasks (FR-13.4, ADR-106) ---

const seriesTasks = computed(() =>
  profile.value ? master.getDestinationTasks(profile.value.id) : [],
)

/** The series' soonest trip still ahead of today — the task sheet's preview is read against it. */
const nextTrip = computed(() => {
  const today = orchestrator.today()
  return (
    seriesTrips.value
      .filter(
        (trip) =>
          trip.status !== TRIP_STATUS_ARCHIVED && trip.start_date && trip.start_date >= today,
      )
      .sort((a, b) => (a.start_date as string).localeCompare(b.start_date as string))[0] ?? null
  )
})

/** The row's assignee seat, G-8-hidden with the rest while the directory is empty. */
function seatOf(task: DestinationTask) {
  if (directory.value.length === 0 || !task.assignee_user_id) return null
  const person = directory.value.find((u) => u.user_id === task.assignee_user_id)
  return person
    ? { variant: 'assignee' as const, id: person.user_id, name: person.display_name }
    : null
}

const LEAD_OPTIONS = [null, ...SERIES_TASK_LEADS] as const satisfies readonly (number | null)[]

const taskSheetOpen = ref(false)
const editingTaskId = ref<string | null>(null)
/**
 * The sheet's shape is fixed by what it was opened for, not by whether the
 * text has been written yet: the sheet is auto-height, and a remove button
 * appearing on the field's blur would lift the chips out from under the very
 * press that blurred it.
 */
const openedForEdit = ref(false)
const draftText = ref('')
const draftLead = ref<number | null>(null)
const draftAssignee = ref<string | null>(null)

function openNewTask() {
  editingTaskId.value = null
  openedForEdit.value = false
  draftText.value = ''
  draftLead.value = null
  draftAssignee.value = null
  taskSheetOpen.value = true
}

function openEditTask(task: DestinationTask) {
  editingTaskId.value = task.id
  openedForEdit.value = true
  draftText.value = task.task
  draftLead.value = task.lead_days
  draftAssignee.value = task.assignee_user_id
  taskSheetOpen.value = true
}

function closeTaskSheet() {
  taskSheetOpen.value = false
}

/** The text field writes a brand-new task into being, or renames the one already there. */
function commitTaskText() {
  const text = draftText.value.trim()
  if (editingTaskId.value) {
    const current = master.getDestinationTask(editingTaskId.value)
    if (!current) return
    if (text && text !== current.task)
      orchestrator.series.updateDestinationTask(current, { task: text })
    else draftText.value = current.task
    return
  }
  if (!text) return
  editingTaskId.value = orchestrator.series.addDestinationTask(
    props.seriesId,
    text,
    draftLead.value,
    draftAssignee.value,
  )
}

/** A chip writes immediately once the task exists; before that it is only the next write's value. */
function pickLead(lead: number | null) {
  draftLead.value = lead
  if (!editingTaskId.value) return
  const current = master.getDestinationTask(editingTaskId.value)
  if (current) orchestrator.series.updateDestinationTask(current, { lead_days: lead })
}

function pickAssignee(userId: string | null) {
  draftAssignee.value = userId
  if (!editingTaskId.value) return
  const current = master.getDestinationTask(editingTaskId.value)
  if (current) orchestrator.series.updateDestinationTask(current, { assignee_user_id: userId })
}

function removeTask() {
  if (editingTaskId.value) orchestrator.series.deleteDestinationTask(editingTaskId.value)
  taskSheetOpen.value = false
}

/** The sheet's line naming the day the chip in hand would give the series' next trip. */
const nextTripDayText = computed(() => {
  if (draftLead.value === null) return t('tasks.seriesLeadNone')
  const trip = nextTrip.value
  const due = trip ? seriesTaskDue(draftLead.value, trip.start_date) : null
  if (!trip || !due) return t('series.taskNoNextTrip')
  return t('series.taskNextTripDay', { day: shortDueDay(due), trip: trip.name })
})

// --- M16's attach raises M22's own offer sheet alike (FR-13.4, ADR-106) ---

const seriesOffer = ref<SeriesTaskMaterialization | null>(null)
const seriesOfferOpen = ref(false)
const seriesOfferTripId = ref<string | null>(null)

function attachTrip(tripId: string) {
  orchestrator.series.setTripSeries(tripId, props.seriesId)
  seriesOfferTripId.value = tripId
  seriesOffer.value = orchestrator.series.offerSeriesTasks(tripId)
  seriesOfferOpen.value = seriesOffer.value !== null
}

/** Who the offer sheet's seats may show — the picked trip's own members (G-8). */
const offerAssignees = computed(() => {
  const tripId = seriesOfferTripId.value
  if (!tripId) return []
  const members = tripStore.getMembers(tripId)
  const memberIds = new Set(members.map((member) => member.user_id))
  return tripMemberProfiles(directory.value, members).filter((person) =>
    memberIds.has(person.user_id),
  )
})

const offerTripStartDate = computed(() =>
  seriesOfferTripId.value ? (tripStore.getTrip(seriesOfferTripId.value)?.start_date ?? null) : null,
)

async function applySeriesOffer(drafts: SeriesTaskDraft[]) {
  seriesOfferOpen.value = false
  const tripId = seriesOfferTripId.value
  if (drafts.length === 0 || !tripId) return
  orchestrator.series.applySeriesTaskOffer(tripId, drafts)
  await presentToast({ message: t('tasks.offerAppliedToast', { n: drafts.length }) })
}

// ADR-050: the frame renders this page head, above the outlet.
setHeaderTitle(() => series.value?.name ?? t('series.section'))
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <template v-if="series">
        <SectionHead :title="t('series.section')" />
        <IonList>
          <IonItem>
            <IonInput
              data-testid="m16-name"
              :label="t('series.name')"
              label-placement="stacked"
              :value="series.name"
              @ionChange="(e: CustomEvent) => saveName(e.target as HTMLIonInputElement)"
            />
          </IonItem>
          <IonItem>
            <IonSelect
              data-testid="m16-season"
              :label="t('wizard.season')"
              interface="popover"
              :value="attribute('season')"
              @ionChange="(e: CustomEvent) => saveAttribute('season', e.detail.value)"
            >
              <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
              <IonSelectOption value="summer">{{ t('season.summer') }}</IonSelectOption>
              <IonSelectOption value="winter">{{ t('season.winter') }}</IonSelectOption>
              <IonSelectOption value="transitional">
                {{ t('season.transitional') }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect
              data-testid="m16-transport"
              :label="t('wizard.transport')"
              interface="popover"
              :value="attribute('transport_mode')"
              @ionChange="(e: CustomEvent) => saveAttribute('transport_mode', e.detail.value)"
            >
              <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
              <IonSelectOption value="car">{{ t('transport.car') }}</IonSelectOption>
              <IonSelectOption value="bike">{{ t('transport.bike') }}</IonSelectOption>
              <IonSelectOption value="plane">{{ t('transport.plane') }}</IonSelectOption>
              <IonSelectOption value="train">{{ t('transport.train') }}</IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect
              :label="t('wizard.accommodation')"
              interface="popover"
              :value="attribute('accommodation')"
              @ionChange="(e: CustomEvent) => saveAttribute('accommodation', e.detail.value)"
            >
              <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
              <IonSelectOption value="hotel">{{ t('accommodation.hotel') }}</IonSelectOption>
              <IonSelectOption value="holiday_flat">
                {{ t('accommodation.holiday_flat') }}
              </IonSelectOption>
              <IonSelectOption value="camping">{{ t('accommodation.camping') }}</IonSelectOption>
            </IonSelect>
          </IonItem>
        </IonList>
        <IonNote>{{ t('series.defaultsNote') }}</IonNote>

        <SectionHead :title="t('series.sectionNotes')" />
        <IonList>
          <IonItem>
            <IonTextarea
              data-testid="m16-notes"
              :placeholder="t('series.notesPlaceholder')"
              :value="profile?.notes ?? ''"
              auto-grow
              @ionChange="(e: CustomEvent) => saveNotes(e.detail.value ?? '')"
            />
          </IonItem>
        </IonList>

        <SectionHead :title="t('wizard.sectionChecklist')" />
        <IonList v-if="checklist.length > 0">
          <IonItem v-for="entry in checklist" :key="entry.id" data-testid="m16-checklist-row">
            <IonLabel>
              <h3>{{ entry.label }}</h3>
              <p>
                {{ modeLabel(entry.mode) }}
              </p>
            </IonLabel>
            <IonButton
              slot="end"
              fill="clear"
              color="medium"
              data-testid="m16-checklist-remove"
              :aria-label="t('series.checklistRemove')"
              @click="orchestrator.series.deleteChecklistItem(entry.id)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>
        <IonNote v-else data-testid="m16-checklist-empty">{{ t('series.checklistEmpty') }}</IonNote>
        <div class="add-row">
          <IonInput
            class="add-input"
            data-testid="m16-checklist-input"
            :placeholder="t('series.checklistAdd')"
            :value="newLabel"
            @ionInput="(e: CustomEvent) => (newLabel = e.detail.value ?? '')"
            @keyup.enter="addChecklistEntry"
          />
          <IonSelect
            interface="popover"
            data-testid="m16-checklist-mode"
            :value="newMode"
            :aria-label="t('series.checklistMode')"
            @ionChange="(e: CustomEvent) => (newMode = e.detail.value)"
          >
            <IonSelectOption v-for="m in CHECKLIST_MODE_ORDER" :key="m" :value="m">
              {{ modeLabel(m) }}
            </IonSelectOption>
          </IonSelect>
          <IonButton
            fill="outline"
            size="small"
            data-testid="m16-checklist-add"
            :aria-label="t('common.add')"
            @click="addChecklistEntry"
          >
            <IonIcon slot="icon-only" :icon="addOutline" />
          </IonButton>
        </div>

        <SectionHead :title="t('series.sectionTasks')" />
        <IonList v-if="seriesTasks.length > 0">
          <IonItem
            v-for="task in seriesTasks"
            :key="task.id"
            button
            data-testid="m16-task-row"
            @click="openEditTask(task)"
          >
            <IonLabel>
              <h3>{{ task.task }}</h3>
              <p data-testid="m16-task-lead">{{ seriesLeadLineText(task.lead_days) }}</p>
            </IonLabel>
            <span v-if="directory.length > 0" slot="end" data-testid="m16-task-seat">
              <AssigneeSeat :avatar="seatOf(task)" @assign="openEditTask(task)" />
            </span>
          </IonItem>
        </IonList>
        <div class="add-row">
          <IonButton fill="outline" size="small" data-testid="m16-task-add" @click="openNewTask">
            <IonIcon slot="start" :icon="addOutline" />
            {{ t('series.taskAdd') }}
          </IonButton>
        </div>
        <IonNote>{{ t('series.taskQuietNote') }}</IonNote>

        <SectionHead :title="t('series.sectionTrips')" />
        <IonList v-if="seriesTrips.length > 0">
          <IonItem
            v-for="trip in seriesTrips"
            :key="trip.id"
            button
            :data-testid="`m16-trip-${trip.name}`"
            :router-link="tripOpenPath(trip.id)"
          >
            <IonLabel>
              <h3>{{ trip.name }}</h3>
              <p>{{ tripWhen(trip) }} · {{ tripStats(trip) }}</p>
            </IonLabel>
            <IonButton
              slot="end"
              fill="clear"
              color="medium"
              :data-testid="`m16-detach-${trip.name}`"
              :aria-label="t('series.detach')"
              @click.stop.prevent="orchestrator.series.setTripSeries(trip.id, null)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>
        <IonNote v-else>{{ t('series.noTrips') }}</IonNote>

        <IonList v-if="attachableTrips.length > 0">
          <IonItem>
            <IonSelect
              data-testid="m16-attach"
              :label="t('series.attach')"
              interface="popover"
              :value="''"
              @ionChange="(e: CustomEvent) => e.detail.value && attachTrip(e.detail.value)"
            >
              <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
              <IonSelectOption v-for="trip in attachableTrips" :key="trip.id" :value="trip.id">
                {{ trip.name }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>
        </IonList>

        <div class="actions">
          <IonButton
            v-if="cloneSource"
            expand="block"
            :router-link="tripSubPath(cloneSource.id, 'clone')"
          >
            <IonIcon slot="start" :icon="copyOutline" />
            {{ t('series.clone', { name: cloneSource.name }) }}
          </IonButton>
          <IonButton
            expand="block"
            :fill="cloneSource ? 'outline' : 'solid'"
            data-testid="m16-new-trip"
            :router-link="`${PATH.newTrip}?series=${seriesId}`"
          >
            {{ t('series.newTrip') }}
          </IonButton>
          <IonButton
            v-if="trendTripId"
            expand="block"
            fill="outline"
            data-testid="m16-trends"
            :router-link="tripSubPath(trendTripId, 'analytics')"
          >
            <IonIcon slot="start" :icon="trendingUpOutline" />
            {{ t('series.trends') }}
          </IonButton>
        </div>
      </template>
      <IonNote v-else>{{ t('series.notFound') }}</IonNote>
    </IonContent>

    <SheetModal :is-open="taskSheetOpen" testid="m16-task-sheet" @dismiss="closeTaskSheet">
      <div class="sheet">
        <SheetHead
          :title="t(openedForEdit ? 'series.taskSheetEdit' : 'series.taskSheetNew')"
          close-testid="m16-task-sheet-close"
          @close="closeTaskSheet"
        />
        <IonItem>
          <IonInput
            data-testid="m16-task-sheet-text"
            :label="t('series.taskText')"
            label-placement="stacked"
            :placeholder="t('series.taskTextPlaceholder')"
            :value="draftText"
            @ionInput="(e: CustomEvent) => (draftText = e.detail.value ?? '')"
            @ionBlur="commitTaskText"
            @keyup.enter="commitTaskText"
          />
        </IonItem>

        <ChipRow :label="t('tasks.dueField')" class="lead-chips">
          <ChoiceChip
            v-for="lead in LEAD_OPTIONS"
            :key="lead ?? 'none'"
            :pressed="draftLead === lead"
            :data-testid="`m16-task-sheet-lead-${lead ?? 'none'}`"
            @click="pickLead(lead)"
          >
            {{ seriesLeadChipName(lead) }}
          </ChoiceChip>
        </ChipRow>

        <p class="next-day" data-testid="m16-task-sheet-next-day">{{ nextTripDayText }}</p>

        <IonItem v-if="directory.length > 0">
          <IonSelect
            data-testid="m16-task-sheet-who"
            :label="t('series.taskWho')"
            interface="popover"
            :value="draftAssignee ?? ''"
            @ionChange="(e: CustomEvent) => pickAssignee(e.detail.value || null)"
          >
            <IonSelectOption value="">{{ t('series.taskWhoNobody') }}</IonSelectOption>
            <IonSelectOption v-for="user in directory" :key="user.user_id" :value="user.user_id">
              {{ user.display_name }}
            </IonSelectOption>
          </IonSelect>
        </IonItem>

        <IonButton
          v-if="openedForEdit"
          class="remove"
          expand="block"
          fill="clear"
          data-testid="m16-task-sheet-remove"
          @click="removeTask"
        >
          <IonIcon slot="start" :icon="closeOutline" />
          {{ t('tripTasks.remove') }}
        </IonButton>
      </div>
    </SheetModal>

    <SeriesTaskOfferSheet
      :is-open="seriesOfferOpen"
      :offer="seriesOffer"
      :trip-start-date="offerTripStartDate"
      :today="orchestrator.today()"
      :assignees="offerAssignees"
      @dismiss="seriesOfferOpen = false"
      @apply="applySeriesOffer"
    />
  </IonPage>
</template>

<style scoped>
.sheet {
  padding: 4px 0 12px;
}

.lead-chips {
  margin-top: 16px;
}

.next-day {
  margin: 10px 0 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.remove {
  --color: var(--ct-ember);
  margin-top: 16px;
}

.add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.add-input {
  flex: 1;
}

/*
 * Ionic gives `ion-select` `width: 100%`, which as a flex item is a
 * flex-basis of the entire row: the free space is already negative, so the
 * input beside it — basis 0 — grows by nothing and shrinks to nothing. The
 * checklist input would render at zero width and FR-13.3's editor could not
 * be typed into at all. The select is content-sized here, and the input
 * takes the rest.
 */
.add-row ion-select {
  flex: 0 1 auto;
  width: auto;
}

.actions {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
