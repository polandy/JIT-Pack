<script setup lang="ts">
/**
 * A person, as a circle (FR-25.3).
 *
 * Three variants, and the distinction is the point on a packing row:
 * `plain` answers *for whom* (the traveler, left edge), `assignee` who is
 * on the hook (blue ring), `packer` who actually did it (green ring plus
 * a check). Only one of the latter two ever occupies a row's right edge —
 * with the traveler avatar already on the left, a third circle makes the
 * row unreadable (FR-25.19).
 *
 * Initials stand in until user profiles carry pictures. The colour is a
 * deterministic pick from the accent tokens (invariant 9), so the same
 * person is the same colour on every screen and across reloads without
 * anything being stored.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Display name where one is known; falls back to the id, then to "?". */
    name?: string | null
    /** Identity the colour is derived from — stable where the name is not. */
    seed?: string | null
    variant?: 'plain' | 'assignee' | 'packer'
    size?: number
  }>(),
  { name: null, seed: null, variant: 'plain', size: 24 },
)

/** Accent tokens only — never a literal colour (invariant 9). */
const PALETTE = [
  'var(--ct-blue)',
  'var(--ct-mauve)',
  'var(--ct-peach)',
  'var(--ct-teal)',
  'var(--ct-pink)',
  'var(--ct-yellow)',
  'var(--ct-sapphire)',
  'var(--ct-lavender)',
] as const

const label = computed(() => props.name ?? props.seed ?? '?')

const initials = computed(() => {
  const words = (props.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  const source = words[0] ?? props.seed ?? ''
  return (
    source
      .replace(/[^\p{L}\p{N}]/gu, '')
      .slice(0, 2)
      .toUpperCase() || '?'
  )
})

const color = computed(() => {
  const source = props.seed ?? props.name ?? ''
  let hash = 0
  for (const char of source) hash = (hash * 31 + char.codePointAt(0)!) % 1_000_003
  return PALETTE[hash % PALETTE.length]
})
</script>

<template>
  <span
    class="avatar"
    :class="`v-${variant}`"
    :style="{ background: color, width: `${size}px`, height: `${size}px` }"
    :title="label"
    :aria-label="label"
    >{{ initials }}<span v-if="variant === 'packer'" class="tick" aria-hidden="true">✓</span></span
  >
</template>

<style scoped>
.avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: 50%;
  color: var(--ct-on-accent);
  font-size: var(--jp-text-3xs);
  font-weight: var(--jp-weight-bold);
  letter-spacing: var(--jp-tracking-tight);
}

/* The ring is what carries the meaning, so it sits outside the circle
   rather than eating into it — at 24px an inset border loses the letters. */
.v-assignee {
  box-shadow: 0 0 0 2px var(--ct-blue);
}

.v-packer {
  box-shadow: 0 0 0 2px var(--ct-green);
}

.tick {
  position: absolute;
  right: -3px;
  bottom: -3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--ct-green);
  color: var(--ct-on-accent);
  font-size: var(--jp-text-3xs);
  line-height: 1;
}
</style>
