<script setup lang="ts">
/**
 * FR-25.15 — the sheet's auto-save indicator: an amber pulsing lamp the
 * moment a change is in flight, a green one once it settled on this device.
 * Icon-only; the meaning rides on the tooltip (G-12-06). Deliberately
 * distinct from G-2: this says the edit is captured locally, G-2 says
 * whether it reached the server — offline that difference is the entire
 * story.
 *
 * The seam is the orchestrator's `capturePending`, which counts this device's
 * own open writes and nothing else. It used to be `syncStatus.state` — G-2's
 * own state — which collapsed the two the requirement exists to keep apart:
 * that state answers `offline` before `syncing`, so an open write on a device
 * with no network read as settled, and a background pull on one with a
 * network read as saving (found 2026-08-30, audit of backlog item 6).
 *
 * **It is silent until it has something to confirm** (owner, 2026-09-20:
 * *"the semantics of the checkmark are unclear and therefore confusing"*).
 * Two things made it so, and they pulled the same way. It rendered its
 * settled state from the moment a sheet opened, so the first thing you saw
 * was a confirmation of nothing — an indicator that is never off carries no
 * information. And it was a ✓ on a filled circle at the exact diameter of
 * the ✕ beside it, which is the built form of a confirm button. The latch
 * below answers the first: the lamp appears only as the consequence of
 * something you did. The lamp answers the second: a drawn dot offers no tap
 * target, and it is no longer the glyph that means *accept* elsewhere.
 */
import { computed, ref, watch } from 'vue'

import { t } from '@/i18n'

const props = defineProps<{ pending: boolean }>()

/**
 * Raised by the first open write and never lowered. The settled lamp is the
 * answer to that write, so it stands as long as the write does — which is
 * until the surface carrying it goes away, because each mounts one of these
 * and none outlives its own edit. That is why "has anything been written
 * here" needs no state outside the component.
 *
 * `immediate`, because a sheet can be opened onto a write that is already in
 * flight: the latch is raised by the state, not only by the transition.
 */
const written = ref(false)
watch(
  () => props.pending,
  (pending) => {
    if (pending) written.value = true
  },
  { immediate: true },
)

const saving = computed(() => props.pending)
const title = computed(() => (saving.value ? t('item.saving') : t('item.saved')))
</script>

<template>
  <span
    v-if="written"
    class="lamp"
    :class="saving ? 'saving' : 'saved'"
    role="status"
    data-testid="save-indicator"
    :title="title"
    :aria-label="title"
  >
    <span class="bulb" />
  </span>
</template>

<style scoped>
/*
 * As tall as the ✕ it stands beside and no wider than the lamp inside it.
 * Equal heights hung from the same top edge put the two centres on one line;
 * a lamp sized to itself would instead centre on the whole header, which is
 * as tall as the 44px thumbnail it leads with, and sit visibly low of the ✕
 * (owner, 2026-09-20, from the rendered sheet). Height is what buys the
 * shared centre line, so the width is free to stay tight.
 */
.lamp {
  display: grid;
  place-items: center;
  height: var(--jp-control-round);
  flex: none;
}

/*
 * A drawn shape rather than a glyph, so it takes no size from the icon
 * scale: `--jp-icon-*` is a glyph box for a face to paint into, and there is
 * no face here. A circle is a shape and not a size, so `50%` is the tokens
 * gate's own carve-out.
 */
.bulb {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.saved .bulb {
  background: var(--jp-done);
}

.saving .bulb {
  background: var(--ct-straw);
  animation: save-pulse 1s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .saving .bulb {
    animation: none;
  }
}

@keyframes save-pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
