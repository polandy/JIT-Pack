<script setup lang="ts">
/**
 * The phase a trip is in, after its dates (FR-7.10): a dot and one word — in
 * the done role's ink once the packing is finished, quiet before.
 */
defineProps<{ label: string; done: boolean; testid?: string }>()
</script>

<template>
  <span class="phase" :class="{ done }" :data-testid="testid">
    <i class="dot" aria-hidden="true" />{{ label }}
  </span>
</template>

<style scoped>
.phase {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-inline-start: 8px;
  color: var(--ct-subtext0);
  font-weight: var(--jp-weight-semibold);
}

.phase.done {
  color: var(--jp-done);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
</style>
