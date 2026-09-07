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
    <!-- The same lead column a row has (FR-21.19), so the head starts its
         name on the item rows' x rather than on its children's. -->
    <div class="head-lead">
      <ItemMark
        :mark="master?.icon ?? null"
        surface="packing"
        :photo-item="master"
        :size="MARK_SIZE"
        class="row-mark"
      />
    </div>
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
  /* The inline start matches an `ion-item`'s in this list, because the head
     is one of the list's lines and not a heading over it (FR-21.20). */
  padding: 10px 14px 2px 12px;
  /* Three levels: the section head names the block, the per-person item
     names itself once inside it at the row's own size, and the traveler
     rows under that step down (FR-21.16). The item is the thing being
     packed and the person only qualifies it, so the head must not be the
     recessive line of the two — it read one step *below* its own children
     until 2026-09-07. */
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  color: var(--ct-text);
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

/* A row's label sits 16px past its lead column; the flex `gap` above pays
   8 of that, so the lead pays the other 8 and the head's name lands on the
   same x as every item row's (FR-21.20). */
.head-lead {
  display: flex;
  align-items: center;
  margin-inline-end: 8px;
}
</style>
