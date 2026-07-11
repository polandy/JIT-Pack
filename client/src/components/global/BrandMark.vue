<script setup lang="ts">
/**
 * JIT-Pack brand mark ("Check-Latch"): a suitcase whose latch is a cut-out
 * checkmark. Single color via --ion-color-primary so it follows the active
 * flavor (G-11), and the mask cutout lets the surface show through — the
 * same mark works on any background in both Mocha and Latte.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 24 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true" class="brand-mark">
    <defs>
      <mask id="brand-mark-check">
        <rect width="64" height="64" fill="#fff" />
        <polyline
          points="22 38.5,29.5 46,43 30.5"
          fill="none"
          stroke="#000"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </mask>
    </defs>
    <path
      d="M24 20.5v-4a8 8 0 0 1 16 0v4"
      fill="none"
      stroke="var(--ion-color-primary)"
      stroke-width="5"
      stroke-linecap="round"
    />
    <rect
      x="8"
      y="20.5"
      width="48"
      height="37"
      rx="10.5"
      fill="var(--ion-color-primary)"
      mask="url(#brand-mark-check)"
    />
  </svg>
</template>

<style scoped>
.brand-mark {
  display: block;
  flex: none;
}
</style>
