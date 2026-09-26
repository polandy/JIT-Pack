<script setup lang="ts">
/**
 * FR-25.15 — the sheet's auto-save indicator: an amber pulsing lamp the
 * moment a change is in flight, a green one once it settled on this device.
 * Icon-only for the eye, with the meaning on the tooltip (G-12-06), and
 * spoken through the live region below it — the lamp itself is `aria-hidden`
 * so one fact is not announced from two elements that could drift.
 * Deliberately distinct from G-2: this says the edit is captured locally,
 * G-2 says whether it reached the server — offline that difference is the
 * entire story.
 *
 * The seam is the orchestrator's `capturePending`, which counts this device's
 * own open writes and nothing else. `syncStatus.state` — G-2's own state —
 * would collapse the two the requirement exists to keep apart: that state
 * answers `offline` before `syncing`, so an open write on a device with no
 * network would read as settled, and a background pull on one with a
 * network as saving.
 *
 * **It is silent until it has something to confirm.** A settled state
 * shown from the moment a sheet opens is a confirmation of nothing — an
 * indicator that is never off carries no information — so the latch below
 * makes the lamp appear only as the consequence of something you did. And
 * it is a drawn dot rather than a ✓ on a filled circle at the ✕'s diameter,
 * which is the built form of a confirm button: a dot offers no tap target,
 * and it is not the glyph that means *accept* elsewhere.
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
  <!--
    The spoken half. It is here before it has anything to say, because a live
    region created and filled in the same frame is not reliably announced —
    only a change *inside* a region that already exists is. So the region is
    permanent and its text is what comes and goes, while the lamp beside it
    keeps appearing and disappearing for the eye.
  -->
  <span class="announcement" role="status" data-testid="save-announcement">{{
    written ? title : ''
  }}</span>
  <span
    v-if="written"
    class="lamp"
    :class="saving ? 'saving' : 'saved'"
    data-testid="save-indicator"
    :title="title"
    aria-hidden="true"
  >
    <span class="bulb" />
  </span>
</template>

<style scoped>
/*
 * Out of flow, and that is the load-bearing part rather than the hiding: the
 * header lays its children out with `gap`, and an in-flow element of zero
 * size would still take a gap on each side and push the ✕ inward. An
 * absolutely positioned child is not a flex item at all, so the row measures
 * exactly as it did before this region existed.
 */
.announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/*
 * As tall as the ✕ it stands beside and no wider than the lamp inside it.
 * Equal heights hung from the same top edge put the two centres on one line;
 * a lamp sized to itself would instead centre on the whole header, which is
 * as tall as the 44px thumbnail it leads with, and sit visibly low of the ✕.
 * Height is what buys the
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
