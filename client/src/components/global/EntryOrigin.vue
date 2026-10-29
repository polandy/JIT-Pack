<script setup lang="ts">
/**
 * FR-29.21: the line under a preparation step of a day-plan entry — the pencil
 * and the entry's title, as the idea's bulb names an idea (`IdeaOrigin`).
 *
 * Nothing is drawn for an entry this device does not hold: one deleted
 * elsewhere leaves the step an ordinary task (ON DELETE SET NULL).
 */
import { IonIcon } from '@ionic/vue'
import { createOutline } from 'ionicons/icons'
import { computed, inject } from 'vue'

import { t } from '@/i18n'
import { ENTRY_LOOKUP } from '@/kernel/ideaBridge'

const props = defineProps<{
  tripId: string
  entryId: string | null | undefined
  testid: string
}>()

const lookup = inject(ENTRY_LOOKUP, null)

const entry = computed(() =>
  props.entryId ? lookup?.entry(props.tripId, props.entryId) : undefined,
)
</script>

<template>
  <span
    v-if="entry"
    class="entry-origin"
    :aria-label="t('trip.entryOrigin', { title: entry.title })"
    :data-testid="testid"
  >
    <IonIcon :icon="createOutline" aria-hidden="true" />
    <span class="title">{{ entry.title }}</span>
  </span>
</template>

<style scoped>
.entry-origin {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.entry-origin ion-icon {
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
