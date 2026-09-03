<script setup lang="ts">
/**
 * The two glyphs an M4 line can carry about the *item*: how it is obtained
 * (FR-25.4a) and whether it is a late packer.
 *
 * They are on two lines that are not the same component — an item row and a
 * per-person cluster head — and the pair had been written and styled twice.
 * The head shows them once for the whole cluster; a child row shows none,
 * because the head above it already did.
 *
 * A fragment on purpose: both callers place these inside their own flex row,
 * and a wrapper element would be a third box in a layout that counts them.
 */
import { IonIcon } from '@ionic/vue'
import { timeOutline } from 'ionicons/icons'

import { t } from '@/i18n'
import { DENSE_LIST, modeIcon, modeLabel } from '@/lib/modeLabels'

defineProps<{
  /** The item's `mode`; the 🧳 default draws nothing on a dense list. */
  mode: string
  /** FR-25.4a's ⏰ — on a cluster, true when any instance carries it. */
  late: boolean
}>()
</script>

<template>
  <IonIcon
    v-if="modeIcon(mode, DENSE_LIST)"
    :icon="modeIcon(mode, DENSE_LIST)!"
    class="mode-icon"
    :title="modeLabel(mode)"
  />
  <IonIcon v-if="late" :icon="timeOutline" class="late-icon" :title="t('mode.latePacker')" />
</template>

<style scoped>
.mode-icon {
  color: var(--ct-peach);
  font-size: var(--jp-icon-sm);
}

.late-icon {
  color: var(--ct-yellow);
  font-size: var(--jp-icon-sm);
}
</style>
