<script setup lang="ts">
/**
 * FR-9.6's verdict sheet: M4's closing pass asks one row at a time what its
 * trip taught — *hätte mit gemusst*, *unnötig dabei* or *zu viel* — and lets
 * the reader clear whatever it already carries. The reason is an ordinary
 * row comment (`domain/verdict.ts`'s own docstring), so this sheet only
 * composes it; it never shows the thread such a comment lands in.
 */
import { computed, ref, watch } from 'vue'

import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import NeededStepper from '@/components/global/NeededStepper.vue'
import {
  neededRange,
  rowVerdict,
  verdictChoices,
  VERDICT_FEWER,
  VERDICT_MISSING,
  VERDICT_UNUSED,
  type RowVerdict,
  type VerdictRow,
  type VerdictWindow,
} from '@/domain/verdict'
import { t } from '@/i18n'

const props = defineProps<{
  isOpen: boolean
  itemName: string
  row: VerdictRow
  window: VerdictWindow
}>()

const emit = defineEmits<{
  dismiss: []
  save: [verdict: RowVerdict | null, needed: number | undefined, reason: string]
}>()

const choices = computed(() => verdictChoices(props.row, props.window))
const range = computed(() => neededRange(props.row))
const packed = computed(() => props.row.packed_count > 0)

const picked = ref<RowVerdict | null>(null)
const needed = ref(1)
const why = ref('')

/** Opening the sheet starts from what the row already carries (FR-9.6). */
watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    picked.value = rowVerdict(props.row)
    needed.value = range.value
      ? Math.max(range.value.min, props.row.needed_quantity ?? range.value.min)
      : 1
    why.value = ''
  },
  { immediate: true },
)

function pick(verdict: RowVerdict) {
  picked.value = verdict
  if (verdict === VERDICT_FEWER && range.value) needed.value = range.value.max
}

function clear() {
  picked.value = null
}

function save() {
  emit('save', picked.value, picked.value === VERDICT_FEWER ? needed.value : undefined, why.value)
}
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m4-verdict-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="itemName"
        :meta="
          packed
            ? t('verdict.sheetSubtitlePacked', { n: row.packed_count })
            : t('verdict.sheetSubtitleHome')
        "
        title-testid="m4-verdict-sheet-title"
        close-testid="m4-verdict-sheet-close"
        @close="emit('dismiss')"
      />

      <div class="options">
        <button
          v-if="choices.includes(VERDICT_MISSING)"
          type="button"
          class="option"
          :class="{ picked: picked === VERDICT_MISSING }"
          data-testid="m4-verdict-missing"
          @click="pick(VERDICT_MISSING)"
        >
          <span class="label">{{ t('verdict.optionMissing') }}</span>
          <span class="hint">{{ t('verdict.optionMissingHint') }}</span>
        </button>

        <button
          v-if="choices.includes(VERDICT_UNUSED)"
          type="button"
          class="option"
          :class="{ picked: picked === VERDICT_UNUSED }"
          data-testid="m4-verdict-unused"
          @click="pick(VERDICT_UNUSED)"
        >
          <span class="label">{{ t('verdict.optionUnused') }}</span>
          <span class="hint">{{ t('verdict.optionUnusedHint') }}</span>
        </button>

        <button
          v-if="choices.includes(VERDICT_FEWER)"
          type="button"
          class="option"
          :class="{ picked: picked === VERDICT_FEWER }"
          data-testid="m4-verdict-fewer"
          @click="pick(VERDICT_FEWER)"
        >
          <span class="label">{{ t('verdict.optionFewer') }}</span>
          <span class="hint">{{ t('verdict.optionFewerHint') }}</span>
        </button>
      </div>

      <NeededStepper
        v-if="picked === VERDICT_FEWER && range"
        v-model="needed"
        :min="range.min"
        :max="range.max"
        class="needed"
      />

      <textarea
        v-model="why"
        class="why"
        data-testid="m4-verdict-why"
        :placeholder="t('verdict.whyPlaceholder')"
        :aria-label="t('verdict.whyLabel')"
        rows="2"
      />

      <div class="actions">
        <button type="button" class="ghost" data-testid="m4-verdict-clear" @click="clear">
          {{ t('verdict.clear') }}
        </button>
        <button type="button" class="primary" data-testid="m4-verdict-save" @click="save">
          {{ t('verdict.save') }}
        </button>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0;
}

.option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-text);
  text-align: left;
  cursor: pointer;
}

.option.picked {
  border-color: var(--jp-action);
  background: var(--ct-surface0);
}

.option .label {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

.option .hint {
  font-size: var(--jp-text-sm);
  color: var(--ct-overlay1);
}

.needed {
  margin: 4px 0 10px;
}

.why {
  width: 100%;
  min-height: 56px;
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-text);
  font-family: var(--jp-font-ui);
  font-size: var(--jp-text-sm);
  resize: vertical;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ghost,
.primary {
  padding: 8px 14px;
  border-radius: var(--jp-r-pill);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.ghost {
  border: 1px solid var(--ct-surface1);
  background: none;
  color: var(--ct-text);
}

.primary {
  border: none;
  background: var(--jp-action);
  color: var(--jp-brand-contrast);
}
</style>
