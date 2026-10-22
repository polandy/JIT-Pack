<script setup lang="ts">
/**
 * M5's verdict block (FR-9.6), behind *Details ▾*: three chips, the stepper
 * *zu viel* opens and a reason. Every control commits immediately (G-5) —
 * there is no save button here, unlike M4's modal sheet (`VerdictSheet.vue`),
 * which bundles verdict and reason into the one write a dismissable modal
 * can afford.
 */
import { IonTextarea } from '@ionic/vue'
import { computed, ref } from 'vue'

import NeededStepper from '@/components/global/NeededStepper.vue'
import {
  MIN_NEEDED_QUANTITY,
  VERDICT_FEWER,
  VERDICT_MISSING,
  VERDICT_UNUSED,
  neededRange,
  rowVerdict,
  verdictChoices,
  verdictWindow,
  type RowVerdict,
  type VerdictRow,
} from '@/domain/verdict'
import { t } from '@/i18n'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { TripStatus } from '@/types/domain'

const props = defineProps<{
  tripId: string
  itemId: string
  item: VerdictRow
  tripStatus: TripStatus | undefined
  isLocked: boolean
}>()

const orchestrator = useOrchestrator()

/**
 * FR-9.6: the window this trip's status offers a verdict in, M5 never being
 * the closing pass itself (`verdictWindow`'s second argument is always
 * false here — M4's own call site is the one that passes true).
 */
const verdictWindow_ = computed(() =>
  props.tripStatus ? verdictWindow(props.tripStatus, false) : null,
)
const verdictChoiceList = computed(() =>
  verdictWindow_.value ? verdictChoices(props.item, verdictWindow_.value) : [],
)
const picked = computed(() => rowVerdict(props.item))
const neededRangeValue = computed(() => neededRange(props.item))

/** Pressing the pressed chip clears the verdict; pressing another moves it. */
function pickVerdict(verdict: RowVerdict) {
  if (props.isLocked) return
  if (picked.value === verdict) {
    orchestrator.verdicts.setVerdict(props.tripId, props.itemId, null)
    return
  }
  const needed =
    verdict === VERDICT_FEWER ? (neededRangeValue.value?.max ?? MIN_NEEDED_QUANTITY) : undefined
  orchestrator.verdicts.setVerdict(props.tripId, props.itemId, verdict, needed)
}

/** The stepper commits on every step (G-5) — there is no save button here. */
function onVerdictNeeded(value: number) {
  if (props.isLocked) return
  orchestrator.verdicts.setVerdict(props.tripId, props.itemId, VERDICT_FEWER, value)
}

/**
 * FR-9.6's reason: an ordinary row comment (`domain/verdict.ts`), posted on
 * its own rather than bundled with the verdict act above — M4's sheet
 * writes both in one step because it is a single modal interaction; M5's
 * chips commit immediately, so the reason is the thread's own composer,
 * narrowed to this block (owner-approved mockup).
 */
const verdictWhy = ref('')

function addVerdictReason() {
  const body = verdictWhy.value.trim()
  if (!body || props.isLocked) return
  orchestrator.comments.addComment(props.tripId, props.itemId, CLIENT_ACTOR_PLACEHOLDER, body)
  verdictWhy.value = ''
}
</script>

<template>
  <div class="verdict-block">
    <h3 class="sl" data-testid="m5-verdict-label">{{ t('verdict.blockTitle') }}</h3>
    <div class="verdict-chips">
      <button
        type="button"
        class="v-chip"
        :class="{ pressed: picked === VERDICT_MISSING }"
        :aria-pressed="picked === VERDICT_MISSING"
        :disabled="isLocked || !verdictChoiceList.includes(VERDICT_MISSING)"
        :title="
          verdictChoiceList.includes(VERDICT_MISSING) ? undefined : t('verdict.missingDisabledHint')
        "
        data-testid="m5-flag-missing"
        @click="pickVerdict(VERDICT_MISSING)"
      >
        {{ t('verdict.optionMissing') }}
      </button>
      <button
        v-if="verdictChoiceList.includes(VERDICT_UNUSED)"
        type="button"
        class="v-chip"
        :class="{ pressed: picked === VERDICT_UNUSED }"
        :aria-pressed="picked === VERDICT_UNUSED"
        :disabled="isLocked"
        data-testid="m5-flag-unused"
        @click="pickVerdict(VERDICT_UNUSED)"
      >
        {{ t('verdict.optionUnused') }}
      </button>
      <button
        v-if="verdictChoiceList.includes(VERDICT_FEWER)"
        type="button"
        class="v-chip"
        :class="{ pressed: picked === VERDICT_FEWER }"
        :aria-pressed="picked === VERDICT_FEWER"
        :disabled="isLocked"
        data-testid="m5-flag-fewer"
        @click="pickVerdict(VERDICT_FEWER)"
      >
        {{ t('verdict.optionFewer') }}
      </button>
    </div>
    <NeededStepper
      v-if="picked === VERDICT_FEWER && neededRangeValue"
      :model-value="item.needed_quantity ?? neededRangeValue.max"
      :min="neededRangeValue.min"
      :max="neededRangeValue.max"
      testid="m5-needed"
      class="verdict-needed"
      @update:model-value="onVerdictNeeded"
    />
    <IonTextarea
      v-if="picked"
      class="verdict-why"
      data-testid="m5-verdict-why"
      fill="outline"
      label-placement="stacked"
      :label="t('verdict.whyLabel')"
      :placeholder="t('verdict.whyPlaceholder')"
      :value="verdictWhy"
      :disabled="isLocked"
      :auto-grow="true"
      :rows="1"
      @ion-input="(e: CustomEvent) => (verdictWhy = e.detail.value ?? '')"
      @ion-change="addVerdictReason"
    />
  </div>
</template>

<style scoped>
.verdict-block {
  width: 100%;
  padding: 10px 0;
}

/* `.sl` is `ItemDetailSheet.vue`'s section-label style (scoped there too) —
   every "Details" block titles itself the same way, so this one copies it
   rather than reaching across a component boundary for one rule. */
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

.verdict-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.v-chip {
  padding: 6px 12px;
  border: 1px solid var(--ct-overlay0);
  border-radius: var(--jp-r-pill);
  background: none;
  color: var(--ct-text);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.v-chip.pressed {
  border-color: var(--jp-action);
  background: var(--ct-surface0);
  color: var(--jp-action);
}

.v-chip:disabled {
  opacity: 0.4;
  cursor: default;
}

.verdict-needed {
  margin-top: 10px;
}

.verdict-why {
  margin-top: 10px;
}
</style>
