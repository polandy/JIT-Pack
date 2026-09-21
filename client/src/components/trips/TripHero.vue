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
 *
 * **Once the packing is finished the card stops being one link** (`workable`,
 * FR-7.9, ADR-073): the figure gives way to the slot, whose blocks are
 * worked in place, and a control cannot sit inside a link. Only the head —
 * dates, name, counter, meta — leads into the trip then.
 */
import ProgressFigure from '@/components/global/ProgressFigure.vue'

import TripPhase from './TripPhase.vue'

/**
 * The ring of either figure once a second stands beside the share: two
 * columns of a phone-wide card cannot each carry the lone figure's ring and
 * still keep their sentence on one line.
 */
const RING_SIZE_PAIRED = 46

withDefaults(
  defineProps<{
    /** The trip's name. */
    name: string
    /** When it is — the line above the name. */
    when?: string | null
    /** The phase word after the dates (FR-7.9). */
    phase?: { label: string; done: boolean } | null
    /** The day counter opposite the name (FR-7.9). */
    counter?: { headline: string; sub: string | null } | null
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
    /**
     * FR-7.9: the packing is finished. The figure is not drawn, the default
     * slot carries the blocks, and only the head is a link.
     */
    workable?: boolean
  }>(),
  {
    when: null,
    phase: null,
    counter: null,
    meta: null,
    detail: null,
    testid: undefined,
    workable: false,
  },
)
</script>

<template>
  <!-- FR-7.9: worked in place, so the card is not a link — its head is. -->
  <div v-if="workable" class="hero jp-card" :data-testid="testid">
    <RouterLink :to="to" class="head" data-testid="hero-head">
      <p v-if="when" class="when jp-hero-eyebrow" data-testid="hero-when">
        {{ when }}
        <TripPhase v-if="phase" v-bind="phase" testid="hero-phase" />
      </p>
      <div class="title-row">
        <h2 class="name jp-hero-title" data-testid="hero-name">{{ name }}</h2>
        <p v-if="counter" class="counter" data-testid="hero-counter">
          <b>{{ counter.headline }}</b>
          <span v-if="counter.sub">{{ counter.sub }}</span>
        </p>
      </div>
      <p v-if="meta" class="meta jp-meta" data-testid="hero-meta">{{ meta }}</p>
    </RouterLink>

    <div class="blocks">
      <slot name="blocks" />
    </div>

    <div v-if="$slots.foot" class="actions">
      <slot name="foot" />
    </div>
  </div>

  <RouterLink v-else :to="to" class="hero jp-card" :data-testid="testid">
    <p v-if="when" class="when jp-hero-eyebrow" data-testid="hero-when">
      {{ when }}
      <TripPhase v-if="phase" v-bind="phase" testid="hero-phase" />
    </p>
    <div class="title-row">
      <h2 class="name jp-hero-title" data-testid="hero-name">{{ name }}</h2>
      <p v-if="counter" class="counter" data-testid="hero-counter">
        <b>{{ counter.headline }}</b>
        <span v-if="counter.sub">{{ counter.sub }}</span>
      </p>
    </div>
    <p v-if="meta" class="meta jp-meta" data-testid="hero-meta">{{ meta }}</p>

    <!-- FR-7.4: a second answer may stand beside the share — M1 puts the
         trip's own todos there, which no packing figure counts. -->
    <div class="figures">
      <ProgressFigure
        class="hero-figure"
        :percent="percent"
        :headline="progress"
        :detail="detail"
        :ring-size="$slots.beside ? RING_SIZE_PAIRED : undefined"
        :paired="!!$slots.beside"
        headline-testid="hero-progress"
        detail-testid="hero-detail"
      />
      <!-- The slot is handed the ring size, so the pair is one size by
           construction rather than by two constants kept in step. -->
      <div v-if="$slots.beside" class="beside">
        <slot name="beside" :ring-size="RING_SIZE_PAIRED" />
      </div>
    </div>

    <div v-if="$slots.foot" class="actions">
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

.head {
  display: block;
  color: inherit;
  text-decoration: none;
}

.title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.counter {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  margin: 0;
  padding-bottom: 4px;
  line-height: 1.2;
}

.counter b {
  color: var(--jp-action);
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-bold);
}

.counter span {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

/* FR-7.9: the two blocks, side by side where 300 px each fit and stacked
   where they do not — no breakpoint, the basis decides. */
.blocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 14px;
  margin-top: 14px;
}

.figures {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 12px 16px;
  margin-top: 16px;
}

/* Two columns where both sentences fit, one above the other where they do
   not: the basis is the paired ring, its gap and the longest sentence
   measured (*„118/118 gepackt"*, 115 px), so a phone stacks the pair rather
   than ellipsizing it, and neither needs a breakpoint of its own (FR-7.4). */
.hero-figure,
.beside {
  flex: 1 1 11rem;
  min-width: 0;
}

/*
 * The actions read as a toolbar under the numbers rather than as four things
 * pushed to the card's two edges: they are one group, and `space-between`
 * over three of them put the archive glyph in the middle of nothing.
 * The rule above them is what separates the card's statement from its
 * controls, which the row got for free from the list's own dividers.
 */
.actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--jp-surface-border);
}
</style>
