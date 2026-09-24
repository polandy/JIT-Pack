<script setup lang="ts">
/**
 * One heading of a grouped list and the rows under it — M6's tag headings
 * (FR-30.9), M25's task groups (FR-7.8) and M9's primary-tag groups (FR-24.2),
 * drawn once so the lists look alike (owner, 2026-09-24).
 *
 * It is also a drop target for `useDragToGroup`: `dropTarget` is the name the
 * gesture hands back, and `droppable: false` dims the heading for as long as
 * something is being dragged, so a place that would refuse the row says so
 * before it is tried. What a target looks like while a row hangs over it is
 * drawn here, once, for both.
 *
 * M9's three extras are opt-in, because a long inventory needs them and a
 * shopping list does not: `count` beside the name, `sticky` under whatever
 * the screen pins above it (`--list-group-top`), and `jumpable`, which makes
 * the heading the control that opens the screen's jump sheet (FR-24.8).
 *
 * `data-testid` falls through to the group, where the suites look for it;
 * `head-testid` and `jump-testid` name the heading's own handles, whole (the
 * way `SheetHead` takes its `title-testid`).
 */
import { IonIcon, IonItemDivider, IonItemGroup, IonLabel } from '@ionic/vue'
import { chevronDownOutline } from 'ionicons/icons'

import { t } from '@/i18n'

const props = withDefaults(
  defineProps<{
    /** The heading. */
    title: string
    /** The name a drop here is reported under; absent means not a target. */
    dropTarget?: string
    /** False: never a place to drop — dimmed while a drag is in the air. */
    droppable?: boolean
    /** How many rows the group holds, shown beside the name. */
    count?: number
    /** The heading stays put while its rows scroll under it. */
    sticky?: boolean
    /** The heading is a control: a tap emits `jump`. */
    jumpable?: boolean
    /** The test handle on the heading's words, e.g. `m9-group-head`. */
    headTestid?: string
    /** The test handle on the heading while it is the jump control. */
    jumpTestid?: string
  }>(),
  {
    dropTarget: undefined,
    droppable: true,
    count: undefined,
    sticky: false,
    jumpable: false,
    headTestid: undefined,
    jumpTestid: undefined,
  },
)

const emit = defineEmits<{ jump: [] }>()

function jump() {
  if (props.jumpable) emit('jump')
}
</script>

<template>
  <IonItemGroup
    class="list-group"
    :data-drop-target="dropTarget"
    :data-droppable="dropTarget === undefined ? undefined : String(droppable)"
  >
    <IonItemDivider
      :sticky="sticky"
      :class="{ jumpable }"
      :role="jumpable ? 'button' : undefined"
      :tabindex="jumpable ? 0 : undefined"
      :data-testid="jumpable ? jumpTestid : undefined"
      @click="jump"
      @keydown.enter.prevent="jump"
      @keydown.space.prevent="jump"
    >
      <!-- The handle wraps the mark and the words, which is what a reader
           calls the heading; a plain span, because Stencil patches
           `textContent` on its own elements and a suite reading `ion-label`
           directly reads ''. -->
      <IonLabel>
        <span class="head" :data-testid="headTestid">
          <span v-if="$slots.mark" class="mark"><slot name="mark" /></span>{{ title }}
        </span>
      </IonLabel>
      <span v-if="count !== undefined" slot="end" class="count jp-num">{{ count }}</span>
      <IonIcon v-if="jumpable" slot="end" :icon="chevronDownOutline" class="jump" />
      <!-- Shown only while this group is the one under the pointer —
           `[data-drop-over]`, set by `useDragToGroup` itself, is the gate. -->
      <span v-if="dropTarget !== undefined" slot="end" class="group-over-label">{{
        t('list.dropHere')
      }}</span>
    </IonItemDivider>
    <slot />
  </IonItemGroup>
</template>

<style scoped>
/* A mark before the heading's words, the way M25's groups have always worn
   their tag's glyph. */
.head {
  display: inline-flex;
  align-items: center;
}

.mark {
  display: inline-flex;
  margin-inline-end: 8px;
}

/* Ionic pins a sticky divider at `top: 0`; a screen with its own sticky bar
   says how far below it the heading has to stop (M9's tool bar, FR-24.6).
   Ionic also stacks it at 100, which paints a heading leaving the screen over
   that bar instead of under it. */
ion-item-divider {
  top: var(--list-group-top, 0px);
  z-index: 1;
}

.count {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
}

.jumpable {
  cursor: pointer;
}

.jumpable:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}

.jump {
  margin-inline-start: 6px;
  color: var(--jp-action);
  font-size: var(--jp-icon-xs);
}

/* A heading a drag can never land on dims for as long as something is in the
   air (owner feedback 2026-09-23: a heading that just sits there looked
   broken, not ineligible). The host carries `data-drag` (`useDragToGroup`). */
[data-drag='dragging'] .list-group[data-droppable='false'] {
  opacity: 0.5;
}

/* The group a dragged row is over — the mockup's own frame ("Vorschlag-Liste"
   canvas, 2026-09-23). */
.list-group[data-drop-over] {
  --ion-item-background: color-mix(in srgb, var(--jp-action) 8%, var(--jp-surface-page));
  border: 1px solid var(--jp-action);
  border-radius: var(--jp-r);
  /* Without this the rows' own square corners sit past the frame's rounded
     ones, poking out from behind it. */
  overflow: hidden;
}

/* `opacity`, not `display`: the divider's `end` slot lays this out itself,
   and a `display` toggle here lost that fight silently. */
.group-over-label {
  opacity: 0;
  color: var(--jp-action);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.list-group[data-drop-over] .group-over-label {
  opacity: 1;
}
</style>
