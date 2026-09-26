<script setup lang="ts">
/**
 * M6's open lines — `ListRow`, the component M25's tasks are drawn with
 * (one look and feel, guaranteed by one component): the grip or the
 * selection box at the leading edge, the name, a second line with what is known about it — the
 * due pill, the amount, the tag where the line stands outside its group, who
 * it is for — and the check-off at the trailing edge, where the thumb rests.
 *
 * There is no ✕ on the row: an entry is removed from its sheet, as a
 * task is from its own. Every act is reported; the page owns the writes, the
 * undo toast and the drag.
 */
import { IonLabel } from '@ionic/vue'
import { computed } from 'vue'

import DragGrip from '@/components/global/DragGrip.vue'
import DueBadge from '@/components/global/DueBadge.vue'
import ListRow from '@/components/global/ListRow.vue'
import SelectBox from '@/components/global/SelectBox.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import type { RowSelection } from '@/composables/useRowSelection'
import { t } from '@/i18n'
import type { ShoppingLine } from '@/lib/shoppingSources'

const props = withDefaults(
  defineProps<{
    lines: readonly ShoppingLine[]
    today: string
    selection?: RowSelection
    /** The tag named in the second line — only where a line stands outside its group. */
    tagOf?: (line: ShoppingLine) => string | null
    /** A closed list's lines (FR-7.12): read, never bought or moved. */
    readonly?: boolean
    /** A bought row leaves rather than vanishes — the page decides how. */
    leave?: (el: Element, done: () => void) => void
  }>(),
  { selection: undefined, tagOf: undefined, readonly: false, leave: undefined },
)

const emit = defineEmits<{
  buy: [line: ShoppingLine]
  open: [line: ShoppingLine]
  lift: [line: ShoppingLine, event: PointerEvent]
}>()

const selecting = computed(() => props.selection?.selecting.value ?? false)

function isSelected(line: ShoppingLine): boolean {
  return props.selection?.selected.value.has(line.key) ?? false
}

/** Not selecting → the name opens the entry's sheet; selecting → it toggles the row. */
function onClick(line: ShoppingLine) {
  if (props.selection?.click(line.key, !!line.edit)) return
  if (line.edit) emit('open', line)
}

function onLeave(el: Element, done: () => void) {
  if (props.leave) props.leave(el, done)
  else done()
}

/** The recipients, named in roster order (FR-25.6). */
function recipientNames(line: ShoppingLine): string {
  return line.recipients.map((recipient) => recipient.name).join(', ')
}

function hasFacts(line: ShoppingLine): boolean {
  return !!line.dueDate || line.quantity > 1 || !!props.tagOf?.(line) || line.recipients.length > 0
}
</script>

<template>
  <!-- FR-25.11j: a bought row leaves rather than vanishes — M4's FR-25.2
       `pack-out` recipe, kept to this list's own class names. -->
  <TransitionGroup tag="div" name="buy-out" class="row-group" @leave="onLeave">
    <ListRow
      v-for="line in lines"
      :key="line.key"
      class="shop-row"
      :checked="selecting ? null : false"
      :tick-disabled="readonly"
      :tick-label="t('shopping.bought', { name: line.name })"
      :selected="selecting && isSelected(line)"
      :facts-testid="`m6-row-facts-${line.name}`"
      :data-row-key="line.key"
      data-testid="m6-row"
      @tick="emit('buy', line)"
    >
      <template #start>
        <!-- FR-30.9: the selection box while selecting — dashed and dimmed for
             a packing line, which carries no tag and is never selectable. -->
        <SelectBox
          v-if="selecting"
          slot="start"
          :on="isSelected(line)"
          :off="!line.edit"
          :data-testid="`m6-row-check-${line.name}`"
        />
        <!-- FR-30.9's single-row drag: own entries only, lifted at once. -->
        <DragGrip
          v-else-if="line.edit && !readonly"
          slot="start"
          :label="t('shopping.dragToRetag', { name: line.name })"
          :data-testid="`m6-row-grip-${line.name}`"
          @pointerdown.stop="(e: PointerEvent) => emit('lift', line, e)"
        />
        <!-- A packing line has nothing to drag (an empty gap here reads as
             broken) — the dashed placeholder. -->
        <DragGrip v-else slot="start" off />
      </template>
      <IonLabel
        :class="{ tappable: !!line.edit, selectable: selecting && !!line.edit }"
        :role="line.edit ? 'button' : undefined"
        :tabindex="line.edit ? 0 : undefined"
        data-testid="m6-row-label"
        @click="onClick(line)"
        @keyup.enter="onClick(line)"
        @pointerdown="(e: PointerEvent) => line.edit && selection?.press(line.key, e)"
        @pointermove="(e: PointerEvent) => selection?.move(e)"
        @pointerup="selection?.release()"
        @pointercancel="selection?.release()"
        @contextmenu.prevent="line.edit && selection?.contextMenu(line.key)"
      >
        <h3 class="row-name">{{ line.name }}</h3>
      </IonLabel>
      <!-- M25's second line: what is known about the line. The pill stays
           while selecting — when a thing is due is part of choosing it. -->
      <template v-if="hasFacts(line)" #facts>
        <DueBadge :day="line.dueDate ?? null" :today="today" :testid="`m6-row-due-${line.name}`" />
        <span v-if="line.quantity > 1">{{ line.quantity }}×</span>
        <span v-if="tagOf?.(line)" :data-testid="`m6-row-tag-${line.name}`">{{ tagOf(line) }}</span>
        <!-- FR-25.6: for whom, derived from membership — never a control. -->
        <span v-if="line.recipients.length > 0" class="recipients" data-testid="m6-row-for">
          <UserAvatar
            v-for="recipient in line.recipients"
            :key="recipient.id"
            :name="recipient.name"
            :seed="recipient.id"
            :size="18"
          />
          <span>{{ t('shopping.forWhom', { names: recipientNames(line) }) }}</span>
        </span>
      </template>
    </ListRow>
  </TransitionGroup>
</template>

<style scoped>
/* A `TransitionGroup` wrapper with no footprint of its own. */
.row-group {
  display: contents;
}

.tappable {
  cursor: pointer;
}

.selectable {
  user-select: none;
}

.recipients {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* --- FR-25.11j: the buy-out. A bought row washes the done colour, collapses
   to nothing, then fades; the height itself is driven by the page's leave. */
.buy-out-leave-active {
  transition:
    height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.3s ease,
    background-color 0.3s ease;
  overflow: hidden;
  pointer-events: none;
}

.buy-out-leave-from {
  background: color-mix(in srgb, var(--jp-done) 22%, transparent);
}

.buy-out-leave-to {
  opacity: 0;
}

.buy-out-move {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .buy-out-leave-active,
  .buy-out-move {
    transition: none;
  }

  .buy-out-leave-from {
    background: none;
  }
}
</style>
