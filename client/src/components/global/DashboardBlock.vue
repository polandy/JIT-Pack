<script setup lang="ts">
/**
 * One of the two workable blocks in the dashboard's hero (FR-7.9): a head that
 * folds, a field that takes an entry, the next rows, and the way onto the full
 * screen.
 *
 * The block knows nothing of tasks or shopping. It is drawn here, in the
 * shared kernel, so that the shopping module (which may not import packing
 * code) and M1 (which does not import the module) draw the same object and
 * cannot drift into two.
 *
 * Rows are the slot's; a folded block keeps its head, its count and its field
 * — the field is the reason a block with nothing in it stays (FR-7.9) — and
 * takes its rows out of the tab order and the accessibility tree.
 */
import { IonIcon } from '@ionic/vue'
import { addOutline, checkmarkCircleOutline, chevronUpOutline } from 'ionicons/icons'
import { ref, watch } from 'vue'

import { t } from '@/i18n'
import { useBlockFold } from '@/lib/blockFold'

const props = defineProps<{
  /** The block's name, in the label role. */
  title: string
  /** The open count. */
  count: number
  /** The remembered fold's key (`lib/blockFold.ts`). */
  foldKey: string
  /** The field's placeholder, which is also its label. */
  addLabel: string
  /** Where the link under the rows leads. */
  moreRoute: string
  /** What the link says, including any remainder. */
  moreLabel: string
  /** The sentence in the place of the rows when there are none; null when there are rows. */
  empty: string | null
  testid: string
}>()

const emit = defineEmits<{ add: [text: string] }>()

const { open, toggle } = useBlockFold(props.foldKey)
const bodyId = `${props.testid}-rows`

const draft = ref('')

function add() {
  const text = draft.value.trim()
  if (text === '') return
  emit('add', text)
  // The field keeps focus for the next entry, so it is only emptied.
  draft.value = ''
}

/** The count pulses when it moves, after the first paint — the folded block's only evidence. */
const pulse = ref(false)
watch(
  () => props.count,
  () => {
    pulse.value = true
  },
)
</script>

<template>
  <section class="block" :data-testid="testid" :data-folded="!open">
    <button
      type="button"
      class="head"
      :aria-expanded="open"
      :aria-controls="bodyId"
      :data-testid="`${testid}-fold`"
      @click="toggle"
    >
      <span class="name jp-eyebrow">{{ title }}</span>
      <span class="figure">
        <!-- Keyed by the number so a change restarts the pulse instead of
             continuing the last one. -->
        <span :key="count" class="count jp-num" :class="{ pulse }" :data-testid="`${testid}-count`">
          <template v-if="count > 0">{{ count }}</template>
          <IonIcon v-else :icon="checkmarkCircleOutline" class="none" aria-hidden="true" />
        </span>
        <span v-if="count > 0" class="open-word">{{ t('dashboard.openWord') }}</span>
        <IonIcon :icon="chevronUpOutline" class="chevron" aria-hidden="true" />
      </span>
    </button>

    <form class="add" :data-testid="`${testid}-add`" @submit.prevent="add">
      <input
        v-model="draft"
        type="text"
        autocomplete="off"
        :aria-label="addLabel"
        :placeholder="addLabel"
        :data-testid="`${testid}-add-input`"
      />
      <button
        type="submit"
        :aria-label="t('dashboard.blockAdd')"
        :data-testid="`${testid}-add-submit`"
      >
        <IonIcon :icon="addOutline" aria-hidden="true" />
      </button>
    </form>

    <!-- The rows fold by animating the grid track between its content and
         nothing, which needs no measured height and follows a list that
         changes while it is open. -->
    <div :id="bodyId" class="body" :inert="!open" :aria-hidden="!open">
      <div class="inner">
        <p v-if="empty" class="empty" :data-testid="`${testid}-empty`">{{ empty }}</p>
        <ul v-else class="rows">
          <slot />
        </ul>
        <RouterLink :to="moreRoute" class="more" :data-testid="`${testid}-more`">
          <span>{{ moreLabel }}</span>
          <span aria-hidden="true">›</span>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.block {
  min-width: 0;
  padding: 2px 14px 0;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
}

.name {
  color: var(--ct-subtext0);
}

.figure {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.count {
  font-size: var(--jp-text-display-sm);
  font-weight: var(--jp-weight-bold);
  line-height: 1;
}

.count.pulse {
  animation: count-pulse 0.5s cubic-bezier(0.3, 0.7, 0.2, 1);
  color: var(--jp-action);
}

.none {
  color: var(--jp-done);
  font-size: var(--jp-icon-md);
  vertical-align: middle;
}

.open-word {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.chevron {
  align-self: center;
  font-size: var(--jp-icon-md);
  color: var(--jp-action);
  transition: transform 0.32s cubic-bezier(0.3, 0.7, 0.2, 1);
}

.block[data-folded='true'] .chevron {
  transform: rotate(180deg);
}

.add {
  display: flex;
  gap: 8px;
  padding-bottom: 10px;
}

.add input {
  flex: 1 1 0;
  min-width: 0;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--ct-surface0);
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-card);
  color: var(--ct-text);
  font-size: var(--jp-text-lg);
}

.add input::placeholder {
  color: var(--ct-subtext0);
}

.add button {
  flex: none;
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: var(--jp-r-sm);
  background: var(--jp-action);
  color: var(--ct-base);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}

.body {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows 0.32s cubic-bezier(0.3, 0.7, 0.2, 1),
    opacity 0.24s ease;
}

.inner {
  min-height: 0;
  overflow: hidden;
}

.block[data-folded='true'] .body {
  grid-template-rows: 0fr;
  opacity: 0;
  visibility: hidden;
  transition:
    grid-template-rows 0.32s cubic-bezier(0.3, 0.7, 0.2, 1),
    opacity 0.2s ease,
    visibility 0s 0.32s;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.empty {
  margin: 0;
  padding: 10px 0 14px;
  border-top: 1px solid var(--ct-surface0);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-md);
}

.more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  border-top: 1px solid var(--ct-surface0);
  color: var(--jp-action);
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-semibold);
  text-decoration: none;
}

.head:focus-visible,
.add input:focus-visible,
.add button:focus-visible,
.more:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

@keyframes count-pulse {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .body,
  .block[data-folded='true'] .body,
  .chevron {
    transition: none;
  }

  .count.pulse {
    animation: none;
  }
}
</style>
