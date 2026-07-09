<script setup lang="ts">
/**
 * M3 — Trip Creation Wizard
 *
 * Four steps: metadata (FR-2.1/2.1a, attributes FR-15.1) → travelers
 * (FR-2.5) → template selection with live dedup/exclusion preview
 * (FR-2.2/2.3a/15.2) → quantity review. "Create trip" commits the
 * cascade through the orchestrator and opens M4. The draft lives in
 * component state until then — Cancel leaves no residue.
 *
 * Sharing/role assignment of step 2 is not rendered yet: membership
 * sync is not built, and in Single-User/Local Mode it is hidden anyway
 * (FR-17.3/19.3). The series picker (FR-13.1) waits for series support.
 */
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonBackButton,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSegment,
  IonSegmentButton,
  IonCheckbox,
  IonIcon,
  IonNote,
  IonChip,
} from '@ionic/vue'
import { addOutline, closeOutline, personOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'

import { durationDays, generateTripItems } from '@/domain/instantiate'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const router = useRouter()
const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const step = ref(1)

// --- Step 1: metadata (FR-2.1/2.1a/15.1) ---
const name = ref('')
const startDate = ref('')
const endDate = ref('')
const season = ref('')
const transportMode = ref('')
const accommodation = ref('')
const tagsInput = ref('')

const duration = computed(() => durationDays(startDate.value || null, endDate.value))

const attributes = computed<Record<string, unknown> | null>(() => {
  const attrs: Record<string, unknown> = {}
  if (season.value) attrs.season = season.value
  if (transportMode.value) attrs.transport_mode = transportMode.value
  if (accommodation.value) attrs.accommodation = accommodation.value
  const tags = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean)
  if (tags.length > 0) attrs.tags = tags
  return Object.keys(attrs).length > 0 ? attrs : null
})

// --- Step 2: travelers (FR-2.5) ---
const travelers = ref<{ name: string; profile: 'adult' | 'child' }[]>([])

function addTraveler() {
  travelers.value = [...travelers.value, { name: '', profile: 'adult' }]
}

function removeTraveler(index: number) {
  travelers.value = travelers.value.filter((_, i) => i !== index)
}

// --- Step 3: template selection + live preview (FR-2.2/2.3a/15.2) ---
const selectedTemplateIds = ref<Set<string>>(new Set())

function toggleTemplate(id: string, checked: boolean) {
  const next = new Set(selectedTemplateIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedTemplateIds.value = next
}

const generation = computed(() => {
  const templates = masterStore.templateList.filter((t) => selectedTemplateIds.value.has(t.id))
  return generateTripItems({
    templates,
    templateItems: templates.flatMap((t) => masterStore.getTemplateItems(t.id)),
    masterItems: masterStore.itemList,
    trip: {
      duration_days: duration.value,
      attributes: attributes.value,
      travelers: travelers.value,
    },
  })
})

// --- Step 4: quantity review ---
const quantityOverrides = ref<Record<number, number>>({})

function reviewQuantity(index: number): number {
  return quantityOverrides.value[index] ?? generation.value.items[index].quantity
}

function overrideQuantity(index: number, value: string) {
  const qty = Number(value)
  if (!Number.isFinite(qty) || qty < 0) return
  quantityOverrides.value = { ...quantityOverrides.value, [index]: Math.floor(qty) }
}

function travelerName(index: number | null): string | null {
  return index === null ? null : travelers.value[index]?.name || `Traveler ${index + 1}`
}

// --- Navigation ---
const stepValid = computed(() => {
  if (step.value === 1) return name.value.trim() !== '' && endDate.value !== ''
  if (step.value === 2) return travelers.value.every((t) => t.name.trim() !== '')
  return true
})

function next() {
  if (step.value < 4) step.value++
}

function back() {
  if (step.value > 1) step.value--
}

function createTrip() {
  const items = generation.value.items.map((item, index) => ({
    ...item,
    quantity: reviewQuantity(index),
  }))
  const tripId = orchestrator.createTripFromWizard({
    name: name.value.trim(),
    startDate: startDate.value || null,
    endDate: endDate.value,
    attributes: attributes.value,
    travelers: travelers.value.map((t) => ({ name: t.name.trim(), profile: t.profile })),
    items,
  })
  router.replace(`/trips/${tripId}`)
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/trips" />
        </IonButtons>
        <IonTitle>New trip · step {{ step }}/4</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <!-- Step 1: metadata -->
      <section v-if="step === 1">
        <h2 class="section-title">Trip</h2>
        <IonList>
          <IonItem>
            <IonInput
              label="Name"
              label-placement="stacked"
              placeholder="e.g. Engadin 2026"
              :value="name"
              @ionInput="(e: CustomEvent) => (name = e.detail.value ?? '')"
            />
          </IonItem>
          <IonItem>
            <IonInput
              label="Start date (optional)"
              label-placement="stacked"
              type="date"
              :value="startDate"
              @ionInput="(e: CustomEvent) => (startDate = e.detail.value ?? '')"
            />
          </IonItem>
          <IonItem>
            <IonInput
              label="End date"
              label-placement="stacked"
              type="date"
              :value="endDate"
              @ionInput="(e: CustomEvent) => (endDate = e.detail.value ?? '')"
            />
          </IonItem>
          <IonItem v-if="duration !== null" lines="none">
            <IonNote>Duration: {{ duration }} days</IonNote>
          </IonItem>
        </IonList>

        <h2 class="section-title">Attributes</h2>
        <IonList>
          <IonItem>
            <IonSelect
              label="Season"
              interface="popover"
              :value="season"
              @ionChange="(e: CustomEvent) => (season = e.detail.value)"
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
              :value="transportMode"
              @ionChange="(e: CustomEvent) => (transportMode = e.detail.value)"
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
              :value="accommodation"
              @ionChange="(e: CustomEvent) => (accommodation = e.detail.value)"
            >
              <IonSelectOption value="">—</IonSelectOption>
              <IonSelectOption value="hotel">Hotel</IonSelectOption>
              <IonSelectOption value="holiday_flat">Holiday flat</IonSelectOption>
              <IonSelectOption value="camping">Camping</IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonInput
              label="Tags"
              label-placement="stacked"
              placeholder="bike, lake (comma-separated)"
              :value="tagsInput"
              @ionInput="(e: CustomEvent) => (tagsInput = e.detail.value ?? '')"
            />
          </IonItem>
        </IonList>
      </section>

      <!-- Step 2: travelers -->
      <section v-if="step === 2">
        <h2 class="section-title">Travelers</h2>
        <IonList v-if="travelers.length > 0">
          <IonItem v-for="(traveler, index) in travelers" :key="index">
            <IonIcon slot="start" :icon="personOutline" />
            <IonInput
              placeholder="Name"
              :value="traveler.name"
              @ionInput="(e: CustomEvent) => (traveler.name = e.detail.value ?? '')"
            />
            <IonSegment
              class="profile-segment"
              :value="traveler.profile"
              @ionChange="(e: CustomEvent) => (traveler.profile = e.detail.value)"
            >
              <IonSegmentButton value="adult">Adult</IonSegmentButton>
              <IonSegmentButton value="child">Child</IonSegmentButton>
            </IonSegment>
            <IonButton slot="end" fill="clear" color="medium" aria-label="Remove traveler" @click="removeTraveler(index)">
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>
        <div v-else class="empty-hint">
          No travelers yet — per-person items need at least one.
        </div>
        <IonButton fill="outline" size="small" @click="addTraveler">
          <IonIcon slot="start" :icon="addOutline" />
          Add traveler
        </IonButton>
      </section>

      <!-- Step 3: templates + preview -->
      <section v-if="step === 3">
        <h2 class="section-title">Templates</h2>
        <IonList v-if="masterStore.templateList.length > 0">
          <IonItem v-for="template in masterStore.templateList" :key="template.id">
            <IonCheckbox
              slot="start"
              :checked="selectedTemplateIds.has(template.id)"
              @ionChange="(e: CustomEvent) => toggleTemplate(template.id, e.detail.checked)"
            />
            <IonLabel>
              <h3>{{ template.name }}</h3>
              <p>{{ masterStore.getTemplateItems(template.id).length }} items</p>
            </IonLabel>
          </IonItem>
        </IonList>
        <div v-else class="empty-hint">No templates yet — you can still create an empty trip.</div>

        <div class="preview-footer">
          <IonChip color="primary" outline>{{ generation.items.length }} items</IonChip>
          <div v-if="generation.merged.length > 0" class="preview-block">
            <h3>Merged overlaps</h3>
            <p v-for="(m, i) in generation.merged" :key="i">
              {{ m.item_name }}: {{ m.quantities.join(' / ') }} → {{ m.quantity }} ({{ m.strategy }})
            </p>
          </div>
          <details v-if="generation.excluded.length > 0" class="preview-block">
            <summary>{{ generation.excluded.length }} excluded by conditions</summary>
            <p v-for="(ex, i) in generation.excluded" :key="i">
              {{ ex.item_name }} — skipped: {{ ex.reason }}
            </p>
          </details>
        </div>
      </section>

      <!-- Step 4: quantity review -->
      <section v-if="step === 4">
        <h2 class="section-title">Review quantities</h2>
        <IonList v-if="generation.items.length > 0">
          <IonItem v-for="(item, index) in generation.items" :key="index">
            <IonLabel>
              <h3>{{ item.name }}</h3>
              <p>
                <template v-if="travelerName(item.traveler_index)">{{ travelerName(item.traveler_index) }} · </template>
                <template v-if="item.category_name">{{ item.category_name }}</template>
              </p>
            </IonLabel>
            <IonInput
              slot="end"
              class="qty-input"
              type="number"
              min="0"
              :value="reviewQuantity(index)"
              aria-label="Quantity"
              @ionInput="(e: CustomEvent) => overrideQuantity(index, e.detail.value ?? '')"
            />
          </IonItem>
        </IonList>
        <div v-else class="empty-hint">No items generated — the trip starts empty.</div>
      </section>

      <!-- Wizard navigation -->
      <div class="wizard-nav">
        <IonButton v-if="step > 1" fill="outline" @click="back">Back</IonButton>
        <IonButton v-if="step < 4" :disabled="!stepValid" @click="next">Next</IonButton>
        <IonButton v-if="step === 4" color="primary" @click="createTrip">Create trip</IonButton>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 16px 0 8px;
}

.profile-segment {
  max-width: 160px;
}

.empty-hint {
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  margin: 8px 0 16px;
}

.preview-footer {
  margin-top: 16px;
}

.preview-block {
  margin-top: 8px;
  font-size: 0.9rem;
}

.preview-block h3,
.preview-block summary {
  font-size: 0.9rem;
  font-weight: 600;
}

.preview-block p {
  margin: 2px 0;
  color: var(--ion-color-medium);
}

.qty-input {
  max-width: 72px;
  text-align: right;
}

.wizard-nav {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>
