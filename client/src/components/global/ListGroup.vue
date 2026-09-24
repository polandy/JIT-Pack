<script setup lang="ts">
/**
 * One heading of a grouped list and the rows under it — M6's tag headings
 * (FR-30.9) and M25's task groups (FR-7.8), drawn once so the two lists look
 * alike (owner, 2026-09-24: the tasks should look like the shopping list).
 *
 * It is also a drop target for `useDragToGroup`: `dropTarget` is the name the
 * gesture hands back, and `droppable: false` dims the heading for as long as
 * something is being dragged, so a place that would refuse the row says so
 * before it is tried. What a target looks like while a row hangs over it is
 * drawn here, once, for both.
 *
 * `data-testid` falls through to the group, where the suites look for it.
 */
import { IonItemDivider, IonItemGroup, IonLabel } from '@ionic/vue'

import { t } from '@/i18n'

withDefaults(
  defineProps<{
    /** The heading. */
    title: string
    /** The name a drop here is reported under; absent means not a target. */
    dropTarget?: string
    /** False: never a place to drop — dimmed while a drag is in the air. */
    droppable?: boolean
  }>(),
  { dropTarget: undefined, droppable: true },
)
</script>

<template>
  <IonItemGroup
    class="list-group"
    :data-drop-target="dropTarget"
    :data-droppable="dropTarget === undefined ? undefined : String(droppable)"
  >
    <IonItemDivider>
      <span v-if="$slots.mark" class="mark"><slot name="mark" /></span>
      <IonLabel>{{ title }}</IonLabel>
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
.mark {
  display: inline-flex;
  margin-inline-end: 8px;
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
