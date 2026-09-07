<script setup lang="ts">
/**
 * The trip that is next, as a card rather than as a row (G-14, FR-21.13).
 *
 * M1 and M2 both open on a list in which the one trip a person is actually
 * packing looks exactly like the four they are not. The hero says which one
 * that is, and answers the question the screen exists for — how far along
 * am I — before anything has to be tapped.
 *
 * It is the only card in the app that carries brand on its own plane
 * (`--jp-hero-wash`, G-11): identity marks the thing you are on, and there
 * is exactly one of those per screen.
 */
import ProgressRing from '@/components/global/ProgressRing.vue'

withDefaults(
  defineProps<{
    /** The trip's name. */
    name: string
    /** When it is — the line above the name. */
    when?: string | null
    /** Who is on it, and anything else that qualifies it. */
    meta?: string | null
    /** How much of it is packed, 0–100. */
    percent: number
    /** The share in words, because a ring is a shape and not a sentence. */
    progress: string
    /** The line under it: what is still owed, where the weight is. */
    detail?: string | null
    /** Where tapping the card goes. */
    to: string
    /** Put on the card, for the cases that address the hero. */
    testid?: string
  }>(),
  { when: null, meta: null, detail: null, testid: undefined },
)
</script>

<template>
  <RouterLink :to="to" class="hero jp-card" :data-testid="testid">
    <p v-if="when" class="when jp-hero-eyebrow" data-testid="hero-when">{{ when }}</p>
    <h2 class="name jp-hero-title" data-testid="hero-name">{{ name }}</h2>
    <p v-if="meta" class="meta jp-meta" data-testid="hero-meta">{{ meta }}</p>

    <div class="foot">
      <ProgressRing :percent="percent" />
      <div class="progress">
        <b class="headline" data-testid="hero-progress">{{ progress }}</b>
        <span v-if="detail" class="detail" data-testid="hero-detail">{{ detail }}</span>
        <!-- The ring and the track say the same thing twice on purpose: the
             ring is the glance, the track is where the eye goes when the
             number is not the answer it wanted. -->
        <div class="track"><i :style="{ width: `${Math.max(0, Math.min(100, percent))}%` }" /></div>
      </div>
    </div>

    <div v-if="$slots.foot" class="foot actions">
      <slot name="foot" />
    </div>

    <!-- Whatever the screen puts under the numbers: M1 keeps its preview of
         what is still open there, which is the one thing the hero replaced
         that a person would have missed. -->
    <slot />
  </RouterLink>
</template>

<style scoped>
.hero {
  display: block;
  position: relative;
  overflow: hidden;
  padding: 18px 18px 16px;
  color: inherit;
  text-decoration: none;
  background: var(--jp-hero-wash), var(--jp-surface-card);
}

.when,
.meta {
  margin: 0;
}

.name {
  margin: 4px 0;
  overflow-wrap: anywhere;
}

.foot {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
}

/*
 * The actions read as a toolbar under the numbers rather than as four things
 * pushed to the card's two edges: they are one group, and `space-between`
 * over three of them put the archive glyph in the middle of nothing.
 * The rule above them is what separates the card's statement from its
 * controls, which the row got for free from the list's own dividers.
 */
.actions {
  gap: 2px;
  justify-content: flex-start;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--jp-surface-border);
}

.progress {
  flex: 1;
  min-width: 0;
}

.headline {
  display: block;
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

.detail {
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
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
