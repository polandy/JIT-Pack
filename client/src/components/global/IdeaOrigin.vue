<script setup lang="ts">
/**
 * FR-29.13: the line under a result made from an idea — the ideas' bulb and
 * the idea's title; a tap opens the idea over the board. Shared by M27, M25
 * and M6, so the three name an idea alike.
 *
 * Nothing is drawn for an idea this device does not hold: one deleted
 * elsewhere leaves the result standing (ON DELETE SET NULL), and the server
 * writes no change for the unlinked row, so a device may still carry the id.
 * Inside a tappable row the tap is the line's alone.
 */
import { IonIcon } from '@ionic/vue'
import { bulbOutline } from 'ionicons/icons'
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'

import { t } from '@/i18n'
import { IDEA_LOOKUP } from '@/kernel/ideaBridge'
import { tripIdeasPath } from '@/router/paths'

const props = defineProps<{
  tripId: string
  ideaId: string | null | undefined
  testid: string
}>()

const lookup = inject(IDEA_LOOKUP, null)
const router = useRouter()

const idea = computed(() => (props.ideaId ? lookup?.idea(props.tripId, props.ideaId) : undefined))

function open() {
  if (idea.value) void router.push(tripIdeasPath(props.tripId, idea.value.id))
}
</script>

<template>
  <button
    v-if="idea"
    type="button"
    class="idea-origin"
    :aria-label="t('trip.ideaOrigin', { title: idea.title })"
    :data-testid="testid"
    @click.stop="open"
  >
    <IonIcon :icon="bulbOutline" aria-hidden="true" />
    <span class="title">{{ idea.title }}</span>
  </button>
</template>

<style scoped>
.idea-origin {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--ct-subtext0);
  font: inherit;
  font-size: var(--jp-text-sm);
  text-align: start;
  cursor: pointer;
}

.idea-origin ion-icon {
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
