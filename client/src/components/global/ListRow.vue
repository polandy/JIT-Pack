<script setup lang="ts">
/**
 * One line of a list that is ticked off — a task on M25 (and M4's window),
 * a thing to buy on M6 (owner, 2026-09-26: one component so the two lists
 * cannot drift apart). The leading slot (the grip or the selection box), the
 * name, a second line with what is known about it, anything else at the
 * trailing edge, and the tick last, so its outer edge is the row's (UI-Spec
 * M4).
 *
 * It decides nothing: the caller renders the name and the facts and is told
 * when the tick moves.
 */
import { IonCheckbox, IonItem } from '@ionic/vue'
import { useSlots } from 'vue'

withDefaults(
  defineProps<{
    /** The tick's state; null takes the tick away (while selecting). */
    checked: boolean | null
    tickDisabled?: boolean
    tickLabel?: string
    /** Chosen in a selection — tinted. */
    selected?: boolean
    /** Finished: the name reads struck through and quiet. */
    done?: boolean
    factsTestid?: string
  }>(),
  {
    tickDisabled: false,
    tickLabel: undefined,
    selected: false,
    done: false,
    factsTestid: undefined,
  },
)

const emit = defineEmits<{ tick: [] }>()
const slots = useSlots()
</script>

<template>
  <IonItem class="list-row" :class="{ done }" :data-selected="selected ? 'true' : undefined">
    <slot name="start" />
    <div class="text">
      <slot />
      <div v-if="slots.facts" class="facts" :data-testid="factsTestid"><slot name="facts" /></div>
    </div>
    <slot name="end" />
    <IonCheckbox
      v-if="checked !== null"
      slot="end"
      class="tick"
      :checked="checked"
      :disabled="tickDisabled"
      :aria-label="tickLabel"
      @ionChange="emit('tick')"
    />
  </IonItem>
</template>

<style scoped>
.list-row[data-selected='true'] {
  --background: color-mix(in srgb, var(--jp-action) 10%, transparent);
}

/* The name and the facts under it. The column takes the row's width, so a
   fact never pushes the name into a second line. */
.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding-block: 8px;
}

.text :deep(ion-label) {
  margin: 0;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.facts > :deep(*) {
  white-space: nowrap;
}

.done .text :deep(ion-label) {
  color: var(--ct-subtext0);
}

.done .text :deep(.row-name) {
  text-decoration: line-through;
}

.tick {
  margin-inline-start: 4px;
}
</style>
