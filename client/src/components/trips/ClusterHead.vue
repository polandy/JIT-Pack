<script setup lang="ts">
/**
 * The head of a per-person cluster (FR-25.1): the one line that names the
 * item, where the rows beneath it name travelers.
 *
 * FR-28.4 puts the mark here and nowhere else in the cluster — one tent,
 * not three — and the same holds for the mode and late glyphs, which is why
 * `PackingRow` and this line share `RowGlyphs`. It reads no store: the
 * resolved master row arrives as a prop, like everything else.
 *
 * Since FR-25.23 it is also the cluster's fold control, and shut is the
 * default: the head used to be an extra line above children that were always
 * open, so naming the item once cost a line rather than saving any. Shut it
 * has to answer for the rows it hides — who, and how far — which is why it
 * carries both the faces and the open count in that state.
 */
import { IonIcon } from '@ionic/vue'
import { chevronDownOutline } from 'ionicons/icons'

import ItemMark from '@/components/items/ItemMark.vue'
import RowGlyphs from '@/components/trips/RowGlyphs.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { t } from '@/i18n'
import type { ClusterFace } from '@/domain/packingView'
import type { MasterItem } from '@/types/domain'

/** The mark's box, in px — the same slot `PackingRow` gives an item row. */
const MARK_SIZE = 22

/**
 * A face on a shut head, in px. Smaller than a child row's 24 px avatar on
 * purpose: these summarise the rows rather than being them, and at row size
 * they read as a second list running down the head.
 */
const FACE_SIZE = 20

defineProps<{
  /** The item's name; the cluster is named once, here. */
  name: string
  /** How the item is obtained (FR-25.4a). */
  mode: string
  /** True when any instance in the cluster is a late packer. */
  late: boolean
  doneCount: number
  totalCount: number
  /** What a shut head answers with in place of done/total (FR-25.23). */
  openCount: number
  /** FR-25.23: shut is the default, so the children are not rendered. */
  collapsed: boolean
  /** One per instance, in roster order; only a shut head shows them. */
  faces: ClusterFace[]
  /** The master row behind the cluster, for its mark or photo; `null` when unknown. */
  master: MasterItem | null
}>()

defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    class="cluster-head"
    :class="{ shut: collapsed }"
    :data-testid="`m4-cluster-${name}`"
    :aria-expanded="!collapsed"
    @click="$emit('toggle')"
  >
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
    <span class="cluster-title">
      <span class="cluster-name">{{ name }}</span>
      <!-- The caret trails the name rather than leading the line: leading it
           would push the name off the item rows' x, which is the one thing
           `head-lead` exists to hold (FR-21.20). -->
      <IonIcon :icon="chevronDownOutline" class="caret" />
    </span>
    <RowGlyphs :mode="mode" :late="late" />
    <!-- Shut, the head is the whole cluster: it has to say *who* as well as
         how far, because no child row is left to name anybody (FR-25.23). -->
    <span v-if="collapsed" class="cluster-faces">
      <UserAvatar
        v-for="(face, i) in faces"
        :key="face.traveler?.id ?? `unassigned-${i}`"
        class="cluster-face"
        :class="{ done: face.done }"
        :size="FACE_SIZE"
        :name="face.traveler?.name"
        :seed="face.traveler?.id"
      />
    </span>
    <span class="cluster-count">
      {{ collapsed ? t('packing.openCount', { n: openCount }) : `${doneCount}/${totalCount}` }}
    </span>
  </button>
</template>

<style scoped>
.cluster-head {
  display: flex;
  align-items: center;
  gap: 8px;
  /* It became a button for FR-25.23; without the reset it would arrive with
     the agent stylesheet's own plane, rim and type. */
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
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

/* Shut, the head is a whole list line rather than the first of several, so
   it pays the bottom padding its children were paying. */
.cluster-head.shut {
  padding-bottom: 8px;
}

.cluster-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.cluster-name {
  text-align: start;
}

.cluster-count {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
  /* The count is the head's last word in both states, and "2 offen" is wider
     than "1/3" — without this the name would shift as the cluster folds. */
  white-space: nowrap;
}

/* The caret trails the item's name (see the template note). */
.caret {
  flex: none;
  font-size: var(--jp-icon-xs);
  color: var(--ct-subtext0);
  transition: transform 0.18s ease;
  transform: rotate(-90deg);
}

.cluster-head:not(.shut) .caret {
  transform: none;
}

.cluster-faces {
  display: flex;
  align-items: center;
  gap: 3px;
}

.cluster-face {
  /* The box comes from the component's own `size` prop, which it writes
     inline; only the state ring belongs here. */
  flex: none;
}

/* FR-25.2 hides a packed child but not its face, so the face is what says
   that instance is dealt with. */
.cluster-face.done {
  box-shadow: 0 0 0 2px var(--jp-done);
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
