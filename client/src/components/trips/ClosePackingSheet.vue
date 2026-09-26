<script setup lang="ts">
/**
 * FR-5.10's question, as a sheet (variant A).
 *
 * A sheet rather than an `ion-alert`, which is the cheap way to ask and looks it:
 * a system dialogue for the one moment in the trip where the app should
 * look like itself. What the sheet adds beyond chrome is *room for the
 * three things a count hides* — the started rows, the ones due on departure
 * day, the one somebody else is holding — each on its own line instead of
 * run together into an alert's paragraph.
 *
 * It decides nothing: the plan is computed by `domain/closePacking` and
 * handed in, so the sentence the reader confirms and the write that follows
 * read the same rule.
 */
import { IonButton, IonIcon } from '@ionic/vue'
import {
  alarmOutline,
  arrowForwardOutline,
  cartOutline,
  checkmarkDoneOutline,
  hourglassOutline,
  lockClosedOutline,
} from 'ionicons/icons'

import SheetHead from '@/components/global/SheetHead.vue'
import type { ClosePackingPlan } from '@/domain/closePacking'
import { t } from '@/i18n'

const props = defineProps<{
  plan: ClosePackingPlan
  /** Whether the reader arrived here by packing the last row (FR-5.10). */
  prompted?: boolean
  /**
   * FR-7.12: how many open purchases move from *before departure* to *at the
   * destination* — the plan's packing rows plus the shopping list's own
   * entries, which the plan cannot see (the list is a module, ADR-066).
   */
  shopping?: number
}>()

const emit = defineEmits<{ close: []; confirm: [] }>()

/** The facts a count hides, each with the glyph its rows wear on the list. */
const facts = () =>
  [
    { key: 'started', icon: hourglassOutline, n: props.plan.trim.length },
    { key: 'late', icon: alarmOutline, n: props.plan.late },
    { key: 'held', icon: lockClosedOutline, n: props.plan.claimed },
  ].filter((fact) => fact.n > 0)
</script>

<template>
  <div class="sheet" data-testid="m4-close-sheet">
    <SheetHead
      :title="t('packing.closeConfirmTitle')"
      :meta="props.prompted ? t('packing.closePromptMeta') : t('packing.closeConfirmMeta')"
      title-testid="m4-close-sheet-title"
      close-testid="m4-close-sheet-close"
      @close="emit('close')"
    />

    <p class="lead" data-testid="m4-close-sheet-lead">
      {{
        props.plan.rows.length > 0
          ? t('packing.closeConfirmBody', { n: props.plan.rows.length })
          : t('packing.closeConfirmNothing')
      }}
    </p>

    <!-- FR-7.7: not one of the count's exceptions but the other thing the
         close does, so it stands apart from the block above rather than
         inside it. The number is the plan's, like every other here — the
         sentence confirmed and the write performed read one rule. -->
    <p v-if="props.plan.tasks.length > 0" class="crossing" data-testid="m4-close-sheet-tasks">
      <IonIcon :icon="arrowForwardOutline" aria-hidden="true" />
      <span>{{ t('packing.closeConfirmTasks', { n: props.plan.tasks.length }) }}</span>
    </p>

    <p v-if="(props.shopping ?? 0) > 0" class="crossing" data-testid="m4-close-sheet-shopping">
      <IonIcon :icon="cartOutline" aria-hidden="true" />
      <span>{{ t('packing.closeConfirmShopping', { n: props.shopping ?? 0 }) }}</span>
    </p>

    <ul v-if="facts().length > 0" class="facts" data-testid="m4-close-sheet-facts">
      <li v-for="fact in facts()" :key="fact.key">
        <IonIcon :icon="fact.icon" aria-hidden="true" />
        <span>
          {{
            fact.key === 'started'
              ? t('packing.closeConfirmStarted', { n: fact.n })
              : fact.key === 'late'
                ? t('packing.closeConfirmLate', { n: fact.n })
                : t('packing.closeConfirmHeld', { n: fact.n })
          }}
        </span>
      </li>
    </ul>

    <div class="actions">
      <IonButton expand="block" data-testid="m4-close-sheet-confirm" @click="emit('confirm')">
        <IonIcon slot="start" :icon="checkmarkDoneOutline" />
        {{
          props.plan.rows.length > 0
            ? t('packing.closeConfirmVerb', { n: props.plan.rows.length })
            : t('packing.closeConfirmVerbNothing')
        }}
      </IonButton>
      <IonButton
        expand="block"
        fill="clear"
        data-testid="m4-close-sheet-cancel"
        @click="emit('close')"
      >
        {{ props.prompted ? t('packing.closeLater') : t('common.cancel') }}
      </IonButton>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  padding: 4px 16px 18px;
}

.lead {
  margin: 6px 2px 0;
  font-size: var(--jp-text-md);
  line-height: var(--jp-leading-body);
  color: var(--ct-subtext1);
}

/* The exceptions sit on the sunken plane: they qualify the sentence above
   them rather than adding to it, and a reader skipping them must be able
   to see at a glance that they are one block. */
.facts {
  list-style: none;
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  display: grid;
  gap: 8px;
}

.facts li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

/* The crossing reads as a sentence about what happens next, so it keeps the
   page's plane and takes the lead's colour rather than the sunken block's. */
.crossing {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 2px 0;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext1);
}

.crossing ion-icon {
  flex: none;
  font-size: var(--jp-icon-sm);
  color: var(--ct-overlay2);
}

.facts ion-icon {
  flex: none;
  font-size: var(--jp-icon-sm);
  color: var(--ct-overlay2);
}

.actions {
  margin-top: 18px;
  display: grid;
  gap: 2px;
}
</style>
