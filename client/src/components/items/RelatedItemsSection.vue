<script setup lang="ts">
/**
 * One of M10's two dependency sections (FR-20.1/20.4): the items this one
 * *depends on*, or its *companions* — the items that depend on it.
 *
 * The two are the same relation read from its two ends, so they are one
 * control with a `direction`: the rows, the mode select, the removal, the
 * cycle error and the picker are identical, and only which end of the edge is
 * "the other item" — `linkEdge`/`linkedEnd` — and the wording differ.
 *
 * Creating a related item the inventory does not hold yet (FR-24.11) is the
 * page's: the creation sheet must sit outside the picker (see
 * `ItemEditorPage.vue`), so the section emits `create` and the page hands the
 * new id back through {@link linkCreated}.
 */
import {
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
} from '@ionic/vue'
import { addOutline, trashOutline, warningOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import SectionHead from '@/components/global/SectionHead.vue'
import SearchOfferButton from '@/components/items/SearchOfferButton.vue'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import {
  DEPENDENCY_LINK_COMPANION,
  DEPENDENCY_LINK_MAIN,
  DEPENDENCY_MODE_REQUIRED,
  DEPENDENCY_MODE_SUGGESTED,
  DEPENDENCY_MODES,
  dependencyCycleError,
  linkEdge,
  linkedEnd,
  type DependencyCycleError,
  type DependencyLinkDirection,
} from '@/domain/dependencies'
import { OFFER_CREATE, searchOffer } from '@/domain/itemSearch'
import { t, type MessageKey } from '@/i18n'
import { dependencyOffer } from '@/lib/itemEditorOffers'
import { itemPath } from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'
import type { DependencyMode } from '@/types/domain'

const props = defineProps<{
  itemId: string
  /** The edited item's name, for the hints that say which way round the edge goes. */
  itemName: string
  direction: DependencyLinkDirection
}>()

const emit = defineEmits<{
  /** The picker's query, offered as a new item the page should create and hand back. */
  create: [name: string]
}>()

const masterStore = useMasterStore()
const orchestrator = useOrchestrator()

/** Everything that is worded differently between the two ends. */
interface SectionCopy {
  title: MessageKey
  hint: MessageKey
  add: MessageKey
  remove: MessageKey
  offerCreateHint: MessageKey
  offerRestoreHint: MessageKey
}

const COPY: Record<DependencyLinkDirection, SectionCopy> = {
  [DEPENDENCY_LINK_MAIN]: {
    title: 'items.editor.dependsOn',
    hint: 'items.editor.dependsOnHint',
    add: 'items.editor.dependencyAdd',
    remove: 'items.editor.dependencyRemove',
    offerCreateHint: 'items.editor.dependencyOfferCreateHint',
    offerRestoreHint: 'items.editor.dependencyOfferRestoreHint',
  },
  [DEPENDENCY_LINK_COMPANION]: {
    title: 'items.editor.companions',
    hint: 'items.editor.companionsHint',
    add: 'items.editor.companionAdd',
    remove: 'items.editor.companionRemove',
    offerCreateHint: 'items.editor.companionOfferCreateHint',
    offerRestoreHint: 'items.editor.companionOfferRestoreHint',
  },
}

const copy = computed(() => COPY[props.direction])

/**
 * Which end this section stands on. The test ids are spelled out per end in
 * the template rather than kept in {@link COPY}, so a spec's id can be found
 * in the source and checked by the testid gate.
 */
const main = computed(() => props.direction === DEPENDENCY_LINK_MAIN)

/** The two modes, worded by the catalogue rather than by their stored value. */
const MODE_LABEL: Record<DependencyMode, MessageKey> = {
  [DEPENDENCY_MODE_REQUIRED]: 'items.editor.dependencyRequired',
  [DEPENDENCY_MODE_SUGGESTED]: 'items.editor.dependencySuggested',
}

const rows = computed(() =>
  main.value
    ? masterStore.getItemDependencies(props.itemId)
    : masterStore.getCompanionDependencies(props.itemId),
)

function otherId(dep: { item_id: string; depends_on_item_id: string }): string {
  return linkedEnd(props.direction, dep)
}

function nameOf(id: string): string {
  return masterStore.getItem(id)?.name ?? t('items.editor.unknownItem')
}

// --- The rows ---

function onModeChange(dependencyId: string, mode: DependencyMode) {
  const dep = rows.value.find((d) => d.id === dependencyId)
  if (dep) orchestrator.dependencies.updateItemDependency(dep, { mode })
}

function onRemove(dependencyId: string) {
  orchestrator.dependencies.deleteItemDependency(dependencyId)
}

// --- The picker ---

const showPicker = ref(false)
const search = ref('')
const error = ref<DependencyCycleError | null>(null)

/** Joins the hops of a rejected cycle for FR-20.1's error line. */
const CYCLE_PATH_SEPARATOR = ' → '

/** The domain reports the fault; this section is what words it (NFR-4.12). */
const errorText = computed(() => {
  const fault = error.value
  if (!fault) return ''
  return fault.reason === 'self'
    ? t('items.editor.dependencySelf', { name: fault.names[0] ?? '' })
    : t('items.editor.dependencyCycle', { path: fault.names.join(CYCLE_PATH_SEPARATOR) })
})

/** The items still pickable: minus this one and minus the far ends already linked. */
const pickable = computed(() =>
  dependencyOffer(
    search.value ? masterStore.searchItems(search.value) : masterStore.activeItemList,
    {
      excludeId: props.itemId,
      takenIds: new Set(rows.value.map(otherId)),
    },
  ),
)

/**
 * The query offered as a new item, or as a retired one back — the inventory
 * search's rule, so „Ersatzbatterien" is created here exactly when M9 would
 * offer to create it. Not before the partition has arrived (ADR-033).
 */
const offer = computed(() =>
  showPicker.value && orchestrator.masterDataLoaded()
    ? searchOffer(search.value, masterStore.activeItemList, masterStore.retiredItemList)
    : null,
)

function closePicker() {
  showPicker.value = false
  search.value = ''
}

/**
 * Reports whether linking the picked item would close a cycle, and says so on
 * screen if it would — a cycle cannot be persisted (save-time validation like
 * FR-1.5). The stored row is the same edge from either end, so the validator
 * is asked about that edge and not about the direction it was declared from.
 */
function refused(pickedId: string): boolean {
  error.value = dependencyCycleError(
    masterStore.dependencyList,
    linkEdge(props.direction, props.itemId, pickedId),
    nameOf,
  )
  return error.value !== null
}

function link(pickedId: string) {
  closePicker()
  const edge = linkEdge(props.direction, props.itemId, pickedId)
  orchestrator.dependencies.addItemDependency(edge.item_id, edge.depends_on_item_id)
}

function onPick(pickedId: string) {
  if (!refused(pickedId)) link(pickedId)
}

/**
 * Takes the picker's offer. A retired item keeps its dependency rows, so the
 * edge is checked before the restore: a refused declaration must not leave
 * the item un-retired as a side effect.
 */
function takeOffer() {
  const current = offer.value
  if (!current) return
  if (current.kind === OFFER_CREATE) {
    emit('create', current.name)
    return
  }
  if (refused(current.id) || !orchestrator.masterData.restoreMasterItem(current.id)) return
  link(current.id)
}

/** The item the page created for {@link takeOffer}: it has no edges yet, so this one cannot close a cycle. */
function linkCreated(id: string) {
  error.value = null
  link(id)
}

defineExpose({ linkCreated })
</script>

<template>
  <SectionHead
    :title="t(copy.title)"
    :data-testid="main ? 'm10-section-depends' : 'm10-section-companions'"
  />
  <p class="jp-section-hint">{{ t(copy.hint, { name: itemName }) }}</p>

  <IonList v-if="rows.length > 0">
    <IonItem v-for="dep in rows" :key="dep.id">
      <!-- A link on the name, not a button row: the row also holds the mode
           select and the remove button, and a tap on either must not navigate. -->
      <IonLabel
        :data-testid="`${main ? 'm10-dependency' : 'm10-companion'}-${nameOf(otherId(dep))}`"
      >
        <RouterLink
          :to="itemPath(otherId(dep))"
          class="dep-link"
          :data-testid="`${main ? 'm10-dependency' : 'm10-companion'}-open-${nameOf(otherId(dep))}`"
        >
          {{ nameOf(otherId(dep)) }}
        </RouterLink>
      </IonLabel>
      <IonSelect
        :value="dep.mode"
        interface="popover"
        slot="end"
        :data-testid="`${main ? 'm10-dependency' : 'm10-companion'}-mode-${nameOf(otherId(dep))}`"
        @ionChange="(e: CustomEvent) => onModeChange(dep.id, e.detail.value)"
      >
        <IonSelectOption v-for="mode in DEPENDENCY_MODES" :key="mode" :value="mode">
          {{ t(MODE_LABEL[mode]) }}
        </IonSelectOption>
      </IonSelect>
      <IonButton
        fill="clear"
        color="danger"
        slot="end"
        :aria-label="t(copy.remove)"
        :data-testid="`${main ? 'm10-dependency' : 'm10-companion'}-remove-${nameOf(otherId(dep))}`"
        @click="onRemove(dep.id)"
      >
        <IonIcon slot="icon-only" :icon="trashOutline" />
      </IonButton>
    </IonItem>
  </IonList>

  <IonNote
    v-if="error"
    color="danger"
    class="field-error"
    :data-testid="`${main ? 'm10-dependency' : 'm10-companion'}-error`"
  >
    <IonIcon :icon="warningOutline" />
    {{ errorText }}
  </IonNote>

  <IonButton
    v-if="!showPicker"
    expand="block"
    fill="outline"
    :data-testid="main ? 'm10-add-dependency' : 'm10-add-companion'"
    @click="showPicker = true"
  >
    <IonIcon slot="start" :icon="addOutline" />
    {{ t(copy.add) }}
  </IonButton>

  <div v-else class="picker">
    <IonSearchbar
      :value="search"
      :data-testid="`${main ? 'm10-dependency' : 'm10-companion'}-search`"
      :placeholder="t('items.editor.dependencySearchPlaceholder')"
      :debounce="200"
      @ionInput="(e: CustomEvent) => (search = e.detail.value ?? '')"
    />
    <!-- FR-24.11: above the hits, where the keyboard leaves it reachable. -->
    <SearchOfferButton
      v-if="offer"
      :offer="offer"
      :testid="`${main ? 'm10-dependency' : 'm10-companion'}-offer`"
      :create-hint="t(copy.offerCreateHint, { name: itemName })"
      :restore-hint="t(copy.offerRestoreHint)"
      @take="takeOffer"
    />
    <!-- The offer answers a query with no hits on its own; an empty list under it is a stray bar. -->
    <IonList v-if="pickable.length > 0 || !offer">
      <IonItem
        v-for="row in pickable"
        :key="row.id"
        button
        :data-testid="`${main ? 'm10-dependency-main' : 'm10-companion-pick'}-${row.name}`"
        @click="onPick(row.id)"
      >
        <IonLabel>{{ row.name }}</IonLabel>
      </IonItem>
      <IonItem v-if="pickable.length === 0" lines="none">
        <IonLabel color="medium">{{ t('items.editor.dependencyNoMatch') }}</IonLabel>
      </IonItem>
    </IonList>
    <IonButton
      fill="clear"
      expand="block"
      :data-testid="`${main ? 'm10-dependency' : 'm10-companion'}-cancel`"
      @click="closePicker()"
    >
      {{ t('common.cancel') }}
    </IonButton>
  </div>
</template>

<style scoped>
.picker {
  border: 1px solid var(--ion-color-primary);
  border-radius: var(--jp-r-sm);
  padding: 8px;
  margin-top: 8px;
}

.field-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--jp-text-sm);
  margin: 8px 0;
}

/* FR-20.1: a related item's name leads to that item. The action role, so it
   reads as a way somewhere rather than as a label. */
.dep-link {
  color: var(--jp-action);
  text-decoration: none;
}
</style>
