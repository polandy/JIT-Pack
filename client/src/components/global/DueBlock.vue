<script setup lang="ts">
/**
 * *Fällig* — what is overdue, due today or in the next two days, read above
 * a list's sections (M25's FR-7.14 block, M6's FR-30.11 block; one component
 * for both). Tinted faintly in the overdue ink: it is the one place
 * on the screen that asks to be read first. Not a drop target — what makes a
 * line pressing is its day, not where it was put.
 */
import { IonList } from '@ionic/vue'

import ListGroup from '@/components/global/ListGroup.vue'

defineProps<{ title: string; count: number; testid: string }>()
</script>

<template>
  <IonList class="due-block" :data-testid="testid">
    <ListGroup :title="title" :count="count">
      <slot />
    </ListGroup>
  </IonList>
</template>

<style scoped>
.due-block {
  margin-top: 8px;
  padding: 0;
  background: transparent;
}

.due-block :deep(ion-item) {
  --background: color-mix(in srgb, var(--ct-ember) 6%, var(--jp-surface-card));
}
</style>
