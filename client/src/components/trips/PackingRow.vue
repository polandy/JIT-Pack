<script setup lang="ts">
/**
 * One packable row on M4 — a plain item, or one traveler's instance of a
 * per-person item (FR-25.1).
 *
 * The two were written twice in `PackingListPage.vue` and shared three
 * things that must not drift: the fixed-width control column (UX-9), the
 * four-way stamp chain (lock ▸ own claim ▸ skipped ▸ packed) and the edge
 * avatar (FR-25.19). They still differ in two places, and the `variant`
 * prop is exactly those two:
 *
 *  - a **child** row carries no mark and no prep badge, because the cluster
 *    head above it names the item once and carries both (FR-28.4/25.1);
 *  - a **child** row's end column holds only the edge avatar, where an
 *    item row also carries the item's own glyphs (unused, mode, late).
 *
 * The component reads no store: everything it renders is a prop, so its
 * branch chain is testable without a trip.
 */
import { IonBadge, IonIcon, IonItem, IonLabel } from '@ionic/vue'
import { buildOutline, lockClosedOutline, removeCircleOutline } from 'ionicons/icons'

import ItemMark from '@/components/items/ItemMark.vue'
import QuantityStepper from '@/components/global/QuantityStepper.vue'
import RowGlyphs from '@/components/trips/RowGlyphs.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { t } from '@/i18n'
import type { MasterItem, Traveler, TripItem } from '@/types/domain'

/** The one sentence under the name, in the order the row prefers them. */
export interface PackingRowNotes {
  /** G-3: somebody else holds this row. */
  lock: string | null
  /** The claim is mine — invisible to me otherwise. */
  ownClaim: string | null
  /** FR-5.5: done because it was deliberately left behind. */
  skipped: string | null
  /** FR-25.17, on revealed rows only. */
  packed: string | null
  /** FR-25.19, appended to the packed stamp where it differs from the packer. */
  responsible: string | null
}

/** Who the row's right edge names, and in which of the two roles (FR-25.19). */
export interface RowEdgeAvatar {
  variant: 'assignee' | 'packer'
  id: string
  name: string | null
}

const props = withDefaults(
  defineProps<{
    item: TripItem
    /** The name the row shows — the item's, or the traveler's under a cluster. */
    label: string
    /**
     * The stable half of every `data-testid` on the row: the item name for an
     * item row, `<item>-<traveler>` for a child. The prefixes are the row's own
     * (`m4-row-` / `m4-child-`, `m4-pass-toggle-`, …) so no caller spells them.
     */
    testKey: string
    variant?: 'item' | 'child'
    done: boolean
    /** G-3: held by somebody else, so the row reads but does not write. */
    locked: boolean
    /** FR-9.3's closing pass replaces the stepper with the keep/leave toggle. */
    closingPass: boolean
    notes: PackingRowNotes
    /** "For whom", on the left (FR-25.3). */
    traveler?: Traveler | null
    /** The master the mark and photo come from; ignored by a child row. */
    master?: MasterItem | null
    /** FR-27.7 open tasks; ignored by a child row. */
    prepCount?: number
    edgeAvatar?: RowEdgeAvatar | null
  }>(),
  { variant: 'item', traveler: null, master: null, prepCount: 0, edgeAvatar: null },
)

const emit = defineEmits<{
  open: []
  menu: []
  pressStart: [event: PointerEvent]
  pressMove: [event: PointerEvent]
  pressEnd: []
  passToggle: []
  increment: []
  decrement: []
  complete: []
  zero: []
  toggle: []
}>()
</script>

<template>
  <IonItem
    button
    :class="{ done, locked, child: props.variant === 'child' }"
    :data-testid="`${props.variant === 'child' ? 'm4-child' : 'm4-row'}-${testKey}`"
    @click="emit('open')"
    @contextmenu.prevent="emit('menu')"
    @pointerdown="(e: PointerEvent) => emit('pressStart', e)"
    @pointermove="(e: PointerEvent) => emit('pressMove', e)"
    @pointerup="emit('pressEnd')"
    @pointercancel="emit('pressEnd')"
  >
    <!-- The lead column: what the row *is*. A child row keeps the column
         even with nobody in it, because it has no mark to hold it open; an
         item row's mark slot holds its own width (FR-28.4), so the names
         line up across both kinds. -->
    <div slot="start" class="row-lead">
      <UserAvatar
        v-if="traveler || props.variant === 'child'"
        class="row-avatar"
        :name="traveler?.name"
        :seed="traveler?.id"
      />
      <ItemMark
        v-if="props.variant === 'item'"
        :mark="master?.icon ?? null"
        surface="packing"
        :photo-item="master"
        :size="22"
        class="row-mark"
      />
    </div>

    <IonLabel>
      <h3>
        {{ label }}
        <IonBadge
          v-if="props.variant === 'item' && prepCount > 0"
          color="brand"
          class="prep"
          :data-testid="`m4-prep-badge-${testKey}`"
        >
          <IonIcon :icon="buildOutline" /> {{ prepCount }}
        </IonBadge>
      </h3>
      <p v-if="notes.lock" class="stamp" data-testid="m4-lock-note">{{ notes.lock }}</p>
      <p v-else-if="notes.ownClaim" class="stamp" data-testid="m4-own-claim">
        {{ notes.ownClaim }}
      </p>
      <p v-else-if="notes.skipped" class="stamp">{{ notes.skipped }}</p>
      <p v-else-if="done && notes.packed" class="stamp" data-testid="m4-packed-stamp">
        {{ notes.packed }}
        <span v-if="notes.responsible" class="muted">· {{ notes.responsible }}</span>
      </p>
    </IonLabel>

    <!-- The end column: what the row *says*, then what you do to it. The
         control is last, so its outer edge lands under the thumb on every
         row whatever precedes it, and the glyphs it follows belong to the
         item — a child row skips them, because the cluster head above
         carries them once (FR-28.4/25.1). -->
    <div slot="end" class="row-end">
      <template v-if="props.variant === 'item'">
        <!-- FR-9.3: a judgement made from the row's menu has to be visible on
             the row, or the pass cannot be reviewed. -->
        <IonIcon
          v-if="item.flag_unused && !closingPass"
          :icon="removeCircleOutline"
          class="unused-mark"
          :aria-label="t('facet.flagUnused')"
          :data-testid="`m4-unused-${testKey}`"
        />
        <RowGlyphs :mode="item.mode" :late="item.late_packer" />
      </template>
      <UserAvatar
        v-if="edgeAvatar"
        :variant="edgeAvatar.variant"
        :name="edgeAvatar.name"
        :seed="edgeAvatar.id"
      />
      <!--
        `.prevent` as well as `.stop` on the click: Ionic wraps a router-link
        item in an anchor, and an anchor's jump is a *default action* —
        stopping propagation never cancelled it, so every tap on the stepper
        opened the sheet instead of counting.

        `@pointerdown.stop` is the same rule for the *press*: FR-5.5's
        press-and-hold belongs to the row, and the stepper has holds of its
        own (G-6's + completes, − zeroes). Armed together, the row's menu
        opened over a gesture the stepper never got to finish (E2E-G6-01).
        Stopping it here rather than in the page keeps the rule where the
        control is, instead of in a `closest()` on a class name one file over.
      -->
      <div class="row-control" @click.stop.prevent @pointerdown.stop>
        <!-- FR-9.3: one posture, one gesture. The stepper counts what is
             packed, which is not what the pass asks — and a checkbox is M4's
             *packed* idiom, so the mark gets a control of its own that renders
             off the row rather than off its own internal state. -->
        <IonIcon v-if="locked" :icon="lockClosedOutline" class="lock" />
        <button
          v-else-if="closingPass"
          class="pass-toggle"
          :class="{ on: item.flag_unused }"
          :aria-pressed="item.flag_unused"
          :aria-label="t('facet.flagUnused')"
          :data-testid="`m4-pass-toggle-${testKey}`"
          @click="emit('passToggle')"
        >
          <IonIcon :icon="removeCircleOutline" />
        </button>
        <QuantityStepper
          v-else
          :quantity="item.quantity"
          :packed="item.packed_count"
          @increment="emit('increment')"
          @decrement="emit('decrement')"
          @complete="emit('complete')"
          @zero="emit('zero')"
          @toggle="emit('toggle')"
        />
      </div>
    </div>
  </IonItem>
</template>

<style scoped>
/*
 * The lead column is what UX-9 made of the control column, one place to the
 * left: the thing that holds the names in a straight line. It is the mark
 * slot for an item row and the traveler's face for a child row, and both
 * hold their width when empty, so the column is the same width on every row
 * without being told a number.
 */
.row-lead {
  display: flex;
  align-items: center;
}

.row-end {
  display: flex;
  align-items: center;
  gap: 8px;
}

/*
 * UX-9's fixed width, on the other side of the row (2026-09-06). It bought
 * a straight column of names at the cost of a 108px gap on every row that
 * carried only a checkbox — and the control it held sat at the far edge
 * from the thumb. Right-aligned, the control's outer edge is the container's
 * on every row, so the alignment is free and the width is only a floor for
 * the tap target.
 */
.row-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 44px;
}

.lock {
  font-size: var(--jp-icon-md);
  color: var(--ct-glacier);
  padding: 8px;
}

.pass-toggle {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}

.pass-toggle.on {
  color: var(--ct-heather);
}

.unused-mark {
  font-size: var(--jp-icon-sm);
  color: var(--ct-heather);
}

.locked {
  opacity: 0.65;
}

.stamp {
  font-size: var(--jp-text-xs);
}

.muted {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

/* Two `.prep` rules stood in `PackingListPage.vue`, and the badge resolved to
   both — the yellow was written for a header-line element that no longer
   exists, and only the badge was left to inherit it. Merged here as one rule
   so the row keeps the colour it has been rendering. */
.prep {
  color: var(--ct-straw);
  font-size: var(--jp-text-3xs);
  vertical-align: middle;
  margin-left: 6px;
}

/* FR-28.4: the slot holds its width even when empty, so the names stay in
   one column on a list where most rows carry no mark. `ClusterHead` states
   the same rule for the same column; the two are scoped stylesheets on two
   components, so the sentence is written twice on purpose. */
.row-mark {
  margin-inline-end: 10px;
}

/* The traveler avatar shares the mark's column (24px + 8px = the mark slot's
   22px + 10px), so child rows and item rows start their names at the same x. */
.row-avatar {
  flex: none;
  margin-inline-end: 8px;
}

/*
 * A done row has nothing left to ask of anyone, so it says so twice: it
 * sinks to the end of its group (`packingView`) and its name is struck
 * through here. The strike replaces the blanket dim the row used to carry —
 * that dimmed the FR-25.17 stamp as well, which is the one part of a done
 * row still worth reading (who packed it, and when).
 */
.done h3 {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  color: var(--ct-subtext0);
}

/*
 * FR-21.16: inside a cluster the item is named once, by the head. A child
 * row names a *person*, which qualifies that item rather than restating it,
 * so it sits one step under the head and recessive against it. Until
 * 2026-09-07 it did the opposite — the traveler rows were the larger and
 * brighter of the two, because they were Ionic's default row name and the
 * head was the only one of the pair that had been styled.
 */
.child h3 {
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-regular);
  color: var(--ct-subtext1);
}

.child.done h3 {
  color: var(--ct-subtext0);
}
</style>
