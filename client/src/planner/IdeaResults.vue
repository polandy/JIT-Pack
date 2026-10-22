<script setup lang="ts">
/**
 * FR-29.13: the idea's *Daraus gemacht* — what came of it, read through the
 * kernel's sources, since the results are the packing side's and the
 * shopping module's rows — and, on the shortlist, what it can still become:
 * each a link to the screen that makes it, its creator pre-filled. Nothing
 * is drawn while there is neither.
 */
import { IonIcon } from '@ionic/vue'
import { cartOutline, checkboxOutline, trailSignOutline } from 'ionicons/icons'
import { computed, inject } from 'vue'

import SectionHead from '@/components/global/SectionHead.vue'
import {
  IDEA_RESULT_EXCURSION,
  IDEA_RESULT_SHOPPING,
  IDEA_RESULT_TASK,
  type IdeaResultKind,
} from '@/domain/shared/ideaBridge'
import { t } from '@/i18n'
import { IDEA_RESULT_SCREEN, IDEA_RESULT_SOURCES } from '@/kernel/ideaBridge'
import { ideaBridgePath } from '@/router/paths'
import { offeredResults } from './domain/bridge'
import type { Idea } from './types'

const props = defineProps<{ idea: Idea }>()

const emit = defineEmits<{
  /** Open a result, or the screen that makes one. */
  go: [path: string]
}>()

const resultSources = inject(IDEA_RESULT_SOURCES, [])

const results = computed(() =>
  resultSources.flatMap((source) => source.results(props.idea.trip_id, props.idea.id)),
)
const offered = computed(() => offeredResults(props.idea.state, results.value))

const RESULT_ICON: Record<IdeaResultKind, string> = {
  [IDEA_RESULT_EXCURSION]: trailSignOutline,
  [IDEA_RESULT_TASK]: checkboxOutline,
  [IDEA_RESULT_SHOPPING]: cartOutline,
}

function make(kind: IdeaResultKind) {
  emit('go', ideaBridgePath(props.idea.trip_id, IDEA_RESULT_SCREEN[kind], props.idea.id))
}
</script>

<template>
  <section
    v-if="results.length > 0 || offered.length > 0"
    class="results"
    data-testid="idea-results"
  >
    <SectionHead :title="t('ideas.results')" />
    <div class="result-chips">
      <button
        v-for="result in results"
        :key="result.key"
        type="button"
        class="result"
        :class="{ done: result.done }"
        :data-testid="`idea-result-${result.key}`"
        @click="emit('go', result.path)"
      >
        <IonIcon :icon="RESULT_ICON[result.kind]" aria-hidden="true" />
        <span class="result-title">{{ result.title }}</span>
      </button>
      <button
        v-for="kind in offered"
        :key="kind"
        type="button"
        class="result offer"
        :aria-label="t(`ideas.makeLabel.${kind}`)"
        :data-testid="`idea-make-${kind}`"
        @click="make(kind)"
      >
        <IonIcon :icon="RESULT_ICON[kind]" aria-hidden="true" />
        {{ t(`ideas.make.${kind}`) }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.results {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* A result is a solid chip that leads to it; what the idea can still become
   is the same chip dashed (planner-concept §4.2). */
.result {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 5px 11px;
  border: 1px solid var(--jp-surface-sunken);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.result ion-icon {
  flex: none;
  color: var(--jp-action);
  font-size: var(--jp-icon-xs);
}

.result-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result.done .result-title {
  color: var(--ct-subtext0);
  text-decoration: line-through;
}

.result.offer {
  border-style: dashed;
  border-color: var(--ct-overlay0);
  background: transparent;
  color: var(--ct-subtext1);
}
</style>
