<script setup lang="ts">
/**
 * A connection's legs (FR-29.18), each *„10:58 [RE 3] Samedan → Landquart ·
 * an 12:39"*, a walk with 🚶 for its line — under its line on the timeline,
 * and as the preview of a read link in the sheet. Where it came with a link,
 * the provider's own app is a tap away: it knows delays and platforms.
 */
import { IonIcon } from '@ionic/vue'
import { openOutline, walkOutline } from 'ionicons/icons'

import { t } from '@/i18n'
import type { ConnectionLeg } from './types'
import { timeOf } from './domain/connections'

defineProps<{ legs: readonly ConnectionLeg[]; link?: string | null }>()
</script>

<template>
  <div class="legs">
    <p v-for="(leg, index) in legs" :key="index" class="leg" data-testid="connection-leg">
      <span class="jp-num">{{ timeOf(leg.dep) }}</span>
      <span class="mode">
        <span v-if="leg.line" class="vehicle">{{ leg.line }}</span>
        <IonIcon
          v-else
          class="walk"
          :icon="walkOutline"
          role="img"
          :aria-label="t('dayPlan.walk')"
        />
      </span>
      <span class="stops"
        >{{ leg.from }} → {{ leg.to }}
        <span class="arr jp-num"
          >· {{ t('dayPlan.arrives', { time: timeOf(leg.arr) }) }}</span
        ></span
      >
    </p>
    <a
      v-if="link"
      class="app-link"
      :href="link"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="connection-open-link"
    >
      {{ t('dayPlan.openInApp') }}
      <IonIcon :icon="openOutline" aria-hidden="true" />
    </a>
  </div>
</template>

<style scoped>
/* Time, vehicle and stops in columns, so a long stop wraps inside its own. */
.leg {
  display: grid;
  grid-template-columns: 38px 40px 1fr;
  align-items: baseline;
  column-gap: 6px;
  margin: 5px 0;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.mode {
  justify-self: start;
}

.vehicle {
  white-space: nowrap;
  padding: 0 6px;
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-card);
  color: var(--ct-text);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.walk {
  font-size: var(--jp-icon-xs);
}

.stops {
  color: var(--ct-text);
}

.arr {
  color: var(--ct-subtext1);
  white-space: nowrap;
}

.app-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  text-decoration: none;
}

.app-link ion-icon {
  font-size: var(--jp-icon-xs);
}
</style>
