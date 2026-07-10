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
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBackButton,
  IonButtons,
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

import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ItemMode, Trip } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ seriesId: string }>()

const master = useMasterStore()
const tripStore = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const series = computed(() => master.getSeries(props.seriesId))
const profile = computed(() => master.getDestinationProfile(props.seriesId))
const checklist = computed(() => (profile.value ? master.getChecklistItems(profile.value.id) : []))

// --- Series name & default attributes (FR-15.1) ---

function saveName(name: string) {
  if (!series.value || !name.trim() || name === series.value.name) return
  orchestrator.updateSeries(series.value, { name: name.trim() })
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
    .sort((a, b) => b.end_date.localeCompare(a.end_date)),
)

const attachableTrips = computed(() => tripStore.tripList.filter((t) => !t.series_id))

function tripStats(trip: Trip): string {
  const k = tripStore.kpis(trip.id)
  return `${k.packedItems}/${k.totalItems} packed`
}

/** Trend shortcut (M12): analytics of the series' most recent trip. */
const trendTripId = computed(() => seriesTrips.value[0]?.id ?? null)

/** FR-12.1: the series' most recent archived trip is the default clone source. */
const cloneSource = computed(() => seriesTrips.value.find((t) => t.status === 'archived') ?? null)
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/trips" />
        </IonButtons>
        <IonTitle>{{ series?.name ?? 'Series' }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <template v-if="series">
        <h2 class="section-title">Series</h2>
        <IonList>
          <IonItem>
            <IonInput
              label="Name"
              label-placement="stacked"
              :value="series.name"
              @ionChange="(e: CustomEvent) => saveName(e.detail.value ?? '')"
            />
          </IonItem>
          <IonItem>
            <IonSelect
              label="Season"
              interface="popover"
              :value="attribute('season')"
              @ionChange="(e: CustomEvent) => saveAttribute('season', e.detail.value)"
            >
              <IonSelectOption value="">—</IonSelectOption>
              <IonSelectOption value="summer">Summer</IonSelectOption>
              <IonSelectOption value="winter">Winter</IonSelectOption>
              <IonSelectOption value="transitional">Transitional</IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect
              label="Transport"
              interface="popover"
              :value="attribute('transport_mode')"
              @ionChange="(e: CustomEvent) => saveAttribute('transport_mode', e.detail.value)"
            >
              <IonSelectOption value="">—</IonSelectOption>
              <IonSelectOption value="car">Car</IonSelectOption>
              <IonSelectOption value="bike">Bike</IonSelectOption>
              <IonSelectOption value="plane">Plane</IonSelectOption>
              <IonSelectOption value="train">Train</IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect
              label="Accommodation"
              interface="popover"
              :value="attribute('accommodation')"
              @ionChange="(e: CustomEvent) => saveAttribute('accommodation', e.detail.value)"
            >
              <IonSelectOption value="">—</IonSelectOption>
              <IonSelectOption value="hotel">Hotel</IonSelectOption>
              <IonSelectOption value="holiday_flat">Holiday flat</IonSelectOption>
              <IonSelectOption value="camping">Camping</IonSelectOption>
            </IonSelect>
          </IonItem>
        </IonList>
        <IonNote>Defaults prefill the wizard for new trips in this series.</IonNote>

        <h2 class="section-title">Destination notes</h2>
        <IonList>
          <IonItem>
            <IonTextarea
              placeholder="e.g. washing machine available"
              :value="profile?.notes ?? ''"
              auto-grow
              @ionChange="(e: CustomEvent) => saveNotes(e.detail.value ?? '')"
            />
          </IonItem>
        </IonList>

        <h2 class="section-title">Destination checklist</h2>
        <IonList v-if="checklist.length > 0">
          <IonItem v-for="entry in checklist" :key="entry.id">
            <IonLabel>
              <h3>{{ entry.label }}</h3>
              <p>{{ entry.mode === 'buy_local' ? 'Buy there' : entry.mode === 'buy_before' ? 'Buy before' : 'Pack' }}</p>
            </IonLabel>
            <IonButton
              slot="end"
              fill="clear"
              color="medium"
              aria-label="Remove checklist item"
              @click="orchestrator.deleteChecklistItem(entry.id)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>
        <IonNote v-else>Offered automatically when a new trip in this series is created.</IonNote>
        <div class="add-row">
          <IonInput
            class="add-input"
            placeholder="Add item…"
            :value="newLabel"
            @ionInput="(e: CustomEvent) => (newLabel = e.detail.value ?? '')"
            @keyup.enter="addChecklistEntry"
          />
          <IonSelect
            interface="popover"
            :value="newMode"
            aria-label="Mode"
            @ionChange="(e: CustomEvent) => (newMode = e.detail.value)"
          >
            <IonSelectOption value="buy_local">Buy there</IonSelectOption>
            <IonSelectOption value="buy_before">Buy before</IonSelectOption>
            <IonSelectOption value="pack">Pack</IonSelectOption>
          </IonSelect>
          <IonButton fill="outline" size="small" @click="addChecklistEntry">
            <IonIcon slot="icon-only" :icon="addOutline" />
          </IonButton>
        </div>

        <h2 class="section-title">Trips in this series</h2>
        <IonList v-if="seriesTrips.length > 0">
          <IonItem v-for="trip in seriesTrips" :key="trip.id" button :router-link="`/trips/${trip.id}`">
            <IonLabel>
              <h3>{{ trip.name }}</h3>
              <p>{{ trip.start_date ? `${trip.start_date} – ` : 'until ' }}{{ trip.end_date }} · {{ tripStats(trip) }}</p>
            </IonLabel>
            <IonButton
              slot="end"
              fill="clear"
              color="medium"
              aria-label="Detach from series"
              @click.stop.prevent="orchestrator.setTripSeries(trip.id, null)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>
        <IonNote v-else>No trips in this series yet.</IonNote>

        <IonList v-if="attachableTrips.length > 0">
          <IonItem>
            <IonSelect
              label="Attach existing trip"
              interface="popover"
              :value="''"
              @ionChange="(e: CustomEvent) => e.detail.value && orchestrator.setTripSeries(e.detail.value, seriesId)"
            >
              <IonSelectOption value="">—</IonSelectOption>
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
            Clone "{{ cloneSource.name }}"
          </IonButton>
          <IonButton expand="block" :fill="cloneSource ? 'outline' : 'solid'" :router-link="`/trips/new?series=${seriesId}`">
            New trip in series
          </IonButton>
          <IonButton
            v-if="trendTripId"
            expand="block"
            fill="outline"
            :router-link="`/trips/${trendTripId}/analytics`"
          >
            <IonIcon slot="start" :icon="trendingUpOutline" />
            Series trends
          </IonButton>
        </div>
      </template>
      <IonNote v-else>Series not found on this device.</IonNote>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.section-title {
  font-size: 1rem;
  font-weight: 600;
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
