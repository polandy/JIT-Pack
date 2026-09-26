<script setup lang="ts">
/**
 * FR-5.10: the packing of this trip is finished, and here is the way back.
 *
 * It states a *decision*, which is why it carries a moment and a number: the
 * list below it is still workable — a thing that was packed but never listed
 * is added afterwards — so without this card a finished
 * list would look exactly like one nobody has closed.
 *
 * *Wieder öffnen* lifts the stamp and nothing else. The rows it decided stay
 * decided; bringing one back is FR-5.5's reveal, one row at a time, because
 * that is what the decision was.
 */
import { IonButton, IonIcon } from '@ionic/vue'
import { checkmarkCircleOutline } from 'ionicons/icons'

import { relativeStamp } from '@/domain/stamp'
import { currentLocale, t } from '@/i18n'
import { stampText } from '@/lib/rowFacts'

const props = defineProps<{
  /** When the packing was closed, as the trip records it. */
  at: string
  /** How many rows the list currently carries as *nicht mitgenommen*. */
  skipped: number
}>()

const emit = defineEmits<{ reopen: [] }>()

/** „heute 18:40" — the same stamp a packed row wears (FR-25.17). */
const when = () => stampText(relativeStamp(props.at, new Date(), currentLocale()))
</script>

<template>
  <div class="jp-card closed-card" data-testid="m4-packing-closed">
    <IonIcon class="closed-mark" :icon="checkmarkCircleOutline" aria-hidden="true" />
    <div class="closed-said">
      <h2>{{ t('packing.closedTitle') }}</h2>
      <p class="closed-stamp" data-testid="m4-packing-closed-stamp">
        {{
          props.skipped > 0
            ? t('packing.closedStamp', { when: when(), n: props.skipped })
            : t('packing.closedStampNone', { when: when() })
        }}
      </p>
    </div>
    <IonButton size="small" fill="clear" data-testid="m4-reopen-packing" @click="emit('reopen')">
      {{ t('packing.reopen') }}
    </IonButton>
  </div>
</template>

<style scoped>
.closed-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px;
  padding: 12px 14px;
}

.closed-mark {
  flex-shrink: 0;
  font-size: var(--jp-icon-md);
  color: var(--jp-done);
}

.closed-said {
  flex: 1;
  min-width: 0;
}

.closed-said h2 {
  margin: 0;
  font-size: var(--jp-text-lg);
}

.closed-stamp {
  margin: 2px 0 0;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}
</style>
