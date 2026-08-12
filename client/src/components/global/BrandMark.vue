<script setup lang="ts">
/**
 * JIT-Pack brand mark ("Packed Backpack"): an open backpack with two packing
 * cubes peeking out. In-app it renders without the tile the favicon carries,
 * and every color is a --ct-* token so the mark follows the active flavor
 * (G-11) on any background in both Mocha and Latte.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 24 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="88 96 336 336" aria-hidden="true" class="brand-mark">
    <rect x="156" y="128" width="96" height="72" rx="18" fill="var(--ct-teal)" />
    <rect x="268" y="112" width="80" height="88" rx="18" fill="var(--ct-peach)" />
    <rect
      x="136"
      y="196"
      width="240"
      height="220"
      rx="52"
      fill="none"
      stroke="var(--ct-lavender)"
      stroke-width="32"
      stroke-linejoin="round"
    />
    <path
      d="M180 414 V348 q0 -26 26 -26 h100 q26 0 26 26 v66"
      fill="none"
      stroke="var(--ct-lavender)"
      stroke-width="24"
      stroke-linejoin="round"
      stroke-linecap="butt"
    />
  </svg>
</template>

<style scoped>
.brand-mark {
  display: block;
  flex: none;
}
</style>
