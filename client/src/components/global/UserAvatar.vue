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
 * The initials are the ground, not a placeholder: the picture is laid over
 * them when there is one and it loads. That ordering is deliberate — the
 * avatar endpoint 404s for an account that never uploaded one, which is the
 * common case, and a bare `<img>` on it renders the browser's torn-picture
 * glyph or, once hidden, a hole where a person should be. Both were on
 * screen until 2026-08-28.
 *
 * The colour is a deterministic pick from the accent tokens (invariant 9),
 * so the same person is the same colour on every screen and across reloads
 * without anything being stored.
 */
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Display name where one is known; falls back to the id, then to "?". */
    name?: string | null
    /** Identity the colour is derived from — stable where the name is not. */
    seed?: string | null
    variant?: 'plain' | 'assignee' | 'packer'
    size?: number
    /** Picture URL. Absent, still loading or 404 — the initials stand. */
    src?: string | null
  }>(),
  { name: null, seed: null, variant: 'plain', size: 24, src: null },
)

/**
 * A picture that answered with something that is not an image. Reset when
 * the URL changes, or a re-upload (which only moves the cache-busting query)
 * would stay hidden behind the previous failure.
 */
const broken = ref(false)
watch(
  () => props.src,
  () => (broken.value = false),
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

/**
 * The letters take a size from the type table rather than a fraction of the
 * circle: invariant 9b keeps every type value in `typography.css`, and two
 * steps cover the sizes this component is actually used at — the 24 px row
 * avatar and the 40/64 px profile ones.
 */
const LARGE_FROM_PX = 32
const sizeClass = computed(() => (props.size >= LARGE_FROM_PX ? 's-lg' : 's-sm'))

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
    :class="[`v-${variant}`, sizeClass]"
    :style="{ background: color, width: `${size}px`, height: `${size}px` }"
    :title="label"
    :aria-label="label"
    data-testid="user-avatar"
    >{{ initials
    }}<img
      v-if="src && !broken"
      class="picture"
      :src="src"
      alt=""
      data-testid="user-avatar-picture"
      @error="broken = true"
    /><span v-if="variant === 'packer'" class="tick" aria-hidden="true">✓</span></span
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
  font-weight: var(--jp-weight-bold);
  letter-spacing: var(--jp-tracking-tight);
}

.s-sm {
  font-size: var(--jp-text-3xs);
}

.s-lg {
  font-size: var(--jp-text-lg);
}

/* Over the initials rather than instead of them: a picture that is still
   loading, or never arrives, leaves the letters showing. */
.picture {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
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
