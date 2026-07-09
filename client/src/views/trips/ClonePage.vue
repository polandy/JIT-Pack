<script setup lang="ts">
/**
 * Clone dialog (FR-12.1/12.2) — reached from M2's context action on
 * archived trips and from M16 ("clone last trip"). Dates are entered
 * fresh; the three carry-over toggles gate traveler assignments, packer
 * delegations, and container assignments. The preview recomputes live,
 * including how many quantities re-evaluate from their formula.
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
  IonToggle,
  IonNote,
} from '@ionic/vue'
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'

import { planClone } from '@/domain/clone'
import { durationDays } from '@/domain/instantiate'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ tripId: string }>()

const router = useRouter()
const store = useTripStore()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const source = computed(() => store.getTrip(props.tripId))

const name = ref('')
const startDate = ref('')
const endDate = ref('')
const travelerAssignments = ref(true)
const packerDelegations = ref(true)
const containerAssignments = ref(true)

const options = computed(() => ({
  travelerAssignments: travelerAssignments.value,
  packerDelegations: packerDelegations.value,
  containerAssignments: containerAssignments.value,
}))

const preview = computed(() => {
  if (!source.value) return null
  return planClone(
    {
      trip: source.value,
      items: store.getItems(props.tripId),
      travelers: store.getTravelers(props.tripId),
      containers: store.getContainers(props.tripId),
    },
    options.value,
    {
      templateItem: (templateId, itemId) =>
        master.getTemplateItems(templateId).find((ti) => ti.item_id === itemId),
      masterItem: (id) => master.getItem(id),
    },
    durationDays(startDate.value || null, endDate.value),
  )
})

const valid = computed(() => name.value.trim() !== '' && endDate.value !== '')

function clone() {
  const tripId = orchestrator.cloneTrip(props.tripId, {
    name: name.value.trim(),
    startDate: startDate.value || null,
    endDate: endDate.value,
    options: options.value,
  })
  if (tripId) router.replace(`/trips/${tripId}`)
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/trips" />
        </IonButtons>
        <IonTitle>Clone · {{ source?.name ?? '' }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <template v-if="source">
        <IonList>
          <IonItem>
            <IonInput
              label="Name"
              label-placement="stacked"
              :placeholder="source.name"
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
        </IonList>

        <h2 class="section-title">Carry over</h2>
        <IonList>
          <IonItem>
            <IonToggle
              :checked="travelerAssignments"
              @ionChange="(e: CustomEvent) => (travelerAssignments = e.detail.checked)"
            >
              Participant assignments
            </IonToggle>
          </IonItem>
          <IonItem>
            <IonToggle
              :checked="packerDelegations"
              @ionChange="(e: CustomEvent) => (packerDelegations = e.detail.checked)"
            >
              Packer delegations
            </IonToggle>
          </IonItem>
          <IonItem>
            <IonToggle
              :checked="containerAssignments"
              @ionChange="(e: CustomEvent) => (containerAssignments = e.detail.checked)"
            >
              Container assignments
            </IonToggle>
          </IonItem>
        </IonList>

        <IonNote v-if="preview">
          {{ preview.items.length }} items, {{ preview.travelers.length }} travelers<template
            v-if="preview.containers.length > 0"
          >, {{ preview.containers.length }} containers</template>.
          <template v-if="preview.reevaluated > 0">
            {{ preview.reevaluated }} quantit{{ preview.reevaluated === 1 ? 'y' : 'ies' }}
            re-evaluated from formulas<template v-if="!startDate"> (no start date — duration falls back to a single day)</template>.
          </template>
        </IonNote>

        <IonButton expand="block" class="confirm" :disabled="!valid" @click="clone">
          Create clone
        </IonButton>
      </template>
      <IonNote v-else>Trip not found on this device.</IonNote>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 20px 0 8px;
}

.confirm {
  margin-top: 24px;
}
</style>
