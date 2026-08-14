<script setup lang="ts">
/**
 * Clone dialog (FR-12.1/12.2) — reached from M2's context action on
 * archived trips and from M16 ("clone last trip"). Dates are entered
 * fresh; the three carry-over toggles gate traveler assignments, packer
 * delegations, and container assignments. The preview recomputes live,
 */
import {
  IonPage,
  IonContent,
  IonButton,
  IonList,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
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
import { setHeaderTitle } from '@/composables/useHeaderTitle'

const props = defineProps<{ tripId: string }>()

const router = useRouter()
const store = useTripStore()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const source = computed(() => store.getTrip(props.tripId))

const name = ref('')
// FR-2.1b: a clone is a trip of its own year, and the year is the only
// temporal fact it needs. Defaults to this one, like M3.
const thisYear = new Date().getFullYear()
const yearChoices = Array.from({ length: 6 }, (_, i) => thisYear - 1 + i)
const year = ref(thisYear)

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

const valid = computed(() => name.value.trim() !== '')

function clone() {
  const tripId = orchestrator.cloneTrip(props.tripId, {
    name: name.value.trim(),
    year: year.value,
    startDate: startDate.value || null,
    endDate: endDate.value || null,
    options: options.value,
  })
  if (tripId) router.replace(`/trips/${tripId}`)
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => `Clone · ${source.value?.name ?? ''}`)
</script>

<template>
  <IonPage>
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
            <IonSelect
              data-testid="clone-year"
              label="Year"
              label-placement="stacked"
              interface="popover"
              :value="year"
              @ionChange="(e: CustomEvent) => (year = Number(e.detail.value))"
            >
              <IonSelectOption v-for="option in yearChoices" :key="option" :value="option">
                {{ option }}
              </IonSelectOption>
            </IonSelect>
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
              label="End date (optional)"
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
            >, {{ preview.containers.length }} containers</template
          >.
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
