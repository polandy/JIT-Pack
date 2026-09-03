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
    :class="{ done, locked }"
    :data-testid="`${props.variant === 'child' ? 'm4-child' : 'm4-row'}-${testKey}`"
    @click="emit('open')"
    @contextmenu.prevent="emit('menu')"
    @pointerdown="(e: PointerEvent) => emit('pressStart', e)"
    @pointermove="(e: PointerEvent) => emit('pressMove', e)"
    @pointerup="emit('pressEnd')"
    @pointercancel="emit('pressEnd')"
  >
    <!-- `.prevent` as well as `.stop`: Ionic wraps a router-link item in
         an anchor, and an anchor's jump is a *default action* — stopping
         propagation never cancelled it, so every tap on the stepper opened
         the sheet instead of counting. -->
    <div slot="start" class="row-start" @click.stop.prevent>
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

    <!-- Outside the fixed-width control column (UX-9): beside the name it
         sits where an item row's mark does, so the label column stays
         straight across both kinds — and a child row keeps the column even
         with nobody in it, because it has no mark to hold it open. An item
         row has, so it renders the avatar only when there is someone to name. -->
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

    <div v-if="props.variant === 'item'" slot="end" class="row-end">
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
      <UserAvatar
        v-if="edgeAvatar"
        :variant="edgeAvatar.variant"
        :name="edgeAvatar.name"
        :seed="edgeAvatar.id"
      />
    </div>
    <!-- A child row's end column is the edge avatar alone: the glyphs above
         belong to the item, and the cluster head already carries them. -->
    <UserAvatar
      v-else-if="edgeAvatar"
      slot="end"
      :variant="edgeAvatar.variant"
      :name="edgeAvatar.name"
      :seed="edgeAvatar.id"
    />
  </IonItem>
</template>

<style scoped>
.row-start {
  display: flex;
  align-items: center;
  gap: 8px;
  /* UX-9: the control column holds one width whatever it carries (checkbox,
     stepper, pass toggle, lock), so item names line up in a straight column.
     Sized to its widest resident, the G-6 stepper (two 28px buttons, the
     36px count, two 4px gaps, plus tap headroom); min- rather than fixed
     width so an outsized count degrades to one misaligned row instead of an
     overlap. */
  min-width: 108px;
}

.row-end {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lock {
  font-size: var(--jp-icon-md);
  color: var(--ct-blue);
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
  color: var(--ct-mauve);
}

.unused-mark {
  font-size: var(--jp-icon-sm);
  color: var(--ct-mauve);
}

.done {
  opacity: 0.55;
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
  color: var(--ct-yellow);
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
</style>
