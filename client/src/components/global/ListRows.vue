<script setup lang="ts">
/**
 * The open rows of a grouped list — M6's lines and M25's tasks (and M4's
 * window on the tasks) — as one `TransitionGroup`, so both lists move alike:
 * a row put somewhere else by hand (FR-30.13, FR-7.17), or pushed by another
 * one arriving or leaving, **glides** to its new place rather than jumping.
 *
 * A row leaving is the screen's call: `leave` runs the exit (M6's FR-25.11j
 * buy-out collapses a bought row through it); without one a row goes at once,
 * since a list whose rows fade on every re-filing reads as slow. `wash` tints
 * a leaving row in the done colour while it collapses — the buy-out's look.
 *
 * The styles are unscoped on purpose: the rows are the parent's slot, and
 * `TransitionGroup` puts its classes on them, where a scoped selector of this
 * component never reaches. The class prefix is this component's own.
 */
const props = withDefaults(
  defineProps<{
    /** Runs a leaving row's exit; `done` ends it. Absent: the row goes at once. */
    leave?: (el: Element, done: () => void) => void
    /** A leaving row washes the done colour (FR-25.11j). */
    wash?: boolean
  }>(),
  { leave: undefined, wash: false },
)

function onLeave(el: Element, done: () => void) {
  if (props.leave) props.leave(el, done)
  else done()
}
</script>

<template>
  <TransitionGroup tag="div" name="list-rows" class="list-rows" :class="{ wash }" @leave="onLeave">
    <slot />
  </TransitionGroup>
</template>

<style>
/* A wrapper with no footprint of its own. */
.list-rows {
  display: contents;
}

.list-rows-move {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* The exit's frame; its height is driven by the screen's `leave`. */
.list-rows-leave-active {
  transition:
    height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.3s ease,
    background-color 0.3s ease;
  overflow: hidden;
  pointer-events: none;
}

.list-rows.wash .list-rows-leave-from {
  background: color-mix(in srgb, var(--jp-done) 22%, transparent);
}

.list-rows-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .list-rows-leave-active,
  .list-rows-move {
    transition: none;
  }

  .list-rows.wash .list-rows-leave-from {
    background: none;
  }
}
</style>
