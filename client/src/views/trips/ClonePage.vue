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
import DateField from '@/components/global/DateField.vue'
import { tripYearChoices } from '@/domain/tripYears'
import { t } from '@/i18n'

const props = defineProps<{ tripId: string }>()

const router = useRouter()
const store = useTripStore()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const source = computed(() => store.getTrip(props.tripId))

// ADR-033: the source trip's rows live in its own partition, which this
// device may never have pulled. Ask for them, and until they are here the
// preview says so and the clone stays locked — summing an absence would
// read "0 Packelemente" and clone exactly that.
const sourceLoaded = computed(() => orchestrator.tripDataLoaded(props.tripId))
void orchestrator.ensureTripData(props.tripId)

const name = ref('')
// FR-2.1b: a clone is a trip of its own year, and the year is the only
// temporal fact it needs. Defaults to this one, like M3.
const thisYear = new Date().getFullYear()
const yearChoices = tripYearChoices(thisYear)
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

/** What the clone will contain, counted before it is made (FR-13.2). */
const previewSummary = computed(() => {
  if (!sourceLoaded.value) return t('clone.previewLoading')
  const plan = preview.value
  if (!plan) return ''
  const parts = [
    t('clone.previewItems', { n: plan.items.length }),
    t('clone.previewTravelers', { n: plan.travelers.length }),
  ]
  if (plan.containers.length > 0) {
    parts.push(t('clone.previewContainers', { n: plan.containers.length }))
  }
  return `${parts.join(', ')}.`
})

const valid = computed(() => name.value.trim() !== '' && sourceLoaded.value)

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
setHeaderTitle(() => t('clone.title', { name: source.value?.name ?? '' }))
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <template v-if="source">
        <IonList>
          <IonItem>
            <IonInput
              data-testid="clone-name"
              :label="t('wizard.name')"
              label-placement="stacked"
              :placeholder="source.name"
              :value="name"
              @ionInput="(e: CustomEvent) => (name = e.detail.value ?? '')"
            />
          </IonItem>
          <IonItem>
            <IonSelect
              data-testid="clone-year"
              :label="t('wizard.year')"
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
            <DateField
              testid="clone-start-date"
              :max="endDate"
              :label="t('wizard.startDate')"
              :value="startDate"
              @update="startDate = $event"
            />
          </IonItem>
          <IonItem>
            <DateField
              testid="clone-end-date"
              :min="startDate"
              :label="t('wizard.endDate')"
              :value="endDate"
              @update="endDate = $event"
            />
          </IonItem>
        </IonList>

        <h2 class="section-title jp-eyebrow">{{ t('clone.carryOver') }}</h2>
        <IonList>
          <IonItem>
            <IonToggle
              :checked="travelerAssignments"
              @ionChange="(e: CustomEvent) => (travelerAssignments = e.detail.checked)"
            >
              {{ t('clone.travelerAssignments') }}
            </IonToggle>
          </IonItem>
          <IonItem>
            <IonToggle
              :checked="packerDelegations"
              @ionChange="(e: CustomEvent) => (packerDelegations = e.detail.checked)"
            >
              {{ t('clone.packerDelegations') }}
            </IonToggle>
          </IonItem>
          <IonItem>
            <IonToggle
              :checked="containerAssignments"
              @ionChange="(e: CustomEvent) => (containerAssignments = e.detail.checked)"
            >
              {{ t('clone.containerAssignments') }}
            </IonToggle>
          </IonItem>
        </IonList>

        <IonNote data-testid="clone-preview">{{ previewSummary }}</IonNote>

        <IonButton expand="block" class="confirm" :disabled="!valid" @click="clone">
          {{ t('clone.create') }}
        </IonButton>
      </template>
      <IonNote v-else>{{ t('clone.notFound') }}</IonNote>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.section-title {
  margin: 20px 0 8px;
}

.confirm {
  margin-top: 24px;
}
</style>
