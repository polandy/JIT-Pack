<script setup lang="ts">
/**
 * M10 — Item Editor (§3.24, FR-24.1/24.5)
 *
 * Two modes on one screen.
 *
 * **Creating** (FR-24.5) is a *minimal* form: an intro line, the focused
 * name, tags, and weight/price behind "Mehr ▾". The existing-item sections
 * — photo, dependencies, companions — are **absent, not emptied**: an item
 * that does not exist yet cannot have a photo or a companion, and rendering
 * them blank was noise. "Artikel anlegen ✓" commits, and a missing name is
 * caught with a hint rather than a disabled button the user must diagnose.
 *
 * **Editing** commits every change immediately (G-5), with the FR-25.15
 * indicator confirming local capture — there is no save button.
 *
 * The tag control is a **search field, not a chip cloud** (FR-24.1): typing
 * filters, assigned tags stay pinned above the matches, and a name that
 * matches nothing is created and assigned in one step — the same
 * filter-or-create idiom as the quick-add.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonNote,
  IonSearchbar,
  alertController,
} from '@ionic/vue'
import {
  addOutline,
  cameraOutline,
  checkmarkOutline,
  chevronDownOutline,
  closeOutline,
  happyOutline,
  trashOutline,
  warningOutline,
} from 'ionicons/icons'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dependencyCycleError, type DependencyCycleError } from '@/domain/dependencies'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import SaveIndicator from '@/components/global/SaveIndicator.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import MarkPicker from '@/components/items/MarkPicker.vue'
import { t } from '@/i18n'
import { DELETION_RETIRE } from '@/domain/masterDeletion'
import type { DependencyMode, Tag } from '@/types/domain'

const props = defineProps<{ itemId?: string }>()

const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const route = useRoute()
const router = useRouter()

/** FR-24.5: the same component, in its minimal mode. */
const isCreating = computed(() => route.name === 'item-create')

const item = computed(() => (props.itemId ? masterStore.getItem(props.itemId) : undefined))

// FR-25.15: the indicator reads the orchestrator's state — an open Local
// Mode write reports as `syncing` (FR-19.2), so "settled" is observed.
const saveState = computed(() => orchestrator.syncStatus.state.value)

// --- Creation draft (FR-24.5) ---

const draftName = ref('')
const draftTagIds = ref<string[]>([])
// FR-28.1: staged while creating, live once saved — like the tags above it.
const draftIcon = ref<string | null>(null)
const draftWeight = ref('')
const draftPrice = ref('')
const showMore = ref(false)
const nameError = ref('')
const nameInput = ref<{ $el: HTMLElement } | null>(null)

onMounted(async () => {
  if (!isCreating.value) return
  await nextTick()
  // The name is the only required field, so it takes the caret.
  const native = await (
    nameInput.value?.$el as HTMLIonInputElement | undefined
  )?.getInputElement?.()
  native?.focus()
})

// --- Tags (FR-24.1) ---

const tagQuery = ref('')

/** Assigned tags, primary first — staged while creating, live once saved. */
const assignedTags = computed<Tag[]>(() => {
  if (isCreating.value) {
    const byId = new Map(masterStore.tagList.map((tag) => [tag.id, tag]))
    return draftTagIds.value.map((id) => byId.get(id)).filter((tag): tag is Tag => !!tag)
  }
  return props.itemId ? masterStore.getItemTags(props.itemId) : []
})

const assignedIds = computed(() => new Set(assignedTags.value.map((tag) => tag.id)))

/**
 * With no query the offer row is a shelf, not the whole vocabulary (UX-14):
 * a grown instance carries dozens of tags, and rendering them all made every
 * item form scroll. Two chip rows at phone width; the tail names the rest.
 */
const TAG_OFFER_CAP = 8

/** Unassigned tags matching the query — assigned ones stay pinned above. */
const unassignedMatches = computed(() => {
  const q = tagQuery.value.trim().toLowerCase()
  return masterStore.tagList.filter(
    (tag) => !assignedIds.value.has(tag.id) && (!q || tag.name.toLowerCase().includes(q)),
  )
})

const tagMatches = computed(() =>
  tagQuery.value.trim() ? unassignedMatches.value : unassignedMatches.value.slice(0, TAG_OFFER_CAP),
)

/** What the shelf holds back — zero while a query is filtering. */
const hiddenOfferCount = computed(() => unassignedMatches.value.length - tagMatches.value.length)

const tagSearch = ref<{ $el: HTMLElement } | null>(null)

/** The shelf's tail hands over to the search — the way past the cap. */
async function focusTagSearch() {
  const native = await (
    tagSearch.value?.$el as HTMLIonSearchbarElement | undefined
  )?.getInputElement?.()
  native?.focus()
}

/** True when the typed name is not an existing tag — the ＋ offer. */
const canCreateTag = computed(() => {
  const q = tagQuery.value.trim()
  if (!q) return false
  return !masterStore.tagList.some((tag) => tag.name.toLowerCase() === q.toLowerCase())
})

function assign(tagId: string) {
  if (isCreating.value) {
    if (!draftTagIds.value.includes(tagId)) draftTagIds.value = [...draftTagIds.value, tagId]
  } else if (props.itemId) {
    orchestrator.assignTag(props.itemId, tagId)
  }
  tagQuery.value = ''
}

function unassign(tagId: string) {
  if (isCreating.value) {
    draftTagIds.value = draftTagIds.value.filter((id) => id !== tagId)
    return
  }
  const assignment = masterStore.itemTagList.find(
    (a) => a.item_id === props.itemId && a.tag_id === tagId,
  )
  if (assignment) orchestrator.unassignTag(assignment.id)
}

/** Filter-or-create: an unmatched name becomes a tag and is assigned. */
function commitTagQuery() {
  const name = tagQuery.value.trim()
  if (!name) return
  const existing = masterStore.tagList.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
  assign(existing ? existing.id : orchestrator.createTag(name))
}

// --- Creating ---

async function createItem() {
  const name = draftName.value.trim()
  if (!name) {
    // A hint, not a disabled button: the user should not have to work out
    // why nothing happens (FR-24.5).
    nameError.value = t('items.editor.nameMissing')
    return
  }
  // The name identifies the item since FR-24.1 dropped the category from
  // its UNIQUE — report the clash here rather than let the push reject.
  if (masterStore.activeItemList.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
    nameError.value = t('items.editor.nameTaken', { name })
    return
  }
  nameError.value = ''

  const weight = parseInt(draftWeight.value, 10)
  const price = parseFloat(draftPrice.value)
  const id = orchestrator.createMasterItem(name, {
    weightGrams: isNaN(weight) ? null : weight,
    valueCents: isNaN(price) ? null : Math.round(price * 100),
    icon: draftIcon.value,
  })
  for (const tagId of draftTagIds.value) orchestrator.assignTag(id, tagId)

  // No toast. The screen itself is the confirmation and a better one: the
  // header becomes the item's name, the FR-25.15 indicator settles on ✓,
  // and the form turns into the editor. A bottom toast here covered the
  // tab bar outright (seen on rendered pixels at 390 px), and the M4
  // positionAnchor cure does not apply — the anchor is M9's FAB, and this
  // toast shows while the user is still on M10, where there is none.
  //
  // replace, not push: "back" from the saved item belongs on the
  // inventory, not on a creation form for an item that now exists.
  await router.replace(`/items/${id}`)
}

// --- Editing an existing item ---

function updateField(field: string, value: unknown) {
  if (!item.value) return
  orchestrator.updateMasterItem(item.value, { [field]: value })
}

// --- The mark (FR-28.1/28.2) ---

const pickerOpen = ref(false)

/** What the editor shows and what the picker's removal offer keys off. */
const mark = computed(() => (isCreating.value ? draftIcon.value : (item.value?.icon ?? null)))

/**
 * The name the suggestion reads. While creating that is the draft, so the
 * offer follows the field as it is typed; afterwards it is the saved name.
 */
const markName = computed(() => (isCreating.value ? draftName.value : (item.value?.name ?? '')))

function setMark(next: string | null) {
  if (isCreating.value) {
    draftIcon.value = next
    return
  }
  updateField('icon', next)
}

function onNameChange(event: CustomEvent) {
  const val = (event.target as HTMLIonInputElement).value as string
  if (val?.trim()) updateField('name', val.trim())
}

function onWeightChange(event: CustomEvent) {
  const val = parseInt((event.target as HTMLIonInputElement).value as string, 10)
  updateField('weight_grams', isNaN(val) ? null : val)
}

function onValueChange(event: CustomEvent) {
  const val = parseFloat((event.target as HTMLIonInputElement).value as string)
  updateField('value_cents', isNaN(val) ? null : Math.round(val * 100))
}

// --- Reference photo (Addendum 3.22, FR-22.1/22.5) ---

const photoInput = ref<HTMLInputElement | null>(null)
const photoUrl = ref<string | null>(null)
const photoBusy = ref(false)

/** Revoke any object URL we own before replacing/clearing it — Server Mode
 * URLs are plain strings, Local Mode ones need releasing. */
function releasePhotoUrl() {
  if (photoUrl.value?.startsWith('blob:')) URL.revokeObjectURL(photoUrl.value)
  photoUrl.value = null
}

watch(
  () => item.value?.image_hash,
  async () => {
    releasePhotoUrl()
    if (item.value) photoUrl.value = await orchestrator.itemImageUrl(item.value)
  },
  { immediate: true },
)

onUnmounted(releasePhotoUrl)

async function onPhotoFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !item.value) return
  photoBusy.value = true
  try {
    await orchestrator.setItemImage(item.value, file)
  } finally {
    photoBusy.value = false
    if (photoInput.value) photoInput.value.value = ''
  }
}

async function removePhoto() {
  if (!item.value) return
  photoBusy.value = true
  try {
    await orchestrator.deleteItemImage(item.value)
  } finally {
    photoBusy.value = false
  }
}

// --- Depends on / Companions (FR-20.1/20.4) ---

const dependsOn = computed(() =>
  props.itemId ? masterStore.getItemDependencies(props.itemId) : [],
)
const companions = computed(() =>
  props.itemId ? masterStore.getCompanionDependencies(props.itemId) : [],
)

const showMainPicker = ref(false)
const mainSearch = ref('')
const dependencyError = ref<DependencyCycleError | null>(null)

/** Joins the hops of a rejected cycle for FR-20.1's error line. */
const CYCLE_PATH_SEPARATOR = ' → '

/** The domain reports the fault; this screen is what words it (NFR-4.12). */
const dependencyErrorText = computed(() => {
  const fault = dependencyError.value
  if (!fault) return ''
  return fault.reason === 'self'
    ? t('items.editor.dependencySelf', { name: fault.names[0] ?? '' })
    : t('items.editor.dependencyCycle', { path: fault.names.join(CYCLE_PATH_SEPARATOR) })
})

const pickableMains = computed(() => {
  const taken = new Set(dependsOn.value.map((d) => d.depends_on_item_id))
  const pool = mainSearch.value
    ? masterStore.searchItems(mainSearch.value)
    : masterStore.activeItemList
  return pool.filter((i) => i.id !== props.itemId && !taken.has(i.id)).slice(0, 10)
})

function itemName(id: string): string {
  return masterStore.getItem(id)?.name ?? t('items.editor.unknownItem')
}

/** The two dependency modes, worded by the catalogue rather than by their stored value. */
function modeLabel(mode: DependencyMode): string {
  return mode === 'required'
    ? t('items.editor.dependencyRequired')
    : t('items.editor.dependencySuggested')
}

function closeMainPicker() {
  showMainPicker.value = false
  mainSearch.value = ''
}

function onAddDependency(mainItemId: string) {
  if (!props.itemId) return
  // A cycle cannot be persisted (save-time validation like FR-1.5).
  const error = dependencyCycleError(
    masterStore.dependencyList,
    { item_id: props.itemId, depends_on_item_id: mainItemId },
    itemName,
  )
  if (error) {
    dependencyError.value = error
    return
  }
  dependencyError.value = null
  closeMainPicker()
  orchestrator.addItemDependency(props.itemId, mainItemId)
}

function onDependencyModeChange(dependencyId: string, mode: string) {
  const dep = dependsOn.value.find((d) => d.id === dependencyId)
  if (dep) orchestrator.updateItemDependency(dep, { mode })
}

function onRemoveDependency(dependencyId: string) {
  orchestrator.deleteItemDependency(dependencyId)
}

/**
 * FR-24.3: which of the two deletions this item will get, worked out before
 * the user confirms rather than reported afterwards. `certain` is false only
 * where this device cannot see every trip (ADR-032).
 */
const deletionOutlook = computed(() =>
  props.itemId ? orchestrator.masterItemDeletionOutlook(props.itemId) : null,
)

const deletionSentence = computed(() => {
  const outlook = deletionOutlook.value
  if (!outlook) return ''
  if (outlook.kind === DELETION_RETIRE) return t('items.editor.deleteRetire')
  return outlook.certain ? t('items.editor.deleteRemove') : t('items.editor.deleteRemoveMaybe')
})

async function onDelete() {
  const current = item.value
  if (!current) return
  const alert = await alertController.create({
    header: t('items.editor.deleteConfirm', { name: current.name }),
    message: deletionSentence.value,
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      {
        text: t('common.delete'),
        role: 'destructive',
        handler: () => {
          orchestrator.deleteMasterItem(current.id)
          router.replace({ name: 'items' })
        },
      },
    ],
  })
  await alert.present()
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => (isCreating.value ? t('items.new') : (item.value?.name ?? t('items.title'))))
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <div v-if="!isCreating && !item" class="empty-state">
        <p>{{ t('items.editor.notFound') }}</p>
      </div>

      <template v-else>
        <!-- FR-24.5: says what is actually required, before anything is asked. -->
        <p v-if="isCreating" class="intro" data-testid="m10-new-hint">
          {{ t('items.editor.newHint') }}
        </p>

        <div v-else class="edit-head">
          <SaveIndicator :state="saveState" />
        </div>

        <IonList>
          <IonItem>
            <!-- G-15/FR-28.1: the mark sits left of the name field, and never
                 blocks — creating works with it untouched, which is what keeps
                 absence a first-class state rather than a gap people fill
                 with 📦. -->
            <button
              slot="start"
              class="mark-button"
              data-testid="m10-mark"
              :aria-label="t('marks.choose')"
              @click="pickerOpen = true"
            >
              <ItemMark v-if="mark" :mark="mark" surface="plain" :size="28" />
              <IonIcon v-else :icon="happyOutline" aria-hidden="true" />
            </button>
            <IonLabel position="stacked">{{ t('items.editor.name') }}</IonLabel>
            <IonInput
              v-if="isCreating"
              ref="nameInput"
              :value="draftName"
              data-testid="m10-name"
              :placeholder="t('items.editor.namePlaceholder')"
              @ionInput="(e: CustomEvent) => (draftName = (e.detail.value as string) ?? '')"
              @keyup.enter="createItem"
            />
            <IonInput v-else :value="item!.name" data-testid="m10-name" @ionBlur="onNameChange" />
          </IonItem>
        </IonList>

        <MarkPicker
          :is-open="pickerOpen"
          :name="markName"
          :current="mark"
          @pick="setMark"
          @close="pickerOpen = false"
        />

        <IonNote v-if="nameError" color="danger" class="field-error" data-testid="m10-name-error">
          <IonIcon :icon="warningOutline" />
          {{ nameError }}
        </IonNote>

        <!-- Tags: a search field, not a chip cloud (FR-24.1). -->
        <h2 class="section-title jp-eyebrow">{{ t('items.editor.tags') }}</h2>

        <IonSearchbar
          ref="tagSearch"
          :value="tagQuery"
          data-testid="m10-tag-search"
          :placeholder="t('items.editor.tagSearchPlaceholder')"
          :debounce="0"
          @ionInput="(e: CustomEvent) => (tagQuery = (e.detail.value as string) ?? '')"
          @keyup.enter="commitTagQuery"
        />

        <div class="chips">
          <!-- Assigned first and always visible: the filter must never hide
               what the item already carries. -->
          <button
            v-for="tag in assignedTags"
            :key="tag.id"
            type="button"
            class="chip assigned"
            :data-testid="`m10-tag-assigned-${tag.name}`"
            @click="unassign(tag.id)"
          >
            {{ tag.name }}
            <IonIcon :icon="closeOutline" />
          </button>

          <button
            v-for="tag in tagMatches"
            :key="tag.id"
            type="button"
            class="chip"
            :data-testid="`m10-tag-offer-${tag.name}`"
            @click="assign(tag.id)"
          >
            {{ tag.name }}
          </button>

          <button
            v-if="hiddenOfferCount > 0"
            type="button"
            class="chip more"
            data-testid="m10-tag-more"
            @click="focusTagSearch"
          >
            {{ t('items.editor.tagMoreOffers', { n: hiddenOfferCount }) }}
          </button>

          <button
            v-if="canCreateTag"
            type="button"
            class="chip create"
            data-testid="m10-tag-create"
            @click="commitTagQuery"
          >
            <IonIcon :icon="addOutline" />
            {{ t('items.editor.tagCreate', { name: tagQuery.trim() }) }}
          </button>
        </div>

        <p class="tag-summary" data-testid="m10-tag-summary">
          <template v-if="assignedTags.length > 0">
            {{
              t('items.editor.tagFiledUnder', {
                tags: assignedTags.map((tag) => tag.name).join(', '),
                primary: assignedTags[0]!.name,
              })
            }}
          </template>
          <template v-else>{{ t('items.editor.tagNone') }}</template>
        </p>

        <!-- FR-24.5: weight and price are folded away while creating. -->
        <IonButton
          v-if="isCreating && !showMore"
          expand="block"
          fill="outline"
          data-testid="m10-more"
          @click="showMore = true"
        >
          {{ t('items.editor.more') }}
          <IonIcon slot="end" :icon="chevronDownOutline" />
        </IonButton>

        <IonList v-if="!isCreating || showMore">
          <IonItem>
            <IonLabel position="stacked">{{ t('items.editor.weight') }}</IonLabel>
            <IonInput
              v-if="isCreating"
              type="number"
              :value="draftWeight"
              data-testid="m10-weight"
              placeholder="0"
              @ionInput="(e: CustomEvent) => (draftWeight = (e.detail.value as string) ?? '')"
            />
            <IonInput
              v-else
              type="number"
              :value="item!.weight_grams ?? ''"
              data-testid="m10-weight"
              placeholder="0"
              @ionBlur="onWeightChange"
            />
          </IonItem>

          <IonItem>
            <IonLabel position="stacked">{{ t('items.editor.price') }}</IonLabel>
            <IonInput
              v-if="isCreating"
              type="number"
              step="0.01"
              :value="draftPrice"
              data-testid="m10-price"
              placeholder="0.00"
              @ionInput="(e: CustomEvent) => (draftPrice = (e.detail.value as string) ?? '')"
            />
            <IonInput
              v-else
              type="number"
              step="0.01"
              :value="item!.value_cents ? (item!.value_cents / 100).toFixed(2) : ''"
              data-testid="m10-price"
              placeholder="0.00"
              @ionBlur="onValueChange"
            />
          </IonItem>
        </IonList>

        <IonButton
          v-if="isCreating"
          expand="block"
          class="create-button"
          data-testid="m10-create"
          @click="createItem"
        >
          <IonIcon slot="start" :icon="checkmarkOutline" />
          {{ t('items.editor.create') }}
        </IonButton>

        <!-- Everything below exists only once the item does (FR-24.5). -->
        <template v-if="!isCreating && item">
          <h2 class="section-title jp-eyebrow" data-testid="m10-section-photo">
            {{ t('items.editor.photo') }}
          </h2>
          <p class="section-hint">{{ t('items.editor.photoHint') }}</p>

          <div class="photo-section">
            <img
              v-if="photoUrl"
              :src="photoUrl"
              :alt="t('items.editor.photoAlt', { name: item.name })"
              class="photo-preview"
            />
            <div v-else class="photo-placeholder">
              <IonIcon :icon="cameraOutline" />
            </div>

            <div class="photo-actions">
              <input ref="photoInput" type="file" accept="image/*" hidden @change="onPhotoFile" />
              <IonButton
                expand="block"
                fill="outline"
                :disabled="photoBusy"
                @click="photoInput?.click()"
              >
                <IonIcon slot="start" :icon="cameraOutline" />
                {{ item.image_hash ? t('items.editor.photoReplace') : t('items.editor.photoAdd') }}
              </IonButton>
              <IonButton
                v-if="item.image_hash"
                expand="block"
                fill="clear"
                color="danger"
                :disabled="photoBusy"
                @click="removePhoto"
              >
                <IonIcon slot="start" :icon="trashOutline" />
                {{ t('items.editor.photoRemove') }}
              </IonButton>
            </div>
          </div>

          <h2 class="section-title jp-eyebrow" data-testid="m10-section-depends">
            {{ t('items.editor.dependsOn') }}
          </h2>
          <p class="section-hint">{{ t('items.editor.dependsOnHint') }}</p>

          <IonList v-if="dependsOn.length > 0">
            <IonItem v-for="dep in dependsOn" :key="dep.id">
              <IonLabel>{{ itemName(dep.depends_on_item_id) }}</IonLabel>
              <IonSelect
                :value="dep.mode"
                interface="popover"
                slot="end"
                @ionChange="(e: CustomEvent) => onDependencyModeChange(dep.id, e.detail.value)"
              >
                <IonSelectOption value="required">{{ modeLabel('required') }}</IonSelectOption>
                <IonSelectOption value="suggested">{{ modeLabel('suggested') }}</IonSelectOption>
              </IonSelect>
              <IonButton
                fill="clear"
                color="danger"
                slot="end"
                :aria-label="t('items.editor.dependencyRemove')"
                @click="onRemoveDependency(dep.id)"
              >
                <IonIcon slot="icon-only" :icon="trashOutline" />
              </IonButton>
            </IonItem>
          </IonList>

          <IonNote v-if="dependencyError" color="danger" class="field-error">
            <IonIcon :icon="warningOutline" />
            {{ dependencyErrorText }}
          </IonNote>

          <IonButton
            v-if="!showMainPicker"
            expand="block"
            fill="outline"
            data-testid="m10-add-dependency"
            @click="showMainPicker = true"
          >
            <IonIcon slot="start" :icon="addOutline" />
            {{ t('items.editor.dependencyAdd') }}
          </IonButton>

          <div v-else class="main-picker">
            <IonSearchbar
              :value="mainSearch"
              :placeholder="t('items.editor.dependencySearchPlaceholder')"
              :debounce="200"
              @ionInput="(e: CustomEvent) => (mainSearch = e.detail.value ?? '')"
            />
            <IonList>
              <IonItem
                v-for="main in pickableMains"
                :key="main.id"
                button
                :data-testid="`m10-dependency-main-${main.name}`"
                @click="onAddDependency(main.id)"
              >
                <IonLabel>{{ main.name }}</IonLabel>
              </IonItem>
              <IonItem v-if="pickableMains.length === 0" lines="none">
                <IonLabel color="medium">{{ t('items.editor.dependencyNoMatch') }}</IonLabel>
              </IonItem>
            </IonList>
            <IonButton fill="clear" expand="block" @click="closeMainPicker()">
              {{ t('common.cancel') }}
            </IonButton>
          </div>

          <section class="jp-card delete-card" data-testid="m10-section-delete">
            <h2 class="section-title jp-eyebrow">{{ t('items.editor.delete') }}</h2>
            <p class="section-hint" data-testid="m10-delete-usage">
              {{ t('items.editor.deleteUsage', { n: deletionOutlook?.references ?? 0 }) }}
            </p>
            <p class="section-hint" data-testid="m10-delete-outlook">{{ deletionSentence }}</p>
            <IonButton
              fill="outline"
              color="danger"
              expand="block"
              data-testid="m10-delete"
              @click="onDelete()"
            >
              <IonIcon slot="start" :icon="trashOutline" />
              {{ t('items.editor.delete') }}
            </IonButton>
          </section>

          <template v-if="companions.length > 0">
            <h2 class="section-title jp-eyebrow">{{ t('items.editor.companions') }}</h2>
            <p class="section-hint">
              {{ t('items.editor.companionsHint', { name: item.name }) }}
            </p>
            <IonList>
              <IonItem v-for="dep in companions" :key="dep.id" lines="none">
                <IonLabel>{{ itemName(dep.item_id) }}</IonLabel>
                <IonNote slot="end">{{ modeLabel(dep.mode) }}</IonNote>
              </IonItem>
            </IonList>
          </template>
        </template>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.empty-state {
  display: flex;
  justify-content: center;
  padding: 48px;
  color: var(--ion-color-medium);
}

.intro {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
  margin: 4px 0 12px;
}

.edit-head {
  display: flex;
  justify-content: flex-end;
}

.delete-card {
  margin-top: 24px;
  padding: 16px;
}

.section-title {
  margin: 24px 0 4px;
}

.section-hint {
  font-size: var(--jp-text-sm);
  color: var(--ion-color-medium);
  margin: 0 0 8px;
}

.field-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--jp-text-sm);
  margin: 8px 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 11px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
}

.chip.assigned {
  background: var(--jp-action);
  border-color: var(--jp-action);
  color: var(--ion-color-primary-contrast);
}

.chip.create {
  border-style: dashed;
  color: var(--jp-brand);
}

/* The tail is a hand-over, not a tag: quieter than the offers around it. */
.chip.more {
  border-style: dashed;
  background: transparent;
}

.tag-summary {
  font-size: var(--jp-text-xs);
  color: var(--ion-color-medium);
  margin: 4px 0 12px;
}

.create-button {
  margin-top: 18px;
}

.photo-section {
  display: flex;
  gap: 16px;
  align-items: center;
}

.photo-preview,
.photo-placeholder {
  width: 96px;
  height: 96px;
  border-radius: var(--jp-r-md);
  flex: none;
  object-fit: cover;
  background: var(--ion-color-light);
}

.photo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ion-color-medium);
  font-size: var(--jp-icon-xl);
}

.photo-actions {
  flex: 1;
}

.main-picker {
  border: 1px solid var(--ion-color-primary);
  border-radius: var(--jp-r-sm);
  padding: 8px;
  margin-top: 8px;
}

/* G-15: the same control M8 carries, so the two editors read alike. The
   empty state is an outline icon rather than a pale emoji — chrome must not
   borrow the mark's face (FR-28.5). */
.mark-button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: none;
  margin-inline-end: 12px;
  border: none;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}
</style>
