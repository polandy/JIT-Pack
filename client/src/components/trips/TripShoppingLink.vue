<script setup lang="ts">
/**
 * A trip's way onto its shopping list from the dashboard (FR-30.5).
 *
 * The same pill and the same count as the trip switcher's (FR-21.21) — one
 * word for one destination — and a sibling of the trip card rather than a
 * part of it, because the card is itself a link and a link inside a link is
 * no link at all. The count comes from the composition root (FR-30.3): the
 * dashboard does not import the shopping module.
 */
import { IonIcon } from '@ionic/vue'
import { cartOutline } from 'ionicons/icons'
import { computed, inject } from 'vue'

import { t } from '@/i18n'
import { TRIP_VIEW_COUNTS } from '@/lib/tripViews'
import { tripSubPath } from '@/router/paths'

const props = defineProps<{
  tripId: string
  testid: string
}>()

const counts = inject(TRIP_VIEW_COUNTS, {})
const open = computed(() => counts.shopping?.(props.tripId) ?? 0)
</script>

<template>
  <RouterLink :to="tripSubPath(props.tripId, 'shopping')" class="shop-link" :data-testid="testid">
    <IonIcon :icon="cartOutline" aria-hidden="true" />
    <span>{{ open > 0 ? t('packing.shoppingCount', { n: open }) : t('packing.shopping') }}</span>
  </RouterLink>
</template>

<style scoped>
/* The trip switcher's pill (TripViewNav), so the two read as one control. */
.shop-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  text-decoration: none;
  white-space: nowrap;
}

.shop-link:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

.shop-link ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
