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
import { IonIcon } from '@ionic/vue'
import { checkmarkCircleOutline } from 'ionicons/icons'

import ProgressFigure from '@/components/global/ProgressFigure.vue'

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
     * FR-5.10: the packing is finished, so say *that* instead of drawing the
     * figure. The ring is the loudest thing on this card and it would be
     * answering a settled question — and the figure beside it, which is not
     * settled, takes the lone ring size back.
     */
    doneNote?: string | null
  }>(),
  { when: null, meta: null, detail: null, testid: undefined, doneNote: null },
)
</script>

<template>
  <RouterLink :to="to" class="hero jp-card" :data-testid="testid">
    <p v-if="when" class="when jp-hero-eyebrow" data-testid="hero-when">{{ when }}</p>
    <h2 class="name jp-hero-title" data-testid="hero-name">{{ name }}</h2>
    <p v-if="meta" class="meta jp-meta" data-testid="hero-meta">{{ meta }}</p>

    <!-- FR-7.4: a second answer may stand beside the share — M1 puts the
         trip's own todos there, which no packing figure counts. -->
    <div class="figures">
      <p v-if="doneNote" class="done-note" data-testid="hero-done">
        <IonIcon :icon="checkmarkCircleOutline" aria-hidden="true" />
        <span>{{ doneNote }}</span>
      </p>
      <ProgressFigure
        v-else
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
           construction rather than by two constants kept in step — and the
           full size once the packing figure has stood down. -->
      <div v-if="$slots.beside" class="beside">
        <slot name="beside" :ring-size="doneNote ? undefined : RING_SIZE_PAIRED" />
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

/* The settled half of the card: done ink, body size, no figure. It sits in
   the figures row so the card's rhythm is unchanged when the ring goes. */
.done-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  align-self: center;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.done-note ion-icon {
  flex: none;
  font-size: var(--jp-icon-sm);
  color: var(--jp-done);
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
