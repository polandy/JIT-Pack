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
} from '@ionic/vue'
import {
  addOutline,
  cameraOutline,
  checkmarkOutline,
  chevronDownOutline,
  closeOutline,
  trashOutline,
  warningOutline,
} from 'ionicons/icons'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dependencyCycleError } from '@/domain/dependencies'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import SaveIndicator from '@/components/global/SaveIndicator.vue'
import { t } from '@/i18n'
import type { Tag } from '@/types/domain'

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

/** Unassigned tags matching the query — assigned ones stay pinned above. */
const tagMatches = computed(() => {
  const q = tagQuery.value.trim().toLowerCase()
  return masterStore.tagList.filter(
    (tag) => !assignedIds.value.has(tag.id) && (!q || tag.name.toLowerCase().includes(q)),
  )
})

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
  if (masterStore.itemList.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
    nameError.value = t('items.editor.nameTaken', { name })
    return
  }
  nameError.value = ''

  const weight = parseInt(draftWeight.value, 10)
  const price = parseFloat(draftPrice.value)
  const id = orchestrator.createMasterItem(name, {
    weightGrams: isNaN(weight) ? null : weight,
    valueCents: isNaN(price) ? null : Math.round(price * 100),
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
const dependencyError = ref('')

const pickableMains = computed(() => {
  const taken = new Set(dependsOn.value.map((d) => d.depends_on_item_id))
  const pool = mainSearch.value ? masterStore.searchItems(mainSearch.value) : masterStore.itemList
  return pool.filter((i) => i.id !== props.itemId && !taken.has(i.id)).slice(0, 10)
})

function itemName(id: string): string {
  return masterStore.getItem(id)?.name ?? 'Unknown item'
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
  dependencyError.value = ''
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

        <IonNote v-if="nameError" color="danger" class="field-error" data-testid="m10-name-error">
          <IonIcon :icon="warningOutline" />
          {{ nameError }}
        </IonNote>

        <!-- Tags: a search field, not a chip cloud (FR-24.1). -->
        <h2 class="section-title jp-eyebrow">{{ t('items.editor.tags') }}</h2>

        <IonSearchbar
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
          <h2 class="section-title jp-eyebrow">Photo</h2>
          <p class="section-hint">
            An optional reference photo, shared with everyone who sees this item. Resized
            automatically before upload.
          </p>

          <div class="photo-section">
            <img v-if="photoUrl" :src="photoUrl" alt="Item photo" class="photo-preview" />
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
                {{ item.image_hash ? 'Replace photo' : 'Add photo' }}
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
                Remove photo
              </IonButton>
            </div>
          </div>

          <h2 class="section-title jp-eyebrow">Depends on</h2>
          <p class="section-hint">
            Only packed when its main item is on the trip — required joins automatically, suggested
            asks first.
          </p>

          <IonList v-if="dependsOn.length > 0">
            <IonItem v-for="dep in dependsOn" :key="dep.id">
              <IonLabel>{{ itemName(dep.depends_on_item_id) }}</IonLabel>
              <IonSelect
                :value="dep.mode"
                interface="popover"
                slot="end"
                @ionChange="(e: CustomEvent) => onDependencyModeChange(dep.id, e.detail.value)"
              >
                <IonSelectOption value="required">Required</IonSelectOption>
                <IonSelectOption value="suggested">Suggested</IonSelectOption>
              </IonSelect>
              <IonButton fill="clear" color="danger" slot="end" @click="onRemoveDependency(dep.id)">
                <IonIcon slot="icon-only" :icon="trashOutline" />
              </IonButton>
            </IonItem>
          </IonList>

          <IonNote v-if="dependencyError" color="danger" class="field-error">
            <IonIcon :icon="warningOutline" />
            {{ dependencyError }}
          </IonNote>

          <IonButton
            v-if="!showMainPicker"
            expand="block"
            fill="outline"
            @click="showMainPicker = true"
          >
            <IonIcon slot="start" :icon="addOutline" />
            Add dependency
          </IonButton>

          <div v-else class="main-picker">
            <IonSearchbar
              :value="mainSearch"
              placeholder="Search items..."
              :debounce="200"
              @ionInput="(e: CustomEvent) => (mainSearch = e.detail.value ?? '')"
            />
            <IonList>
              <IonItem
                v-for="main in pickableMains"
                :key="main.id"
                button
                @click="onAddDependency(main.id)"
              >
                <IonLabel>{{ main.name }}</IonLabel>
              </IonItem>
              <IonItem v-if="pickableMains.length === 0" lines="none">
                <IonLabel color="medium">No matching items</IonLabel>
              </IonItem>
            </IonList>
            <IonButton fill="clear" expand="block" @click="closeMainPicker()">Cancel</IonButton>
          </div>

          <template v-if="companions.length > 0">
            <h2 class="section-title jp-eyebrow">Companions</h2>
            <p class="section-hint">These items depend on {{ item.name }}:</p>
            <IonList>
              <IonItem v-for="dep in companions" :key="dep.id" lines="none">
                <IonLabel>{{ itemName(dep.item_id) }}</IonLabel>
                <IonNote slot="end">{{ dep.mode }}</IonNote>
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
</style>
