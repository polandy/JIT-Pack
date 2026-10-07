<script setup lang="ts">
/**
 * One row of `ChoiceChip`s — under a list's composer (the list, the phase,
 * the tags on M6 and M25) and in a sheet (M31's slot, day and shortlist). A
 * group with a name, so a screen reader hears what the chips choose.
 *
 * G-13: a chip's word is never cut. The row wraps by default; `scroll` is for
 * a run too long to wrap (a trip's days), and it scrolls by `useEdgeFades`'
 * one rule — faded on the side that has more, the pressed chip centred.
 */
import { ref } from 'vue'

import { useEdgeFades } from '@/composables/useEdgeFades'

const props = withDefaults(
  defineProps<{
    label: string
    /** One line that scrolls sideways instead of wrapping. */
    scroll?: boolean
    /** The pressed chip's value: a change scrolls the new one to the centre. */
    current?: string | number | null
  }>(),
  { scroll: false, current: null },
)

const row = ref<HTMLElement | null>(null)
const { moreStart, moreEnd, readEdges } = useEdgeFades(row, {
  current: '[aria-pressed="true"]',
  recentreOn: () => props.current,
})
</script>

<template>
  <div
    ref="row"
    class="chip-row"
    :class="scroll ? ['jp-edge-fades', { 'more-start': moreStart, 'more-end': moreEnd }] : 'wrap'"
    role="group"
    :aria-label="label"
    :data-scroll="scroll ? 'true' : undefined"
    @scroll.passive="readEdges"
  >
    <slot />
  </div>
</template>

<style scoped>
.chip-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chip-row.wrap {
  flex-wrap: wrap;
}

/* A chip wider than the whole row (an idea's long name) takes a line of its
   own and breaks its words there, rather than running past the edge. */
.chip-row.wrap > :slotted(*) {
  max-width: 100%;
  white-space: normal;
}

/* A scrolling chip keeps its whole word; the row moves instead. The bottom
   padding is the pressed chip's border — a scroller clips what overhangs it. */
.chip-row.jp-edge-fades {
  padding-bottom: 2px;
}

.chip-row.jp-edge-fades > :slotted(*) {
  flex: none;
}
</style>
