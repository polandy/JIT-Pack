<script setup lang="ts">
/**
 * One section of a two-part list — M25's phase, M6's list (one component so
 * the two read alike). Its head names it and
 * counts what stands under it; the caller fills the groups and the fold.
 * Headless where the page draws it inside its `RestLine`.
 */
import SectionHead from '@/components/global/SectionHead.vue'

withDefaults(
  defineProps<{
    title: string
    count?: string | null
    headless?: boolean
    testid: string
  }>(),
  { count: null, headless: false },
)
</script>

<template>
  <section class="list-section" :data-testid="testid">
    <SectionHead v-if="!headless" :title="title" :count="count" />
    <slot />
  </section>
</template>

<style scoped>
.list-section :deep(.section-head) {
  margin: 18px 16px 4px;
}

/* The groups sit in one list per section, full width. */
.list-section :deep(.list-groups) {
  padding: 0;
  background: transparent;
}
</style>
