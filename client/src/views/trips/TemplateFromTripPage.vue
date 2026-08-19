<script setup lang="ts">
/**
 * M21 — Vorlage aus Reise (§3.27, FR-27.5).
 *
 * The closing half of the FR-27.1 round-trip: M3 instantiates a composed
 * Vorlage into a trip, M21 folds the finished trip back. It exists because the
 * naive "save as template" copies the trip flat and forks every group it came
 * from — so the screen leads with the contract it keeps (recognised groups are
 * *referenced*, not copied) and proves it by handing off into M8 on the new
 * Vorlage, where the includes are visible.
 *
 * Group membership is a fact of the provenance data and carries no per-group
 * opt-out. The one real question is what to do with the deviations, and it
 * defaults to feeding the group — a change made while packing is learned
 * truth, the same stance M14 takes.
 */
import {
  IonPage,
  IonContent,
  IonButton,
  IonCheckbox,
  IonInput,
  IonItem,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonToggle,
  toastController,
} from '@ionic/vue'
import { computed, inject, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { t } from '@/i18n'
import {
  DEFAULT_DEVIATION_CHOICE,
  recogniseTripComposition,
  suggestTemplateName,
  type DeviationChoice,
} from '@/domain/templateFromTrip'
import { tripsReachedBy } from '@/domain/templates'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const router = useRouter()

const trip = computed(() => store.getTrip(props.tripId))

const composition = computed(() =>
  recogniseTripComposition({
    tripItems: store.getItems(props.tripId),
    templates: master.templateList,
    positions: master.templateList.flatMap((tpl) => master.getTemplateItems(tpl.id)),
    masterItems: master.itemList,
  }),
)

const templateName = ref('')
const bundleOn = ref(false)
const bundleName = ref('')
const choices = ref<Record<string, DeviationChoice>>({})
const checked = ref<Set<string>>(new Set())
const creating = ref(false)

/**
 * The prefills wait for the trip's own rows: on a cold load the partition
 * arrives after the first paint, and seeding from an empty list would leave
 * every loose row unchecked behind a name the user never saw ("not loaded ≠
 * empty", ADR-016). Re-seeding is guarded by the same emptiness, so a later
 * pull never overwrites a choice already made.
 */
const seeded = ref(false)
watch(
  [trip, composition],
  ([current, comp]) => {
    if (seeded.value || !current) return
    if (comp.groups.length === 0 && comp.loose.length === 0) return
    templateName.value = suggestTemplateName(current.name)
    bundleName.value = t('templateFromTrip.bundleDefault', { trip: current.name })
    checked.value = new Set(comp.loose.map((l) => l.tripItem.id))
    seeded.value = true
  },
  { immediate: true },
)

const checkedCount = computed(
  () => composition.value.loose.filter((l) => checked.value.has(l.tripItem.id)).length,
)

function choiceOf(groupId: string): DeviationChoice {
  return choices.value[groupId] ?? DEFAULT_DEVIATION_CHOICE
}

function setChoice(groupId: string, value: DeviationChoice) {
  choices.value = { ...choices.value, [groupId]: value }
}

function toggleLoose(itemId: string) {
  const next = new Set(checked.value)
  if (!next.delete(itemId)) next.add(itemId)
  checked.value = next
}

/** FR-27.4: what a deviation flowing back into this group would reach. */
function blastText(groupId: string): string | null {
  const reached = tripsReachedBy(
    groupId,
    {
      trips: store.tripList,
      items: store.tripList.flatMap((other) => store.getItems(other.id)),
      includes: master.includeList,
    },
    orchestrator.today(),
  )
  return reached.length === 0
    ? t('templateFromTrip.blastNone')
    : t('templateFromTrip.blast', { n: reached.length })
}

/** The loose row's own explanation — a planned row says so (FR-27.1). */
function looseReason(reason: string, templateName: string | undefined): string {
  return reason === 'from-template'
    ? t('templateFromTrip.looseFromTemplate', { template: templateName ?? '' })
    : t('templateFromTrip.looseAdHoc')
}

const canCreate = computed(() => templateName.value.trim().length > 0 && !creating.value)

async function toast(message: string) {
  const el = await toastController.create({ message, duration: 3000, position: 'bottom' })
  await el.present()
}

/**
 * Creating hands off directly into M8 on the new Vorlage — creation ends where
 * editing continues, and it is the immediate proof that the groups were
 * referenced rather than copied (FR-27.5).
 */
async function create() {
  if (!canCreate.value) return
  creating.value = true
  const templateId = orchestrator.createTemplateFromTrip(props.tripId, {
    templateName: templateName.value.trim(),
    choices: choices.value,
    checkedLooseIds: [...checked.value],
    bundleName: bundleOn.value ? bundleName.value.trim() || null : null,
  })
  creating.value = false
  if (!templateId) {
    await toast(t('templateFromTrip.notLoaded'))
    return
  }
  await toast(t('templateFromTrip.created', { name: templateName.value.trim() }))
  await router.replace(`/templates/${templateId}`)
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => t('templateFromTrip.title'))
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <p class="intro" data-testid="m21-intro">
        {{ t('templateFromTrip.intro', { trip: trip?.name ?? '' }) }}
      </p>

      <IonList>
        <IonItem>
          <IonInput
            data-testid="m21-name"
            :label="t('templateFromTrip.name')"
            label-placement="stacked"
            :value="templateName"
            @ionInput="(e: CustomEvent) => (templateName = e.detail.value ?? '')"
          />
        </IonItem>
      </IonList>

      <template v-if="composition.groups.length > 0">
        <h2 class="section-title jp-eyebrow" data-testid="m21-groups-head">
          {{ t('templateFromTrip.groups', { n: composition.groups.length }) }}
        </h2>
        <article
          v-for="group in composition.groups"
          :key="group.group.id"
          class="jp-card group"
          data-testid="m21-group"
        >
          <div class="head">
            <div class="grow">
              <p class="name">{{ group.group.name }}</p>
              <p class="desc">
                {{ t('templateFromTrip.fromGroup', { n: group.tripItems.length }) }}
              </p>
            </div>
            <span class="chip reused" data-testid="m21-reused">
              {{ t('templateFromTrip.reused') }}
            </span>
          </div>

          <div v-if="group.added.length > 0" class="deviation" data-testid="m21-deviation">
            <p>
              {{ t('templateFromTrip.added') }}
              <strong>{{ group.added.map((row) => row.name).join(', ') }}</strong>
            </p>
            <IonSegment
              :value="choiceOf(group.group.id)"
              @ionChange="
                (e: CustomEvent) => setChoice(group.group.id, e.detail.value as DeviationChoice)
              "
            >
              <IonSegmentButton value="update" :data-testid="`m21-choice-update`">
                <IonLabel>{{ t('templateFromTrip.choiceUpdate') }}</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="own" :data-testid="`m21-choice-own`">
                <IonLabel>{{ t('templateFromTrip.choiceOwn') }}</IonLabel>
              </IonSegmentButton>
            </IonSegment>
            <p v-if="choiceOf(group.group.id) === 'update'" class="blast" data-testid="m21-blast">
              {{ blastText(group.group.id) }}
            </p>
          </div>

          <p v-if="group.absent.length > 0" class="absent" data-testid="m21-absent">
            {{
              t('templateFromTrip.absent', {
                n: group.absent.length,
                items: group.absent.join(', '),
              })
            }}
          </p>
        </article>
      </template>

      <h2 class="section-title jp-eyebrow" data-testid="m21-loose-head">
        {{ t('templateFromTrip.loose', { n: checkedCount, total: composition.loose.length }) }}
      </h2>
      <IonList v-if="composition.loose.length > 0">
        <IonItem v-for="row in composition.loose" :key="row.tripItem.id" data-testid="m21-loose">
          <IonCheckbox
            :checked="checked.has(row.tripItem.id)"
            label-placement="end"
            justify="start"
            @ionChange="() => toggleLoose(row.tripItem.id)"
          >
            <span class="name">{{ row.tripItem.name }}</span>
            <span class="desc">
              {{ looseReason(row.reason, row.sourceTemplate?.name) }}
            </span>
          </IonCheckbox>
        </IonItem>
      </IonList>
      <p v-else class="empty" data-testid="m21-loose-empty">
        {{ t('templateFromTrip.looseEmpty') }}
      </p>

      <IonList>
        <IonItem>
          <IonToggle
            data-testid="m21-bundle"
            :checked="bundleOn"
            :disabled="composition.loose.length === 0"
            @ionChange="(e: CustomEvent) => (bundleOn = e.detail.checked)"
          >
            <span class="name">{{ t('templateFromTrip.bundle') }}</span>
            <span class="desc">{{ t('templateFromTrip.bundleHint') }}</span>
          </IonToggle>
        </IonItem>
        <IonItem v-if="bundleOn">
          <IonInput
            data-testid="m21-bundle-name"
            :label="t('templateFromTrip.bundleName')"
            label-placement="stacked"
            :value="bundleName"
            @ionInput="(e: CustomEvent) => (bundleName = e.detail.value ?? '')"
          />
        </IonItem>
      </IonList>

      <IonButton
        expand="block"
        class="create"
        data-testid="m21-create"
        :disabled="!canCreate"
        @click="create"
      >
        {{ t('templateFromTrip.create') }}
      </IonButton>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.intro {
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  margin: 0 0 12px;
}

.section-title {
  margin: 20px 0 8px;
}

.group {
  padding: 12px 14px;
  margin-bottom: 10px;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0;
}

.desc {
  display: block;
  margin: 2px 0 0;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.added-line {
  margin: 0 0 8px;
  font-size: var(--jp-text-sm);
}

.chip.reused {
  flex-shrink: 0;
  font-size: var(--jp-text-xs);
  white-space: nowrap;
  padding: 3px 9px;
  border: 1px solid color-mix(in srgb, var(--jp-done) 50%, transparent);
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--jp-done);
}

.deviation ion-segment-button {
  --padding-start: 4px;
  --padding-end: 4px;
  min-height: 44px;
}

/* Ionic truncates a segment label by default. Both labels here are whole
   sentences of intent ("Gruppe aktualisieren" / "Nur in diese Vorlage"), and
   a truncated one is not a choice the user can read. */
.deviation ion-segment-button::part(native) {
  white-space: normal;
}

.deviation ion-label {
  white-space: normal;
  line-height: 1.2;
}

.deviation {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--ct-surface0);
}

.blast,
.absent,
.empty {
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.blast {
  margin: 8px 0 0;
}

/* Its own rule, not a continuation of the blast note above it: one says what
   an accepted change would reach, the other says what will not be touched. */
.absent {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--ct-surface0);
}

.create {
  margin-top: 18px;
}
</style>
