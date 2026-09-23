<script setup lang="ts">
/**
 * The Family-A "nothing here yet" note: one small line under an otherwise
 * populated section, not a screen-owning absence. `EmptyState.vue`'s own
 * doc comment draws that line already — this is its inline counterpart.
 * Content is a slot so each caller keeps its own i18n string.
 *
 * The default spacing matches the two byte-identical sites (`TripTodoList`,
 * `TripNoteList`). A caller whose spacing genuinely differs overrides it
 * with a passed `class` (layout stays with the caller, same as
 * `RemoveButton.vue`'s `.rm-gap`), never a prop — there is nothing here to
 * parametrize beyond the one shared look.
 */
</script>

<template>
  <p class="inline-hint"><slot /></p>
</template>

<style scoped>
.inline-hint {
  margin: 4px 14px 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}
</style>
