<script setup lang="ts">
/**
 * FR-25.15 — the sheet's auto-save indicator: an amber pulsing ● the moment
 * a change is in flight, a green ✓ once it settled on this device. Icon-only;
 * the meaning rides on the tooltip (G-12-06). Deliberately distinct from G-2:
 * this says the edit is captured locally, G-2 says whether it reached the
 * server — offline that difference is the entire story.
 *
 * The seam is the orchestrator's sync state: since FR-19.2 an open Local Mode
 * write reports as `syncing`, so "settled" is observable rather than assumed.
 */
import { computed } from 'vue'

import type { SyncState } from '@/composables/useSyncStatus'
import { t } from '@/i18n'

const props = defineProps<{ state: SyncState }>()

const saving = computed(() => props.state === 'syncing')
const title = computed(() => (saving.value ? t('item.saving') : t('item.saved')))
</script>

<template>
  <span
    class="dot"
    :class="saving ? 'saving' : 'saved'"
    role="status"
    data-testid="save-indicator"
    :title="title"
    :aria-label="title"
  >
    {{ saving ? '●' : '✓' }}
  </span>
</template>

<style scoped>
.dot {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 50%;
  font-size: var(--jp-text-sm);
}

.saved {
  background: color-mix(in srgb, var(--jp-done) 16%, transparent);
  color: var(--jp-done);
}

.saving {
  background: color-mix(in srgb, var(--ct-yellow) 18%, transparent);
  color: var(--ct-yellow);
  animation: save-pulse 1s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .saving {
    animation: none;
  }
}

@keyframes save-pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
