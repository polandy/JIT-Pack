<script setup lang="ts">
/**
 * The bar a list shows while it is selecting (`useRowSelection`): leave, how
 * many, „Alle N". M9's shape first, copied by M6; one bar for M6, M25 and M9
 * since 2026-09-24.
 *
 * The `testid` prefix keeps each screen's own handles (`m6-selbar`,
 * `m6-select-exit`, …), which the suites already address.
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'

import { t } from '@/i18n'

defineProps<{
  /** How many are chosen. */
  count: number
  /** How many „Alle" would choose. */
  total: number
  /** The screen's prefix for the test handles, e.g. `m6`. */
  testid: string
}>()

defineEmits<{ exit: []; all: [] }>()
</script>

<template>
  <div class="selbar" :data-testid="`${testid}-selbar`">
    <button
      type="button"
      class="chip"
      :aria-label="t('selection.exit')"
      :data-testid="`${testid}-select-exit`"
      @click="$emit('exit')"
    >
      <IonIcon :icon="closeOutline" />
    </button>
    <span class="selcount" :data-testid="`${testid}-select-count`">
      {{ count === 0 ? t('selection.none') : t('selection.count', { n: count }) }}
    </span>
    <button type="button" class="chip" :data-testid="`${testid}-select-all`" @click="$emit('all')">
      {{ t('selection.all', { n: total }) }}
    </button>
  </div>
</template>

<style scoped>
.selbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--jp-action) 16%, var(--jp-surface-page));
  border-bottom: 1px solid var(--ct-surface0);
}

.selcount {
  flex: 1;
  font-weight: var(--jp-weight-semibold);
}

.chip {
  padding: 5px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.chip:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}
</style>
