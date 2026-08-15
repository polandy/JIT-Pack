<script setup lang="ts">
/**
 * M5 — item detail, redesigned 2026-08-14 (UI-Spec M5, Addendum §3.25).
 *
 * The screen is opened for one of three reasons: to pack the thing, to
 * note something about it, or to change one attribute. The old build gave
 * all three the same weight — nine equal sections, every one expanded —
 * which is why it read as a form rather than as a thing you handle.
 *
 * The order here is the order of those reasons:
 *   1. the row's identity, small photo included (FR-22.1),
 *   2. **packing**, as its own block and the largest control on screen,
 *   3. a read-only glance row for everything the sheet can also change,
 *   4. **preparation** and **notes**, the two things touched while packing,
 *   5. everything else behind *Details ▾* — the FR-25.7/FR-24.5 idiom.
 *
 * Every control commits immediately (G-5): there is no save button, and
 * `Details` folds only, so it must never look like it saved anything.
 */
import {
  IonButton,
  IonCheckbox,
  IonChip,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonToggle,
} from '@ionic/vue'
import {
  alertCircleOutline,
  bagHandleOutline,
  cartOutline,
  chevronForwardOutline,
  closeOutline,
  linkOutline,
  locationOutline,
  removeCircleOutline,
  timeOutline,
} from 'ionicons/icons'
import { computed, inject, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import ItemThumbnail from '@/components/items/ItemThumbnail.vue'
import SaveIndicator from '@/components/global/SaveIndicator.vue'
import QuantityStepper from '@/components/global/QuantityStepper.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { resolveDependencies, type SuggestedCompanion } from '@/domain/dependencies'
import { relativeStamp } from '@/domain/stamp'
import { currentLocale, t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ItemComment, ItemMode, ItemTodo, TripParticipant } from '@/types/domain'

const props = defineProps<{
  tripId: string
  itemId: string
  /** Trip members, so the packing record can name a person (FR-25.17). */
  participants: TripParticipant[]
}>()

const emit = defineEmits<{ close: [] }>()

const tripStore = useTripStore()
const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const item = computed(() => tripStore.getItems(props.tripId).find((i) => i.id === props.itemId))
const trip = computed(() => tripStore.getTrip(props.tripId))
const travelers = computed(() => tripStore.getTravelers(props.tripId))
const containers = computed(() => tripStore.getContainers(props.tripId))
const isActive = computed(() => trip.value?.status === 'active')

// FR-25.15: owed since the M5 rebuild — the sheet says its edits are
// captured on this device, distinct from G-2's server story.
const saveState = computed(() => orchestrator.syncStatus.state.value)

/** Folded by default: the sheet opens on what is used, not on everything. */
const detailsOpen = ref(false)

// The master item behind this trip row carries the reference photo
// (FR-22.1) — ad-hoc rows without a source_item_id simply have none.
const photoItem = computed(() => {
  const source = item.value?.source_item_id
  const master = source ? masterStore.getItem(source) : undefined
  return master?.image_hash ? master : undefined
})

const travelerName = computed(
  () => travelers.value.find((t) => t.id === item.value?.assigned_traveler_id)?.name ?? null,
)
const containerName = computed(
  () => containers.value.find((c) => c.id === item.value?.container_id)?.name ?? null,
)

function nameOf(userId: string | null): string | null {
  if (!userId) return null
  return props.participants.find((p) => p.user_id === userId)?.display_name ?? null
}

// --- Preparation (FR-7.3) ---
const itemTodos = computed(() => tripStore.getItemTodos(props.tripId, props.itemId))
const openTodoCount = computed(() => itemTodos.value.filter((t) => t.task_state === 'open').length)
const hasPrepWithPacked = computed(() => item.value?.state === 'packed' && openTodoCount.value > 0)
const newTodoText = ref('')

function addTodo() {
  const body = newTodoText.value.trim()
  if (!body) return
  orchestrator.addPrepTodo(props.tripId, props.itemId, 'current-user', body)
  newTodoText.value = ''
}

function toggleTodo(todo: ItemTodo) {
  if (todo.task_state === 'open') orchestrator.resolvePrepTodo(props.tripId, todo)
  else orchestrator.reopenPrepTodo(props.tripId, todo)
}

// --- Notes (FR-7.1/7.2) ---
const itemComments = computed(() => tripStore.getItemComments(props.tripId, props.itemId))
const newCommentText = ref('')

// G-4: a notification deep link (?comment=) scrolls to the referenced
// message and flashes it. The thread may still be syncing when we arrive,
// so this watches the list and fires once the target appears.
const route = useRoute()
const flashedCommentId = ref<string | null>(null)
watch(
  itemComments,
  (comments) => {
    const target = route.query.comment
    if (typeof target !== 'string' || flashedCommentId.value === target) return
    if (!comments.some((c) => c.id === target)) return
    flashedCommentId.value = target
    requestAnimationFrame(() => {
      document
        .getElementById(`comment-${target}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    setTimeout(() => {
      if (flashedCommentId.value === target) flashedCommentId.value = null
    }, 2400)
  },
  { immediate: true },
)

function addComment() {
  const body = newCommentText.value.trim()
  if (!body) return
  orchestrator.addComment(props.tripId, props.itemId, 'current-user', body)
  newCommentText.value = ''
}

/** FR-7.2: promoting a note moves it into the Preparation section above. */
function flagAsTask(comment: ItemComment) {
  orchestrator.flagCommentAsTask(props.tripId, comment)
}

// --- FR-20.4 companions ---
const suggestedCompanions = computed(() => {
  const source = item.value?.source_item_id
  if (!source) return []
  return resolveDependencies({
    onList: tripStore.getItems(props.tripId),
    dependencies: masterStore.getCompanionDependencies(source),
    masterItems: masterStore.itemList,
  }).suggested
})

function addCompanion(companion: SuggestedCompanion) {
  const master = masterStore.getItem(companion.item_id)
  orchestrator.quickAddItem(
    props.tripId,
    companion.name,
    {
      sourceItemId: companion.item_id,
      weightGrams: master?.weight_grams ?? null,
      valueCents: master?.value_cents ?? null,
    },
    isActive.value,
  )
}

// --- Edits (each commits on the spot, G-5) ---
function onModeChange(mode: ItemMode) {
  if (item.value) orchestrator.setMode(props.tripId, item.value, mode)
}
function onTravelerChange(id: string | null) {
  if (item.value) orchestrator.assignTraveler(props.tripId, item.value, id)
}
function onContainerChange(id: string | null) {
  if (item.value) orchestrator.assignContainer(props.tripId, item.value, id)
}
function onLatePacker(value: boolean) {
  if (item.value) orchestrator.setLatePacker(props.tripId, item.value, value)
}
function onIncrement() {
  if (item.value) orchestrator.packIncrement(props.tripId, item.value)
}
function onDecrement() {
  if (item.value) orchestrator.packDecrement(props.tripId, item.value)
}
function onComplete() {
  if (item.value) orchestrator.packComplete(props.tripId, item.value)
}
function onZero() {
  if (item.value) orchestrator.packZero(props.tripId, item.value)
}
function onToggle() {
  if (item.value) orchestrator.packToggle(props.tripId, item.value)
}

// --- Presentation helpers ---
const MODE_LABEL: Record<ItemMode, string> = {
  pack: 'mode.pack',
  buy_before: 'mode.buyBefore',
  buy_local: 'mode.buyLocal',
}

function modeLabel(mode: ItemMode): string {
  return t(MODE_LABEL[mode] as Parameters<typeof t>[0])
}

function modeIcon(mode: ItemMode): string {
  if (mode === 'buy_before') return cartOutline
  if (mode === 'buy_local') return locationOutline
  return bagHandleOutline
}

function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`
}

/** "Kleidung · 300 g" — what the row is, in one quiet line. */
const contextLine = computed(() => {
  const parts: string[] = []
  if (item.value?.category_name) parts.push(item.value.category_name)
  if (item.value?.weight_grams) parts.push(formatWeight(item.value.weight_grams))
  if (item.value?.value_cents) parts.push(`${(item.value.value_cents / 100).toFixed(2)}`)
  return parts.join(' · ')
})

const stateLabel = computed(() => {
  if (!item.value) return ''
  if (hasPrepWithPacked.value) return t('item.statePackedOpenPrep')
  const key = {
    open: 'item.stateOpen',
    partial: 'item.statePartial',
    packed: 'item.statePacked',
    skipped: 'item.stateSkipped',
    packing_now: 'item.statePackingNow',
  }[item.value.state]
  return t(key as Parameters<typeof t>[0])
})

/** FR-25.17/25.19: who packed it and when, and who was responsible. */
const packedStamp = computed(() => {
  const row = item.value
  if (!row?.packed_by_user_id && !row?.packed_at) return null
  const stamp = row?.packed_at ? relativeStamp(row.packed_at, new Date(), currentLocale()) : null
  const when = stamp
    ? `${stamp.dayKey ? t(stamp.dayKey === 'today' ? 'stamp.today' : 'stamp.yesterday') : stamp.date} ${stamp.time}`
    : ''
  const who = nameOf(row?.packed_by_user_id ?? null)
  const line = who ? t('packing.packedBy', { who, when }) : t('packing.packedByUnknown', { when })
  const responsible = nameOf(row?.packer_user_id ?? null)
  return responsible && row?.packer_user_id !== row?.packed_by_user_id
    ? `${line} · ${t('packing.responsibleWas', { who: responsible })}`
    : line
})
</script>

<template>
  <section v-if="item" class="sheet-body" data-testid="m5-sheet">
    <header class="head">
      <!-- Small on purpose (FR-22.1): a photo helps recognise the thing,
           it is not what the screen is about — it used to take 200px of
           the first thing you see, on rows that mostly have none. -->
      <ItemThumbnail v-if="photoItem" :item="photoItem" :size="44" class="thumb" />
      <div class="titles">
        <h1 class="jp-sheet-title" data-testid="m5-name">{{ item.name }}</h1>
        <p v-if="contextLine" class="context">{{ contextLine }}</p>
      </div>
      <SaveIndicator :state="saveState" />
      <button
        class="x"
        data-testid="m5-close"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <IonIcon :icon="closeOutline" />
      </button>
    </header>

    <!-- What the screen is opened for, and therefore the biggest control. -->
    <div class="pack" data-testid="m5-pack">
      <QuantityStepper
        :quantity="item.quantity"
        :packed="item.packed_count"
        @increment="onIncrement"
        @decrement="onDecrement"
        @complete="onComplete"
        @zero="onZero"
        @toggle="onToggle"
      />
      <span class="state" :class="[item.state, { amber: hasPrepWithPacked }]">
        {{ stateLabel }}
      </span>
    </div>

    <!-- Read-only summary of everything Details can change (FR-25.14). -->
    <div class="glance">
      <span class="chip">
        <UserAvatar
          v-if="travelerName"
          :name="travelerName"
          :seed="item.assigned_traveler_id"
          :size="20"
        />
        {{ travelerName ?? t('facet.shared') }}
      </span>
      <span class="chip" :class="{ buy: item.mode !== 'pack' }">
        <IonIcon :icon="modeIcon(item.mode)" />
        {{ modeLabel(item.mode) }}
      </span>
      <span v-if="containerName" class="chip">
        <span class="key">{{ t('facet.container') }}</span> {{ containerName }}
      </span>
      <span v-if="item.late_packer" class="chip warn">
        <IonIcon :icon="timeOutline" /> {{ t('mode.latePacker') }}
      </span>
      <span v-if="item.flag_missing" class="chip warn">{{ t('facet.flagMissing') }}</span>
    </div>

    <!-- FR-7.3: the work attached to the thing, before the thing's fields. -->
    <section class="sec">
      <h2 class="sl">
        {{ t('packing.prepSection') }}
        <span class="n">{{ t('packing.openPrep', { n: openTodoCount }) }}</span>
      </h2>
      <label
        v-for="todo in itemTodos"
        :key="todo.id"
        class="todo"
        :class="{ done: todo.task_state === 'resolved' }"
      >
        <IonCheckbox
          :checked="todo.task_state === 'resolved'"
          :data-testid="`m5-todo-${todo.id}`"
          @ion-change="toggleTodo(todo)"
        />
        <span class="todo-body">{{ todo.body }}</span>
      </label>
      <div class="composer">
        <IonInput
          v-model="newTodoText"
          data-testid="m5-todo-input"
          :placeholder="t('item.addPrep')"
          @keydown.enter="addTodo"
        />
        <IonButton
          size="small"
          :disabled="!newTodoText.trim()"
          data-testid="m5-todo-add"
          @click="addTodo"
        >
          {{ t('common.add') }}
        </IonButton>
      </div>
    </section>

    <!-- FR-7.1/7.2 -->
    <section class="sec">
      <h2 class="sl">
        {{ t('item.notes') }}
        <span class="n">{{ itemComments.length }}</span>
      </h2>
      <article
        v-for="comment in itemComments"
        :id="`comment-${comment.id}`"
        :key="comment.id"
        class="note"
        :class="{ flash: flashedCommentId === comment.id }"
      >
        <UserAvatar :name="nameOf(comment.author_id)" :seed="comment.author_id" :size="24" />
        <div class="note-body">
          <p class="meta">{{ nameOf(comment.author_id) ?? comment.author_id }}</p>
          <p class="text">{{ comment.body }}</p>
        </div>
        <IonButton
          fill="clear"
          size="small"
          :aria-label="t('item.flagAsTask')"
          :title="t('item.flagAsTask')"
          @click="flagAsTask(comment)"
        >
          <IonIcon slot="icon-only" :icon="alertCircleOutline" />
        </IonButton>
      </article>
      <div class="composer">
        <IonInput
          v-model="newCommentText"
          data-testid="m5-note-input"
          :placeholder="t('item.addNote')"
          @keydown.enter="addComment"
        />
        <IonButton
          size="small"
          :disabled="!newCommentText.trim()"
          data-testid="m5-note-add"
          @click="addComment"
        >
          {{ t('common.add') }}
        </IonButton>
      </div>
    </section>

    <!-- FR-20.4: companions of this item that are not on the list yet. -->
    <section v-if="suggestedCompanions.length > 0" class="sec">
      <h2 class="sl"><IonIcon :icon="linkOutline" /> {{ t('item.companions') }}</h2>
      <IonChip
        v-for="companion in suggestedCompanions"
        :key="companion.item_id"
        outline
        @click="addCompanion(companion)"
      >
        + {{ companion.name }}
      </IonChip>
    </section>

    <!-- Everything the glance row summarises, on demand (FR-25.7 idiom). -->
    <button
      class="details"
      :class="{ open: detailsOpen }"
      data-testid="m5-details"
      @click="detailsOpen = !detailsOpen"
    >
      <IonIcon :icon="chevronForwardOutline" class="caret" />
      <span class="details-label">{{ t('item.details') }}</span>
      <span v-if="!detailsOpen" class="details-hint">{{ t('item.detailsHint') }}</span>
    </button>

    <IonList v-if="detailsOpen" class="details-body">
      <IonItem>
        <IonLabel>{{ t('item.usedBy') }}</IonLabel>
        <IonSelect
          :value="item.assigned_traveler_id"
          interface="popover"
          data-testid="m5-traveler"
          @ion-change="(e: CustomEvent) => onTravelerChange(e.detail.value)"
        >
          <IonSelectOption :value="null">{{ t('facet.shared') }}</IonSelectOption>
          <IonSelectOption v-for="traveler in travelers" :key="traveler.id" :value="traveler.id">
            {{ traveler.name }}
          </IonSelectOption>
        </IonSelect>
      </IonItem>
      <IonItem>
        <IonLabel>{{ t('facet.mode') }}</IonLabel>
        <IonSelect
          :value="item.mode"
          interface="popover"
          data-testid="m5-mode"
          @ion-change="(e: CustomEvent) => onModeChange(e.detail.value)"
        >
          <IonSelectOption value="pack">{{ t('mode.pack') }}</IonSelectOption>
          <IonSelectOption value="buy_before">{{ t('mode.buyBefore') }}</IonSelectOption>
          <IonSelectOption value="buy_local">{{ t('mode.buyLocal') }}</IonSelectOption>
        </IonSelect>
      </IonItem>
      <IonItem>
        <IonLabel>{{ t('item.luggageOptional') }}</IonLabel>
        <IonSelect
          :value="item.container_id"
          interface="popover"
          data-testid="m5-container"
          @ion-change="(e: CustomEvent) => onContainerChange(e.detail.value)"
        >
          <IonSelectOption :value="null">{{ t('facet.noLuggage') }}</IonSelectOption>
          <IonSelectOption
            v-for="container in containers"
            :key="container.id"
            :value="container.id"
          >
            {{ container.name }}
          </IonSelectOption>
        </IonSelect>
      </IonItem>
      <IonItem>
        <IonLabel>
          <h3>{{ t('mode.latePacker') }}</h3>
          <p>{{ t('item.latePackerHint') }}</p>
        </IonLabel>
        <IonToggle
          slot="end"
          :checked="item.late_packer"
          data-testid="m5-late"
          @ion-change="(e: CustomEvent) => onLatePacker(e.detail.checked)"
        />
      </IonItem>
      <!-- FR-9.1: the two review flags only mean anything on a live trip. -->
      <IonItem v-if="isActive">
        <IonIcon slot="start" :icon="removeCircleOutline" />
        <IonLabel>{{ t('item.flags') }}</IonLabel>
        <IonNote slot="end">
          {{ item.flag_missing ? t('facet.flagMissing') : t('item.noFlags') }}
        </IonNote>
      </IonItem>
      <IonItem v-if="packedStamp" lines="none">
        <IonNote data-testid="m5-stamp">{{ packedStamp }}</IonNote>
      </IonItem>
    </IonList>
  </section>

  <section v-else class="missing" data-testid="m5-missing">
    <p>{{ t('item.notFound') }}</p>
  </section>
</template>

<style scoped>
.sheet-body {
  padding: 4px 16px 24px;
}

/* --- header --- */
.head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 0 14px;
}

.thumb {
  flex: none;
  border-radius: var(--jp-r-sm);
  overflow: hidden;
}

.titles {
  flex: 1;
  min-width: 0;
}

.head h1 {
  margin: 0;
}

.context {
  margin: 3px 0 0;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: none;
  border-radius: 50%;
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  cursor: pointer;
}

/* --- packing --- */
.pack {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--jp-r);
  background: var(--ct-surface0);
}

.state {
  margin-left: auto;
  padding: 5px 10px;
  border-radius: var(--jp-r-pill);
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-bold);
  background: color-mix(in srgb, var(--ct-green) 16%, transparent);
  color: var(--ct-green);
}

.state.open,
.state.partial {
  background: color-mix(in srgb, var(--ct-yellow) 16%, transparent);
  color: var(--ct-yellow);
}

.state.amber {
  background: color-mix(in srgb, var(--ct-peach) 18%, transparent);
  color: var(--ct-peach);
}

/* --- glance --- */
.glance {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 12px 0 2px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
}

.chip .key {
  color: var(--ct-overlay0);
}

.chip.buy {
  color: var(--ct-peach);
}

.chip.warn {
  border-color: color-mix(in srgb, var(--ct-peach) 50%, transparent);
  color: var(--ct-peach);
}

/* --- sections --- */
.sec {
  padding: 14px 0;
  border-top: 1px solid var(--ct-surface0);
}

.sl {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-semibold);
  letter-spacing: var(--jp-tracking-label);
  text-transform: uppercase;
  color: var(--ct-subtext0);
}

.sl .n {
  margin-left: auto;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ct-overlay0);
}

.todo {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 7px 0;
}

.todo.done .todo-body {
  color: var(--ct-overlay0);
  text-decoration: line-through;
}

.note {
  display: flex;
  gap: 10px;
  padding: 8px 0;
}

.note-body {
  flex: 1;
  min-width: 0;
}

.note .meta {
  margin: 0;
  font-size: var(--jp-text-2xs);
  color: var(--ct-overlay0);
}

.note .text {
  margin: 2px 0 0;
  font-size: var(--jp-text-base);
}

.note.flash {
  animation: flash 2.4s ease-out;
}

@keyframes flash {
  0%,
  60% {
    background: color-mix(in srgb, var(--ct-blue) 16%, transparent);
  }
  100% {
    background: transparent;
  }
}

.composer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.composer ion-input {
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-md);
}

/* --- details --- */
.details {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 14px 2px;
  background: none;
  border: none;
  border-top: 1px solid var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  text-align: start;
  cursor: pointer;
}

.details .caret {
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-xs);
  transition: transform 0.18s ease;
}

.details.open .caret {
  transform: rotate(90deg);
}

.details-label {
  flex: none;
}

.details-hint {
  flex: 1;
  text-align: end;
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
  color: var(--ct-overlay0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.details-body {
  background: transparent;
}

.missing {
  padding: 32px 16px;
  text-align: center;
  color: var(--ct-subtext0);
}
</style>
