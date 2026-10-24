<script setup lang="ts">
/**
 * FR-13.4: the line under a trip task made from a series task — a repeat
 * glyph and the series' name (ADR-106). Shared by M25's row and its sheet,
 * so the two name a series task's origin alike.
 *
 * Nothing is drawn once the series task it names is gone: ON DELETE SET NULL
 * leaves `destination_task_id` on the row, and the server writes no change
 * for the unlinked column, so a device may still carry the id.
 */
import { IonIcon } from '@ionic/vue'
import { repeatOutline } from 'ionicons/icons'
import { computed } from 'vue'

import { useMasterStore } from '@/stores/masterStore'

const props = defineProps<{
  destinationTaskId: string | null | undefined
  testid: string
}>()

const masterStore = useMasterStore()

const series = computed(() =>
  props.destinationTaskId
    ? masterStore.getSeriesOfDestinationTask(props.destinationTaskId)
    : undefined,
)
</script>

<template>
  <span v-if="series" class="series-origin" :data-testid="testid">
    <IonIcon :icon="repeatOutline" aria-hidden="true" />
    <span class="title">{{ series.name }}</span>
  </span>
</template>

<style scoped>
.series-origin {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.series-origin ion-icon {
  flex: none;
  color: var(--jp-brand);
  font-size: var(--jp-icon-xs);
}

.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
