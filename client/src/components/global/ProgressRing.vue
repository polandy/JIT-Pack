<script setup lang="ts">
/**
 * A share of something, as a ring with its own number inside (G-14).
 *
 * A ring rather than a second bar: the hero card already carries a track,
 * and the ring is what the concept puts at the head of it — a figure you
 * read at a glance with the bar underneath as the detail.
 *
 * The arc is `--jp-done`, the same anchor a checked box and a completed
 * bar take (G-11): a share is progress, and progress has one colour in
 * this app.
 */
withDefaults(
  defineProps<{
    /** 0–100. Clamped, because a caller's rounding is not this one's problem. */
    percent: number
    /** The ring's outer diameter in pixels. */
    size?: number
  }>(),
  { size: 58 },
)
</script>

<template>
  <div
    class="ring"
    role="img"
    :style="{ '--ring-size': `${size}px`, '--ring-share': Math.max(0, Math.min(100, percent)) }"
    :aria-label="`${Math.round(percent)}%`"
    data-testid="progress-ring"
  >
    <b class="share jp-figure" aria-hidden="true">{{ Math.round(percent) }}</b>
  </div>
</template>

<style scoped>
/* A circle is a shape, not a size — `50%` is the gate's own carve-out. */
.ring {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: var(--ring-size);
  height: var(--ring-size);
  border-radius: 50%;
  background: conic-gradient(
    var(--jp-done) calc(var(--ring-share) * 1%),
    var(--jp-surface-border) 0
  );
}

/* The hole, punched rather than composited: a ring drawn with a border
   would round its own ends and lose the exact share at low percentages. */
.ring::before {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: var(--jp-surface-card);
}

.share {
  position: relative;
  font-size: var(--jp-text-md);
}
</style>
