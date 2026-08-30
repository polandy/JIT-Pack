<script setup lang="ts">
/**
 * M8 — position sheet (§3.25 consistency directive, owner 2026-08-08).
 *
 * Editing a template position behaves like the packing list's M5 sheet:
 * name header, read-only glance-chip row, the routinely touched sections
 * first (Menge, Vorbereitung), and everything else behind "Details ▾"
 * (FR-25.7). Every control commits immediately (G-5) — there is no save
 * button, and `Details` folds only.
 *
 * A per-person position carries **one quantity for everyone** — the
 * Adult/Child split fell with FR-25.9; concrete per-person numbers are
 * set on the trip (FR-25.8).
 */
import { IonIcon, IonButton, IonInput, IonToggle } from '@ionic/vue'
import {
  addOutline,
  cartOutline,
  chevronForwardOutline,
  closeOutline,
  locationOutline,
  removeOutline,
  timeOutline,
} from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import SaveIndicator from '@/components/global/SaveIndicator.vue'

import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { t } from '@/i18n'
import { ACCOMMODATIONS, SEASONS, TRANSPORT_MODES, attributeLabel } from '@/lib/attributeLabels'
import { useMasterStore } from '@/stores/masterStore'
import type { ItemMode, TemplateAssignment, TemplateDedup } from '@/types/domain'

const props = defineProps<{
  templateId: string
  positionId: string
}>()

const emit = defineEmits<{ close: [] }>()

const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const template = computed(() => masterStore.getTemplate(props.templateId))
const position = computed(() =>
  masterStore.getTemplateItems(props.templateId).find((p) => p.id === props.positionId),
)
const itemName = computed(
  () => masterStore.getItem(position.value?.item_id ?? '')?.name ?? t('templates.notFound'),
)
const tasks = computed(() => masterStore.getTemplateItemTasks(props.positionId))

/** Folded by default: the sheet opens on what is routinely touched (FR-25.7). */
const detailsOpen = ref(false)

const scopeName = computed(() =>
  template.value?.kind === 'group' ? t('templates.sectionGroup') : t('templates.sectionTemplate'),
)

// --- Condition chips (FR-15.2): one value per attribute axis, tap toggles ---

const CONDITION_AXES: Array<{ key: string; values: readonly string[] }> = [
  { key: 'season', values: SEASONS },
  { key: 'transport_mode', values: TRANSPORT_MODES },
  { key: 'accommodation', values: ACCOMMODATIONS },
]

function conditionActive(key: string, value: string): boolean {
  return position.value?.conditions?.[key] === value
}

function toggleCondition(key: string, value: string) {
  const pos = position.value
  if (!pos) return
  const conditions: Record<string, unknown> = { ...pos.conditions }
  if (conditions[key] === value) delete conditions[key]
  else conditions[key] = value
  update({ conditions: Object.keys(conditions).length ? JSON.stringify(conditions) : null })
}

const conditionSummary = computed(() => {
  const conditions = position.value?.conditions
  if (!conditions) return []
  return Object.values(conditions)
    .filter((v): v is string => typeof v === 'string')
    .map(attributeLabel)
})

// --- Edits (each commits on the spot, G-5) ---

function update(fields: Record<string, unknown>) {
  if (position.value) orchestrator.updateTemplateItem(position.value, fields)
}

function stepQuantity(delta: number) {
  const pos = position.value
  if (!pos) return
  // 0 is a deliberate statement, not an error (FR-5.5) — the floor, not 1.
  update({ quantity: Math.max(0, pos.quantity + delta) })
}

function setAssignment(assignment: TemplateAssignment) {
  update({ assignment })
}

function setMode(mode: ItemMode) {
  update({ default_mode: mode })
}

function setDedup(dedup: TemplateDedup) {
  update({ dedup })
}

function setLatePacker(late: boolean) {
  update({ late_packer: late ? 1 : 0 })
}

// --- Preparation tasks (FR-27.7) ---

const newTaskText = ref('')

function addTask() {
  const task = newTaskText.value.trim()
  if (!task) return
  orchestrator.addTemplateItemTask(props.positionId, task)
  newTaskText.value = ''
}

function removeTask(taskId: string) {
  orchestrator.deleteTemplateItemTask(taskId)
}

const MODES: Array<{ value: ItemMode; label: () => string }> = [
  { value: 'pack', label: () => t('mode.pack') },
  { value: 'buy_before', label: () => t('mode.buyBefore') },
  { value: 'buy_local', label: () => t('mode.buyLocal') },
]
</script>

<template>
  <section v-if="position" class="sheet-body" data-testid="m8-position-sheet">
    <header class="head">
      <div class="titles">
        <h1 class="jp-sheet-title" data-testid="m8-position-name">{{ itemName }}</h1>
        <p class="context">
          {{ t('templates.positionOf', { scope: scopeName, name: template?.name ?? '' }) }}
        </p>
      </div>
      <SaveIndicator :pending="orchestrator.capturePending.value" />
      <button
        class="x"
        data-testid="m8-position-close"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <IonIcon :icon="closeOutline" />
      </button>
    </header>

    <!-- Read-only summary of everything Details can change (M5 grammar). -->
    <div class="glance">
      <span class="chip" data-testid="m8-glance-qty">{{ position.quantity }}×</span>
      <span v-if="position.assignment === 'per_person'" class="chip accent">
        {{ t('templates.perPerson') }}
      </span>
      <span v-if="position.default_mode !== 'pack'" class="chip buy">
        <IonIcon :icon="position.default_mode === 'buy_before' ? cartOutline : locationOutline" />
        {{ position.default_mode === 'buy_before' ? t('mode.buyBefore') : t('mode.buyLocal') }}
      </span>
      <span v-if="position.late_packer" class="chip warn">
        <IonIcon :icon="timeOutline" /> {{ t('mode.latePacker') }}
      </span>
      <span v-if="tasks.length" class="chip done">
        {{ t('templates.prepChip', { n: tasks.length }) }}
      </span>
      <span v-for="label in conditionSummary" :key="label" class="chip cond">{{ label }}</span>
    </div>

    <!-- Menge first: the one parameter every position has (FR-25.7). -->
    <section class="sec">
      <h2 class="sl">
        {{ t('templates.qtySection')
        }}{{ position.assignment === 'per_person' ? t('templates.qtyPerPersonSuffix') : '' }}
      </h2>
      <div class="stepper">
        <button
          class="step"
          data-testid="m8-qty-dec"
          :aria-label="t('common.remove')"
          @click="stepQuantity(-1)"
        >
          <IonIcon :icon="removeOutline" />
        </button>
        <span class="qty jp-num" data-testid="m8-qty">{{ position.quantity }}</span>
        <button
          class="step"
          data-testid="m8-qty-inc"
          :aria-label="t('common.add')"
          @click="stepQuantity(1)"
        >
          <IonIcon :icon="addOutline" />
        </button>
        <span v-if="position.quantity === 0" class="zero-hint">
          {{ t('templates.qtyZeroHint') }}
        </span>
      </div>
    </section>

    <!-- FR-27.7: each task becomes an FR-7.3 todo on the generated trip item. -->
    <section class="sec">
      <h2 class="sl">
        {{ t('templates.prepSection') }}
        <span class="n">{{ t('templates.prepBlockingRule') }}</span>
      </h2>
      <div v-for="task in tasks" :key="task.id" class="task" data-testid="m8-task-row">
        <span class="task-body">{{ task.task }}</span>
        <button class="rm" :aria-label="t('templates.removeTask')" @click="removeTask(task.id)">
          <IonIcon :icon="closeOutline" />
        </button>
      </div>
      <div class="composer">
        <IonInput
          v-model="newTaskText"
          data-testid="m8-task-input"
          :placeholder="t('templates.addTask')"
          @keydown.enter="addTask"
        />
        <IonButton
          size="small"
          :disabled="!newTaskText.trim()"
          data-testid="m8-task-add"
          @click="addTask"
        >
          {{ t('common.add') }}
        </IonButton>
      </div>
    </section>

    <!-- Everything the glance row summarises, on demand (FR-25.7 idiom). -->
    <button
      class="details"
      :class="{ open: detailsOpen }"
      data-testid="m8-details"
      @click="detailsOpen = !detailsOpen"
    >
      <IonIcon :icon="chevronForwardOutline" class="caret" />
      <span class="details-label">{{ t('item.details') }}</span>
      <span v-if="!detailsOpen" class="details-hint">{{ t('templates.detailsHint') }}</span>
    </button>

    <div v-if="detailsOpen" class="details-body" data-testid="m8-details-body">
      <!-- FR-25.10 wording: who needs it, not an abstract assignment type. -->
      <section class="opt-sec">
        <h3 class="sl">{{ t('templates.whoNeeds') }}</h3>
        <div class="seg" role="group">
          <button
            :class="{ sel: position.assignment === 'trip_global' }"
            data-testid="m8-assign-global"
            @click="setAssignment('trip_global')"
          >
            {{ t('templates.tripGlobal') }}
          </button>
          <button
            :class="{ sel: position.assignment === 'per_person' }"
            data-testid="m8-assign-person"
            @click="setAssignment('per_person')"
          >
            {{ t('templates.perPerson') }}
          </button>
        </div>
      </section>

      <section class="opt-sec">
        <h3 class="sl">{{ t('templates.procurement') }}</h3>
        <div class="seg" role="group">
          <button
            v-for="mode in MODES"
            :key="mode.value"
            :class="{ sel: position.default_mode === mode.value }"
            :data-testid="`m8-mode-${mode.value}`"
            @click="setMode(mode.value)"
          >
            {{ mode.label() }}
          </button>
        </div>
      </section>

      <!-- FR-2.3a: what happens when several groups carry the same item. -->
      <section class="opt-sec">
        <h3 class="sl">{{ t('templates.dedupSection') }}</h3>
        <div class="seg" role="group">
          <button
            :class="{ sel: position.dedup === 'max' }"
            data-testid="m8-dedup-max"
            @click="setDedup('max')"
          >
            {{ t('templates.dedupMax') }}
          </button>
          <button
            :class="{ sel: position.dedup === 'sum' }"
            data-testid="m8-dedup-sum"
            @click="setDedup('sum')"
          >
            {{ t('templates.dedupSum') }}
          </button>
        </div>
      </section>

      <!-- FR-15.2: one value per axis; tapping the active chip clears it. -->
      <section class="opt-sec">
        <h3 class="sl">{{ t('templates.conditions') }}</h3>
        <div class="cond-chips">
          <template v-for="axis in CONDITION_AXES" :key="axis.key">
            <button
              v-for="value in axis.values"
              :key="value"
              class="cond-chip"
              :class="{ sel: conditionActive(axis.key, value) }"
              :data-testid="`m8-cond-${value}`"
              @click="toggleCondition(axis.key, value)"
            >
              {{ attributeLabel(value) }}
            </button>
          </template>
        </div>
      </section>

      <label class="late-row">
        <span class="late-label">{{ t('mode.latePacker') }}</span>
        <IonToggle
          :checked="position.late_packer"
          data-testid="m8-late"
          @ion-change="(e: CustomEvent) => setLatePacker(e.detail.checked)"
        />
      </label>
    </div>
  </section>

  <section v-else class="missing">
    <p>{{ t('templates.notFound') }}</p>
  </section>
</template>

<style scoped>
.sheet-body {
  padding: 4px 16px 24px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 0 12px;
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
  width: var(--jp-control-round);
  height: var(--jp-control-round);
  flex: none;
  border: none;
  border-radius: 50%;
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  cursor: pointer;
}

/* --- glance (M5 grammar) --- */
.glance {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0 0 4px;
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

.chip.accent {
  color: var(--jp-action);
}

.chip.buy,
.chip.warn {
  color: var(--ct-peach);
}

.chip.done {
  color: var(--jp-done);
}

.chip.cond {
  color: var(--ct-mauve);
}

/* --- sections --- */
.sec {
  padding: 14px 0;
  border-top: 1px solid var(--ct-surface0);
}

.sl {
  display: flex;
  align-items: baseline;
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
  letter-spacing: normal;
  font-weight: var(--jp-weight-regular);
  color: var(--ct-overlay0);
  text-align: end;
}

/* --- quantity stepper (G-6: a stepper, never a formula field) --- */
.stepper {
  display: flex;
  align-items: center;
  gap: 14px;
}

.step {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--ct-surface0);
  color: var(--ct-text);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}

.step:active {
  background: var(--ct-surface1);
}

.qty {
  min-width: 28px;
  text-align: center;
  font-size: var(--jp-text-xl);
  font-weight: var(--jp-weight-bold);
}

.zero-hint {
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

/* --- tasks --- */
.task {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.task-body {
  flex: 1;
  min-width: 0;
  font-size: var(--jp-text-base);
}

.rm {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
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

/* --- details fold (M5 grammar) --- */
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

.opt-sec {
  padding: 10px 0;
}

/* --- segments & chips --- */
.seg {
  display: flex;
  gap: 6px;
}

.seg button {
  flex: 1;
  padding: 9px 10px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.seg button.sel {
  border-color: var(--jp-action);
  color: var(--jp-action);
  background: color-mix(in srgb, var(--jp-action) 10%, transparent);
}

.cond-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cond-chip {
  padding: 7px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: none;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.cond-chip.sel {
  border-color: var(--ct-mauve);
  color: var(--ct-mauve);
  background: color-mix(in srgb, var(--ct-mauve) 10%, transparent);
}

.late-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0 2px;
}

.late-label {
  font-size: var(--jp-text-base);
}

.missing {
  padding: 32px 16px;
  text-align: center;
  color: var(--ct-subtext0);
}
</style>
