<script setup lang="ts">
/**
 * FR-25.28 — the for-whom seat: the row's leading *who* column, and the door
 * to the strip. A shared row shows an empty seat (FR-25.25's idiom, mirrored
 * to the other edge), a lone per-person row its traveler, and a cluster head
 * how many travelers it holds — the faces themselves are the child rows under
 * it, and the column stays one avatar wide so the names keep their x (FR-21.19).
 *
 * It is a `role="button"` span rather than the native element because one of
 * its two hosts, the cluster head, *is* one, and interactive content may not nest.
 *
 * It is `ion-activatable` for the same reason in reverse: Ionic's tap feedback
 * listens in the capture phase and lights the first activatable on the event's
 * path, so without the class a tap on the seat rippled the whole row — which
 * says *this opens the item*, the one thing the seat does not do.
 */
import { IonIcon } from '@ionic/vue'
import { peopleOutline } from 'ionicons/icons'

import UserAvatar from '@/components/global/UserAvatar.vue'
import { t } from '@/i18n'
import type { Traveler } from '@/types/domain'

defineProps<{
  /** The item's name, for the accessible label. */
  itemName: string
  /** How many travelers the item is for; 0 is *gemeinsam*. */
  memberCount: number
  /** The one traveler of a lone per-person row; a cluster head passes none. */
  traveler?: Traveler | null
  open: boolean
  testKey: string
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <!-- `.stop.prevent` and `@pointerdown.stop` for the reasons PackingRow's
       control column gives: the host's own tap and press-and-hold must not
       fire under a control that has its own meaning. -->
  <span
    class="seat ion-activatable"
    :class="{ open }"
    role="button"
    tabindex="0"
    :aria-expanded="open"
    :aria-label="t('forWhom.seat', { item: itemName })"
    :data-testid="`for-whom-seat-${testKey}`"
    @click.stop.prevent="emit('toggle')"
    @keydown.enter.stop.prevent="emit('toggle')"
    @keydown.space.stop.prevent="emit('toggle')"
    @pointerdown.stop
  >
    <UserAvatar v-if="traveler" :name="traveler.name" :seed="traveler.id" />
    <span v-else-if="memberCount > 0" class="count jp-num">{{ memberCount }}</span>
    <IonIcon v-else :icon="peopleOutline" class="empty" aria-hidden="true" />
  </span>
</template>

<style scoped>
.seat {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 40px;
  margin-inline-end: 4px;
  border-radius: var(--jp-r-pill);
  cursor: pointer;
}

.seat.open,
.seat.ion-activated {
  background: color-mix(in srgb, var(--jp-action) 16%, transparent);
}

.empty {
  font-size: var(--jp-icon-xs);
  color: var(--ct-overlay0);
  border: 1px dashed var(--ct-surface2);
  border-radius: 50%;
  padding: 4px;
}

.count {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--jp-action);
  color: var(--ct-on-accent);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-bold);
}
</style>
