<script setup lang="ts">
/**
 * One row of `ChoiceChip`s under a list's composer — the list, the phase, the
 * tags (M6 and M25 alike). A group with a name, so a screen reader hears what
 * the chips choose.
 */
defineProps<{ label: string }>()
</script>

<template>
  <div class="chip-row" role="group" :aria-label="label">
    <slot />
  </div>
</template>

<style scoped>
.chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
</style>
