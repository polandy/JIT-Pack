<script setup lang="ts">
/**
 * The head above a block of content, and the count that belongs to it
 * (G-13). One component rather than a class, because the head is two
 * things — a name and a number — set in two faces on one baseline, and
 * that is a composition rather than a declaration.
 *
 * It replaces fifty-five hand-written heads, each pairing the type role with
 * a local rule of its own. The role had already been named; what every screen
 * kept writing for itself was the spacing around it, in five different
 * values, which is why the margin lives here now and nowhere else.
 *
 * The count is passed as a value rather than composed into the title: four
 * heads used to join the two with a middle dot inside the translated string,
 * so the number was set in the title's face and could not be aligned with
 * anything.
 *
 * A `data-testid` is not a prop: with one root element it falls through to
 * the head, which is where a case looking for the section wants it.
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
  }>(),
  { count: null },
)
</script>

<template>
  <h2 class="section-head jp-section-head">
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
  margin: 24px 2px 10px;
}

.head-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.head-count {
  flex: none;
}
</style>
