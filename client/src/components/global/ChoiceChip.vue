<script setup lang="ts">
/**
 * One choice among a row of them — M25's composer and its quick days
 * (FR-7.14). A button that says whether it is chosen (`aria-pressed`), in
 * the shape M6's tag chips and the task sheet's tags already wear, so a
 * chosen chip reads the same on every list.
 *
 * `add` is the quiet variant for the chip that makes a new choice (*＋ Tag*,
 * *Datum…*): it opens something rather than being something.
 */
withDefaults(
  defineProps<{
    /** Whether this is the choice in force. */
    pressed?: boolean
    /** The chip that opens a new choice rather than being one. */
    add?: boolean
    /**
     * The accessible name, where the chip's words are not the whole act —
     * the day in force, whose tap takes it off. Absent: the words name it.
     */
    label?: string
  }>(),
  { pressed: false, add: false, label: undefined },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="choice-chip"
    :class="{ add }"
    :aria-pressed="add ? undefined : pressed ? 'true' : 'false'"
    :aria-label="label"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.choice-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
  cursor: pointer;
}

.choice-chip[aria-pressed='true'] {
  border-color: var(--jp-action);
  background: color-mix(in srgb, var(--jp-action) 14%, transparent);
  color: var(--jp-action);
  font-weight: var(--jp-weight-semibold);
}

.choice-chip.add {
  border-style: dashed;
  background: none;
  color: var(--ct-subtext0);
}

.choice-chip:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}
</style>
