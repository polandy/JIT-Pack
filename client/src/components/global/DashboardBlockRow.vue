<script setup lang="ts">
/**
 * One row of a dashboard block (FR-7.10): the words, a quieter line beneath,
 * and the check on the **right**, always — the thumb rests there.
 *
 * The box is 28 px drawn inside a target 56 × 52 px that runs to the block's
 * edge, so a tap that lands a little beside the box is still the box.
 */
defineProps<{
  title: string
  /** What kind of thing it is — a tag, a quantity, a name — or null for nothing. */
  sub: string | null
  /** The accessible name of the check. */
  checkLabel: string
  testid: string
}>()

const emit = defineEmits<{ check: [] }>()
</script>

<template>
  <li class="row" :data-testid="testid">
    <span class="words">
      <span class="title">{{ title }}</span>
      <span v-if="sub" class="sub">{{ sub }}</span>
    </span>
    <button
      type="button"
      class="check"
      role="checkbox"
      aria-checked="false"
      :aria-label="checkLabel"
      :data-testid="`${testid}-check`"
      @click="emit('check')"
    >
      <span class="box" aria-hidden="true" />
    </button>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  border-top: 1px solid var(--ct-surface0);
}

.words {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.title {
  font-size: var(--jp-text-lg);
  overflow-wrap: anywhere;
}

.sub {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.check {
  display: grid;
  flex: none;
  place-items: center;
  width: 56px;
  height: 52px;
  margin-inline-end: -10px;
  padding: 0;
  border: 0;
  border-radius: var(--jp-r-sm);
  background: none;
  cursor: pointer;
}

.box {
  width: 28px;
  height: 28px;
  border: 2px solid var(--ct-subtext0);
  border-radius: var(--jp-r-xs);
}

.check:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}
</style>
