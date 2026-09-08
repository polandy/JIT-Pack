<script setup lang="ts">
/**
 * How far along something is: a ring, the share in words, and a track
 * underneath (G-14, FR-21.23).
 *
 * The three belong together and are therefore one component. M1's hero and
 * M4's header line answer the same question — how far along am I — and only
 * the hero was answering it; the screen where the progress is actually
 * *made* said it as a bare fraction in a grey line, which is the wrong way
 * round.
 *
 * The ring and the track say the same thing twice on purpose: the ring is
 * the glance, the track is where the eye goes when the number is not the
 * answer it wanted.
 */
import ProgressRing from '@/components/global/ProgressRing.vue'

withDefaults(
  defineProps<{
    /** How much of it is done, 0–100. */
    percent: number
    /** The share in words, because a ring is a shape and not a sentence. */
    headline: string
    /** What qualifies it: what is still owed, where the weight is. */
    detail?: string | null
    /** The ring's outer diameter — a header line is not a hero card. */
    ringSize?: number
    /** Put on the headline, for the cases that read the figure. */
    headlineTestid?: string
    /** Put on the detail line. */
    detailTestid?: string
  }>(),
  { detail: null, ringSize: 58, headlineTestid: undefined, detailTestid: undefined },
)
</script>

<template>
  <div class="figure">
    <ProgressRing :percent="percent" :size="ringSize" />
    <div class="progress">
      <b class="headline" :data-testid="headlineTestid">{{ headline }}</b>
      <span v-if="detail" class="detail" :data-testid="detailTestid">{{ detail }}</span>
      <div class="track"><i :style="{ width: `${Math.max(0, Math.min(100, percent))}%` }" /></div>
    </div>
  </div>
</template>

<style scoped>
.figure {
  display: flex;
  align-items: center;
  gap: 14px;
}

.progress {
  flex: 1;
  min-width: 0;
}

.headline {
  display: block;
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail {
  display: block;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track {
  height: 6px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-border);
}

.track i {
  display: block;
  height: 100%;
  border-radius: var(--jp-r-pill);
  background: var(--jp-done);
}
</style>
