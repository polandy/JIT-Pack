<script setup lang="ts">
/**
 * FR-24.9: what a selection can be acted on with — the bulk bar and the four
 * sheets behind it. The acts themselves are `useBulkActions`.
 */
import { IonIcon } from '@ionic/vue'
import {
  ellipsisHorizontalOutline,
  pricetagsOutline,
  removeCircleOutline,
  trashOutline,
} from 'ionicons/icons'

import BulkBar from '@/components/global/BulkBar.vue'
import BulkAssigneeSheet from '@/components/items/BulkAssigneeSheet.vue'
import BulkDependencySheet from '@/components/items/BulkDependencySheet.vue'
import BulkTagSheet from '@/components/items/BulkTagSheet.vue'
import MergeItemsSheet from '@/components/items/MergeItemsSheet.vue'
import { DEPENDENCY_LINK_MAIN } from '@/domain/dependencies'
import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'

import { useBulkActions } from './useBulkActions'
import type { InventoryCore } from './useInventoryCore'

const { core } = defineProps<{ core: InventoryCore }>()

const masterStore = useMasterStore()
const { selecting, selected, directory } = core
const {
  bulkSheet,
  assigneeSheet,
  mergeSheet,
  dependencySheet,
  bulkTags,
  bulkCounts,
  giveTag,
  createAndGive,
  takeTag,
  openMore,
  assigneeCounts,
  unassignedCount,
  assignSelected,
  mergeCandidates,
  mergeSelected,
  linkSelected,
  retireSelected,
} = useBulkActions(core)
</script>

<template>
  <BulkBar v-if="selecting && selected.size > 0" data-testid="m9-bulkbar">
    <button type="button" data-testid="m9-bulk-give" @click="bulkSheet = 'give'">
      <IonIcon :icon="pricetagsOutline" />
      {{ t('items.bulkGive') }}
    </button>
    <button type="button" data-testid="m9-bulk-take" @click="bulkSheet = 'take'">
      <IonIcon :icon="removeCircleOutline" />
      {{ t('items.bulkTake') }}
    </button>
    <button type="button" data-testid="m9-bulk-more" @click="openMore">
      <IonIcon :icon="ellipsisHorizontalOutline" />
      {{ t('items.bulkMore') }}
    </button>
    <button type="button" class="danger" data-testid="m9-bulk-retire" @click="retireSelected">
      <IonIcon :icon="trashOutline" />
      {{ t('items.bulkRetire') }}
    </button>
  </BulkBar>

  <BulkTagSheet
    :is-open="bulkSheet !== null"
    :mode="bulkSheet ?? 'give'"
    :tags="bulkTags"
    :counts="bulkCounts"
    :selected="selected.size"
    @dismiss="bulkSheet = null"
    @create="createAndGive"
    @pick="
      ({ tagId, primary }) => (bulkSheet === 'take' ? takeTag(tagId) : giveTag(tagId, primary))
    "
  />

  <!-- FR-24.15: which of the picked rows stays, and what each brings. -->
  <MergeItemsSheet
    :is-open="mergeSheet"
    :candidates="mergeCandidates"
    @dismiss="mergeSheet = false"
    @pick="mergeSelected"
  />

  <BulkAssigneeSheet
    :is-open="assigneeSheet"
    :directory="directory"
    :counts="assigneeCounts"
    :selected="selected.size"
    :unassigned="unassignedCount"
    @dismiss="assigneeSheet = false"
    @pick="assignSelected"
  />

  <BulkDependencySheet
    :is-open="dependencySheet !== null"
    :direction="dependencySheet ?? DEPENDENCY_LINK_MAIN"
    :items="masterStore.activeItemList"
    :selected="selected.size"
    @dismiss="dependencySheet = null"
    @pick="linkSelected"
  />
</template>
