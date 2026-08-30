<script setup lang="ts">
/**
 * FR-25.15 — the sheet's auto-save indicator: an amber pulsing ● the moment
 * a change is in flight, a green ✓ once it settled on this device. Icon-only;
 * the meaning rides on the tooltip (G-12-06). Deliberately distinct from G-2:
 * this says the edit is captured locally, G-2 says whether it reached the
 * server — offline that difference is the entire story.
 *
 * The seam is the orchestrator's `capturePending`, which counts this device's
 * own open writes and nothing else. It used to be `syncStatus.state` — G-2's
 * own state — which collapsed the two the requirement exists to keep apart:
 * that state answers `offline` before `syncing`, so an open write on a device
 * with no network read as settled, and a background pull on one with a
 * network read as saving (found 2026-08-30, audit of backlog item 6).
 */
import { computed } from 'vue'

import { t } from '@/i18n'

const props = defineProps<{ pending: boolean }>()

const saving = computed(() => props.pending)
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
  /* Same diameter as the ✕ it stands beside — see surfaces.css. */
  width: var(--jp-control-round);
  height: var(--jp-control-round);
  flex: none;
  border-radius: 50%;
  /* One step up now the circle is: at 13px the glyph read lighter than the
     ✕ icon beside it, which is a size the icon table sets, not this scale. */
  font-size: var(--jp-text-md);
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
