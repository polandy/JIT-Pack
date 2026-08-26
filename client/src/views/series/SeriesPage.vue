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
import { computed, inject, ref } from 'vue'

import { t, type MessageKey } from '@/i18n'
import { formatTripPeriod } from '@/lib/format'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ItemMode, Trip } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { tripOrderKey } from '@/domain/trips'
import { presentToast } from '@/lib/toast'

const props = defineProps<{ seriesId: string }>()

const master = useMasterStore()
const tripStore = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

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
  const taken = orchestrator.seriesNameCollision(name, current.id)
  if (taken) {
    field.value = current.name
    await presentToast({ message: t('series.nameTaken', { name: taken.name }), duration: 3000 })
    return
  }
  orchestrator.updateSeries(current, { name })
}

function attribute(key: string): string {
  return (series.value?.default_attributes?.[key] as string) ?? ''
}

function saveAttribute(key: string, value: string) {
  if (!series.value) return
  const attrs = { ...series.value.default_attributes }
  if (value) attrs[key] = value
  else delete attrs[key]
  orchestrator.updateSeries(series.value, {
    default_attributes: Object.keys(attrs).length > 0 ? JSON.stringify(attrs) : null,
  })
}

// --- Destination profile (FR-13.2) ---

function saveNotes(notes: string) {
  const profileId = orchestrator.ensureDestinationProfile(props.seriesId)
  const current = master.getDestinationProfile(props.seriesId)
  if (!current || current.id !== profileId) return
  orchestrator.updateDestinationProfile(current, { notes: notes || null })
}

// --- Destination checklist (FR-13.3) ---

/**
 * FR-13.3: a checklist entry carries the same three procurement modes a
 * position does, so it reads them from the one `mode.*` vocabulary rather
 * than spelling its own — two wordings for one concept eventually disagree.
 */
const CHECKLIST_MODE_KEYS = {
  pack: 'mode.pack',
  buy_before: 'mode.buyBefore',
  buy_local: 'mode.buyLocal',
} as const satisfies Record<ItemMode, MessageKey>

const newLabel = ref('')
const newMode = ref<ItemMode>('buy_local')

function addChecklistEntry() {
  const label = newLabel.value.trim()
  if (!label) return
  const profileId = orchestrator.ensureDestinationProfile(props.seriesId)
  orchestrator.addChecklistItem(profileId, label, newMode.value)
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
const cloneSource = computed(() => seriesTrips.value.find((t) => t.status === 'archived') ?? null)

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => series.value?.name ?? t('series.section'))
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <template v-if="series">
        <h2 class="section-title jp-eyebrow">{{ t('series.section') }}</h2>
        <IonList>
          <IonItem>
            <IonInput
              :label="t('series.name')"
              label-placement="stacked"
              :value="series.name"
              @ionChange="(e: CustomEvent) => saveName(e.target as HTMLIonInputElement)"
            />
          </IonItem>
          <IonItem>
            <IonSelect
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

        <h2 class="section-title jp-eyebrow">{{ t('series.sectionNotes') }}</h2>
        <IonList>
          <IonItem>
            <IonTextarea
              :placeholder="t('series.notesPlaceholder')"
              :value="profile?.notes ?? ''"
              auto-grow
              @ionChange="(e: CustomEvent) => saveNotes(e.detail.value ?? '')"
            />
          </IonItem>
        </IonList>

        <h2 class="section-title jp-eyebrow">{{ t('wizard.sectionChecklist') }}</h2>
        <IonList v-if="checklist.length > 0">
          <IonItem v-for="entry in checklist" :key="entry.id">
            <IonLabel>
              <h3>{{ entry.label }}</h3>
              <p>
                {{ t(CHECKLIST_MODE_KEYS[entry.mode]) }}
              </p>
            </IonLabel>
            <IonButton
              slot="end"
              fill="clear"
              color="medium"
              :aria-label="t('series.checklistRemove')"
              @click="orchestrator.deleteChecklistItem(entry.id)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>
        <IonNote v-else>{{ t('series.checklistEmpty') }}</IonNote>
        <div class="add-row">
          <IonInput
            class="add-input"
            :placeholder="t('series.checklistAdd')"
            :value="newLabel"
            @ionInput="(e: CustomEvent) => (newLabel = e.detail.value ?? '')"
            @keyup.enter="addChecklistEntry"
          />
          <IonSelect
            interface="popover"
            :value="newMode"
            :aria-label="t('series.checklistMode')"
            @ionChange="(e: CustomEvent) => (newMode = e.detail.value)"
          >
            <IonSelectOption value="buy_local">{{ t('mode.buyLocal') }}</IonSelectOption>
            <IonSelectOption value="buy_before">{{ t('mode.buyBefore') }}</IonSelectOption>
            <IonSelectOption value="pack">{{ t('mode.pack') }}</IonSelectOption>
          </IonSelect>
          <IonButton fill="outline" size="small" @click="addChecklistEntry">
            <IonIcon slot="icon-only" :icon="addOutline" />
          </IonButton>
        </div>

        <h2 class="section-title jp-eyebrow">{{ t('series.sectionTrips') }}</h2>
        <IonList v-if="seriesTrips.length > 0">
          <IonItem
            v-for="trip in seriesTrips"
            :key="trip.id"
            button
            :router-link="`/trips/${trip.id}`"
          >
            <IonLabel>
              <h3>{{ trip.name }}</h3>
              <p>{{ tripWhen(trip) }} · {{ tripStats(trip) }}</p>
            </IonLabel>
            <IonButton
              slot="end"
              fill="clear"
              color="medium"
              :aria-label="t('series.detach')"
              @click.stop.prevent="orchestrator.setTripSeries(trip.id, null)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>
        <IonNote v-else>{{ t('series.noTrips') }}</IonNote>

        <IonList v-if="attachableTrips.length > 0">
          <IonItem>
            <IonSelect
              :label="t('series.attach')"
              interface="popover"
              :value="''"
              @ionChange="
                (e: CustomEvent) =>
                  e.detail.value && orchestrator.setTripSeries(e.detail.value, seriesId)
              "
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
            :router-link="`/trips/${cloneSource.id}/clone`"
          >
            <IonIcon slot="start" :icon="copyOutline" />
            {{ t('series.clone', { name: cloneSource.name }) }}
          </IonButton>
          <IonButton
            expand="block"
            :fill="cloneSource ? 'outline' : 'solid'"
            :router-link="`/trips/new?series=${seriesId}`"
          >
            {{ t('series.newTrip') }}
          </IonButton>
          <IonButton
            v-if="trendTripId"
            expand="block"
            fill="outline"
            :router-link="`/trips/${trendTripId}/analytics`"
          >
            <IonIcon slot="start" :icon="trendingUpOutline" />
            {{ t('series.trends') }}
          </IonButton>
        </div>
      </template>
      <IonNote v-else>{{ t('series.notFound') }}</IonNote>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.section-title {
  margin: 20px 0 8px;
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

.actions {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
