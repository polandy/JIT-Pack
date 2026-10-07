<script setup lang="ts">
/**
 * The head above a block of content, and the count that belongs to it
 * (G-13). One component rather than a class, because the head is two
 * things — a name and a number — set in two faces on one baseline, and
 * that is a composition rather than a declaration.
 *
 * It owns the spacing around the head as well as the type role: left to
 * each screen, that margin drifts into as many values as there are screens,
 * which is why it lives here and nowhere else.
 *
 * The count is passed as a value rather than composed into the title: joined
 * with a middle dot inside the translated string, the number would be set in
 * the title's face and could not be aligned with anything.
 *
 * A `data-testid` is not a prop: with one root element it falls through to
 * the head, which is where a case looking for the section wants it.
 *
 * The head has no side margin of its own: nearly every head sits in a padded
 * page, sheet or card, and an inset of its own on top of that put the count
 * a few pixels off the card's edge below it. The one placement without a
 * padded container — a head standing on a page of inset cards (M7, M8) —
 * is told so through `cardList`, so the component still owns the answer.
 */
withDefaults(
  defineProps<{
    title: string
    /**
     * The section's own number, set beside the name. A string where the
     * count is a phrase ("1 of 2"), which the catalogue owns because the
     * word between the figures is language.
     */
    count?: string | number | null
    /**
     * The head stands directly on an unpadded page between cards set in
     * `--jp-card-list-inset`, and takes the same inset so its name and count
     * meet the card's edges.
     */
    cardList?: boolean
  }>(),
  { count: null, cardList: false },
)
</script>

<template>
  <h2 class="section-head jp-section-head" :class="{ 'on-card-list': cardList }">
    <span class="head-name">{{ title }}</span>
    <span v-if="count !== null && count !== ''" class="head-count jp-section-count">
      {{ count }}
    </span>
  </h2>
</template>

<style scoped>
/* Baseline rather than centre: the two faces have different cap heights,
   and a centred count sits visibly high against the display face. */
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 24px 0 10px;
}

.section-head.on-card-list {
  margin-inline: var(--jp-card-list-inset);
}

.head-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.head-count {
  flex: none;
}
</style>
