<script setup lang="ts" generic="R extends PackableRow">
/**
 * M4's list body: the groups, their per-person clusters (FR-25.1) and rows,
 * and the leave a packed row makes (FR-25.2). It reads rows through the
 * page's resolvers and reports every act as an event — the writes stay with
 * the page's composables. M27 renders its list through it too (FR-31.6),
 * under its own `screen` handle, without the *who* column, and with what a
 * line needs done in the `#facts` slot under each row's name.
 */
import { IonIcon, IonList } from '@ionic/vue'
import { chevronDownOutline } from 'ionicons/icons'

import ClusterHead from '@/components/trips/ClusterHead.vue'
import ForWhomStrip from '@/components/trips/ForWhomStrip.vue'
import PackingRow from '@/components/trips/PackingRow.vue'
import type { LongPress } from '@/composables/shared/useLongPress'
import type { PackableRow, PackingCluster, PackingEntry, PackingGroup } from '@/domain/packingView'
import { t } from '@/i18n'
import { collapseRow } from '@/lib/rowCollapse'
import type { TripParticipant } from '@/types/domain'

import type { ForWhom } from './useForWhom'
import type { ListFacts } from './useRowFacts'

const props = withDefaults(
  defineProps<{
    tripId: string
    groups: PackingGroup<R>[]
    closingPass: boolean
    facts: ListFacts<R>
    /** FR-25.28's *who* column; absent where the list has none (M27). */
    forWhom?: ForWhom | null
    /** The roster the *who* strip offers; read only with {@link forWhom}. */
    participants?: TripParticipant[]
    /** FR-5.5's press and hold, on a row and on a cluster head. */
    rowHold: LongPress<R>
    clusterHold?: LongPress<PackingCluster> | null
    /** Whose handles the list's `data-testid`s carry, as `PackingRow`'s do. */
    screen?: 'm4' | 'm27'
  }>(),
  { forWhom: null, participants: () => [], clusterHold: null, screen: 'm4' },
)

defineSlots<{
  /** Under a row's name, after M4's own notes; `child` marks a traveler's row. */
  facts?(scope: { item: R; testKey: string; child: boolean }): unknown
}>()

defineEmits<{
  toggleGroup: [key: string]
  toggleCluster: [key: string]
  clusterMenu: [cluster: PackingCluster]
  rowMenu: [item: R]
  toggleForWhom: [entry: PackingEntry]
  assign: [item: R, traveler?: string]
  open: [itemId: string]
  passToggle: [item: R]
  editQuantity: [item: R, event: MouseEvent]
  increment: [item: R]
  decrement: [item: R]
  complete: [item: R]
  zero: [item: R]
  toggle: [item: R]
}>()

/**
 * Honoured for the row collapse as well as the flash — checked live, since
 * the setting can change while the screen is open. The duration lives in CSS
 * only: `collapseRow` waits on `transitionend` rather than on a number.
 */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/**
 * Collapse a leaving row to zero height — the rules are in `collapseRow`.
 *
 * **Except where the item is only changing shape** (FR-25.28, `isReshaped`):
 * its old shape goes at once rather than standing beside its replacement.
 */
function onRowLeave(el: Element, done: () => void) {
  const { forWhomKey: key, rowId } = (el as HTMLElement).dataset
  if (key !== undefined && props.forWhom?.reshaped(key, rowId ?? null)) {
    done()
    return
  }
  collapseRow(el as HTMLElement, done, reducedMotion.matches)
}

/**
 * FR-5.5's press-and-hold is the *row's*, and the packing control is not the
 * row (E2E-G6-01). `PackingRow` stops the press at the control itself, so a
 * press that reaches this handler is already the row's.
 */
function onRowPress(item: R, event: PointerEvent): void {
  props.rowHold.down(item, event.clientX, event.clientY)
}
</script>

<template>
  <IonList>
    <template v-for="group in groups" :key="group.key">
      <button
        class="group-head"
        :class="{ shut: group.collapsed }"
        :data-testid="`${screen === 'm27' ? 'm27-group' : 'm4-group'}-${group.key || 'none'}`"
        @click="$emit('toggleGroup', group.key)"
      >
        <IonIcon :icon="chevronDownOutline" class="caret" />
        <span class="group-name">{{ group.name ?? t('common.none') }}</span>
        <!-- Collapsed, the header is all that is left of the group, so it
             answers what the hidden rows would have (FR-25.16). -->
        <span class="group-count">
          {{
            group.collapsed
              ? t('packing.openCount', { n: group.openCount })
              : `${group.doneCount}/${group.totalCount}`
          }}
        </span>
      </button>

      <!-- FR-25.2: a packed row leaves rather than vanishes. TransitionGroup
           keeps the node until its leave finishes, so nothing here has to
           hold a "still animating" set in the view model — the DOM does it.
           `tag="div"` because the card needs a block child; `:css="false"`
           is deliberately *not* used, the height is driven from a hook and
           the fade from CSS. -->
      <TransitionGroup
        v-if="!group.collapsed"
        name="pack-out"
        tag="div"
        class="group-card jp-card"
        @leave="onRowLeave"
      >
        <template
          v-for="entry in group.entries"
          :key="entry.kind === 'item' ? entry.item.id : entry.key"
        >
          <!-- FR-25.1: a per-person item is named once, with one child
               row per traveler under it. -->
          <div
            v-if="entry.kind === 'cluster'"
            class="cluster"
            :data-for-whom-key="forWhom?.keyOf(entry)"
          >
            <ClusterHead
              :screen="screen"
              :name="entry.name"
              :mode="entry.mode"
              :late="entry.latePacker"
              :done-count="entry.doneCount"
              :total-count="entry.totalCount"
              :open-count="entry.openCount"
              :collapsed="entry.collapsed"
              :faces="entry.faces"
              :master="facts.clusterMaster(entry)"
              :seat="forWhom?.seatFor(entry) ?? null"
              @for-whom="$emit('toggleForWhom', entry)"
              @toggle="$emit('toggleCluster', entry.key)"
              @menu="$emit('clusterMenu', entry)"
              @press-start="(e: PointerEvent) => clusterHold?.down(entry, e.clientX, e.clientY)"
              @press-move="(e: PointerEvent) => clusterHold?.move(e.clientX, e.clientY)"
              @press-end="clusterHold?.cancel()"
            />

            <ForWhomStrip
              v-if="forWhom?.openOn(entry)"
              :trip-id="tripId"
              :item-id="entry.instanceIds[0] ?? ''"
              :participants="participants"
              :test-key="entry.name"
            />

            <div v-if="!entry.collapsed" class="cluster-children">
              <PackingRow
                v-for="child in entry.children"
                :key="child.item.id"
                :screen="screen"
                variant="child"
                :item="child.item"
                :label="child.traveler?.name ?? child.label"
                :test-key="`${entry.name}-${child.traveler?.name ?? ''}`"
                :done="child.done"
                :locked="facts.locked(child.item)"
                :closing-pass="closingPass"
                :notes="facts.rowNotes(child.item)"
                :borrowed-by="facts.borrowedBy(child.item.id)"
                :traveler="child.traveler"
                :edge-avatar="facts.edgeAvatarFor(child.item)"
                :assignable="facts.assignableRow(child.item)"
                @assign="$emit('assign', child.item, child.traveler?.name)"
                @open="$emit('open', child.item.id)"
                @menu="$emit('rowMenu', child.item)"
                @press-start="(e: PointerEvent) => onRowPress(child.item, e)"
                @press-move="(e: PointerEvent) => rowHold.move(e.clientX, e.clientY)"
                @press-end="rowHold.cancel()"
                @pass-toggle="$emit('passToggle', child.item)"
                @edit-quantity="(e: MouseEvent) => $emit('editQuantity', child.item, e)"
                @increment="$emit('increment', child.item)"
                @decrement="$emit('decrement', child.item)"
                @complete="$emit('complete', child.item)"
                @zero="$emit('zero', child.item)"
                @toggle="$emit('toggle', child.item)"
              >
                <template v-if="$slots.facts" #facts>
                  <slot
                    name="facts"
                    :item="child.item"
                    :test-key="`${entry.name}-${child.traveler?.name ?? ''}`"
                    :child="true"
                  />
                </template>
              </PackingRow>
            </div>
          </div>

          <PackingRow
            v-else
            :screen="screen"
            :item="entry.item"
            :label="entry.label"
            :test-key="entry.item.name"
            :done="entry.done"
            :locked="facts.locked(entry.item)"
            :closing-pass="closingPass"
            :notes="facts.rowNotes(entry.item)"
            :traveler="entry.traveler"
            :master="facts.masterOf(entry.item)"
            :prep-count="facts.openTodoCount(entry.item.id)"
            :borrowed-by="facts.borrowedBy(entry.item.id)"
            :edge-avatar="facts.edgeAvatarFor(entry.item)"
            :assignable="facts.assignableRow(entry.item)"
            :seat="forWhom?.seatFor(entry) ?? null"
            :data-for-whom-key="forWhom?.keyOf(entry)"
            :data-row-id="entry.item.id"
            @for-whom="$emit('toggleForWhom', entry)"
            @assign="$emit('assign', entry.item)"
            @open="$emit('open', entry.item.id)"
            @menu="$emit('rowMenu', entry.item)"
            @press-start="(e: PointerEvent) => onRowPress(entry.item, e)"
            @press-move="(e: PointerEvent) => rowHold.move(e.clientX, e.clientY)"
            @press-end="rowHold.cancel()"
            @pass-toggle="$emit('passToggle', entry.item)"
            @edit-quantity="(e: MouseEvent) => $emit('editQuantity', entry.item, e)"
            @increment="$emit('increment', entry.item)"
            @decrement="$emit('decrement', entry.item)"
            @complete="$emit('complete', entry.item)"
            @zero="$emit('zero', entry.item)"
            @toggle="$emit('toggle', entry.item)"
          >
            <template v-if="$slots.facts" #facts>
              <slot name="facts" :item="entry.item" :test-key="entry.item.name" :child="false" />
            </template>
          </PackingRow>
          <!-- FR-25.28: the strip unfolds under the row it belongs to, as a
               line of the same card. Keyed, because a TransitionGroup
               child has to be. -->
          <ForWhomStrip
            v-if="entry.kind === 'item' && forWhom?.openOn(entry)"
            key="for-whom"
            :data-for-whom-key="forWhom?.keyOf(entry)"
            :trip-id="tripId"
            :item-id="entry.item.id"
            :participants="participants"
            :test-key="entry.item.name"
          />
        </template>
      </TransitionGroup>
    </template>
  </IonList>
</template>

<style scoped>
.group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 20px 6px 8px;
  background: none;
  border: none;
  color: var(--ct-text);
  /* A group heading outranks the rows under it: micro-type smaller than the
     item names it heads would invert the hierarchy it exists to state. */
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-bold);
  letter-spacing: var(--jp-tracking-display);
  cursor: pointer;
}

/* The first group follows the chip row directly: its head needs no room
   from a group above it, only from the row's own words. */
.group-head:first-child {
  padding-top: 4px;
}

.group-name {
  flex: 1;
  text-align: start;
}

.group-count {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-medium);
}

/* Each group is its own block, so the seam between two categories is a
   real edge rather than a slightly larger gap — which is what made them
   run into each other on a long list. The plane, rim, radius and lift all
   come from .jp-card (G-14); this only places it. */
.group-card {
  margin: 0 8px;
}

.group-card ion-item {
  --padding-start: 12px;
  --inner-padding-end: 10px;
}

.caret {
  transition: transform 0.18s ease;
}

.group-head.shut .caret {
  transform: rotate(-90deg);
}

/* --- Per-person cluster ----------------------------------------------- */

/*
 * The rule and the step belong to the *children*, not to the block
 * (FR-21.20). On `.cluster` they would carry the head in with them: the
 * item's name would sit 8 px right of every other item name in the list and
 * only 6 px left of its own travelers — so the head would read as one of its
 * children rather than as their heading. The head is a
 * line of the list; the people under it are the ones stepping in.
 */
.cluster-children {
  border-inline-start: 2px solid var(--ct-surface1);
  margin-inline-start: 12px;
}

/* --- FR-25.2: the pack-out ------------------------------------------- */

/*
 * A packed row leaves in three beats: the done colour washes over it, it
 * collapses to nothing, and it fades. Before this it was simply gone on the
 * next tick — which reads as a glitch rather than as progress, and gives a
 * mistap no evidence it ever happened.
 *
 * The height is driven from `onRowLeave` because `height: auto` does not
 * animate; everything else is here. `overflow: hidden` is what makes the
 * collapse look like a collapse rather than a clip.
 */
.pack-out-leave-active {
  transition:
    height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.3s ease,
    background-color 0.3s ease;
  overflow: hidden;
  pointer-events: none;
}

/*
 * The green is the done role, not a colour picked for the animation — the
 * same one the checkbox turns (G-11).
 *
 * On the *item*, not on the slider around it. Washing both would put the
 * tint over two different grounds — the card behind the empty stretch of
 * row, and the item's own surface behind the label — so the row would come
 * out in two shades split down the middle: the tint over `--ct-base` on one
 * side, the same tint over `--ct-surface0` on the other.
 */
.pack-out-leave-from {
  background: color-mix(in srgb, var(--jp-done) 22%, transparent);
}

.pack-out-leave-to {
  opacity: 0;
}

/*
 * Rows below a leaving one slide up instead of jumping. Without this the
 * collapse animates and the list underneath still snaps, which looks worse
 * than no animation at all.
 */
.pack-out-move {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/*
 * FR-25.2's feedback is the *fact* of the pack, not the motion. With motion
 * reduced the row still leaves and the snackbar still offers the undo; only
 * the travel is dropped. `onRowLeave` matches this by finishing immediately,
 * so the two cannot disagree.
 */
@media (prefers-reduced-motion: reduce) {
  .pack-out-leave-active,
  .pack-out-move {
    transition: none;
  }

  .pack-out-leave-from {
    background: none;
  }
}
</style>
