<script setup lang="ts">
/**
 * The head of a per-person cluster (FR-25.1): the one line that names the
 * item, where the rows beneath it name travelers.
 *
 * FR-28.4 puts the mark here and nowhere else in the cluster — one tent,
 * not three — and the same holds for the mode and late glyphs, which is why
 * `PackingRow` and this line share `RowGlyphs`. It reads no store: the
 * resolved master row arrives as a prop, like everything else.
 */
import ItemMark from '@/components/items/ItemMark.vue'
import RowGlyphs from '@/components/trips/RowGlyphs.vue'
import type { MasterItem } from '@/types/domain'

/** The mark's box, in px — the same slot `PackingRow` gives an item row. */
const MARK_SIZE = 22

defineProps<{
  /** The item's name; the cluster is named once, here. */
  name: string
  /** How the item is obtained (FR-25.4a). */
  mode: string
  /** True when any instance in the cluster is a late packer. */
  late: boolean
  doneCount: number
  totalCount: number
  /** The master row behind the cluster, for its mark or photo; `null` when unknown. */
  master: MasterItem | null
}>()
</script>

<template>
  <div class="cluster-head" :data-testid="`m4-cluster-${name}`">
    <ItemMark
      :mark="master?.icon ?? null"
      surface="packing"
      :photo-item="master"
      :size="MARK_SIZE"
      class="row-mark"
    />
    <span class="cluster-name">{{ name }}</span>
    <RowGlyphs :mode="mode" :late="late" />
    <span class="cluster-count">{{ doneCount }}/{{ totalCount }}</span>
  </div>
</template>

<style scoped>
.cluster-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 2px;
  /* Three levels, three weights: the category heads the block, the
     per-person item names itself once inside it, and the traveler rows
     under that are plain. Two of them at the same size read as two
     groups rather than as a group and its contents. */
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-semibold);
  color: var(--ct-subtext1);
}

.cluster-name {
  flex: 1;
}

.cluster-count {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
}

/* FR-28.4: the slot holds its width even when empty, so the names stay in
   one column on a list where most rows carry no mark. */
.row-mark {
  margin-inline-end: 10px;
}
</style>
