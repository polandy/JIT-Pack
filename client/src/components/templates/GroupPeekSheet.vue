<script setup lang="ts">
/**
 * FR-27.12 — looking inside a group without leaving where you are.
 *
 * Three screens ask the same question and got the same answer: M3 step 3
 * (before picking a group into a trip), M8 (after including one) and M14
 * (before writing a proposal into one). The alternative — tapping through to
 * the M8 editor — costs the M3 draft and, on M14, the review pass.
 *
 * Deliberately **read-only**: this is a look, not an editor. Editing a group
 * has one home, M8, and a second editing surface would be a second place for
 * the same rule to drift. The list is the *resolved* one (FR-27.2), so what it
 * shows is what the trip would actually get, dedup included.
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'
import { computed } from 'vue'

import { t } from '@/i18n'
import { modeLabel } from '@/lib/modeLabels'
import { resolvedLines, type ResolvedLine } from '@/domain/templates'
import { useMasterStore } from '@/stores/masterStore'
import { isShoppingMode } from '@/types/domain'
import ItemMark from '@/components/items/ItemMark.vue'

const props = defineProps<{ templateId: string }>()
const emit = defineEmits<{ close: [] }>()

const masterStore = useMasterStore()

const template = computed(() => masterStore.getTemplate(props.templateId))
const lines = computed(() =>
  resolvedLines(masterStore.resolve(props.templateId), masterStore.itemList),
)

/** Whether this template is built from others at all (FR-27.1). */
const composed = computed(() => masterStore.getIncludes(props.templateId).length > 0)

/**
 * FR-27.14: where a line came from — but only where that adds something. Every
 * line of a *group* comes from that group, so repeating its name on each row
 * would be noise; a Ferien-Vorlage is the case where the answer differs per
 * line, and its own positions name the Vorlage rather than pretending to have
 * a group. Returns '' when the sheet should stay quiet.
 */
function sourceOf(line: ResolvedLine): string {
  // A template that includes nothing has only one possible source, so naming
  // it on every row says nothing — that is the group case, and the sheet stays
  // quiet. Provenance is information only once a composition can differ.
  if (composed.value === false) return ''
  const own = template.value?.name
  if (line.sources.every((name) => name === own)) return t('templates.peekOwnPosition')
  return t('templates.peekFrom', { names: line.sources.join(' & ') })
}

/** FR-27.14: the two marks a quantity cannot carry, plus the merge. */
function marksOf(line: ResolvedLine): string[] {
  const marks: string[] = []
  if (line.merged) marks.push(t('templates.peekMerged'))
  if (line.perPerson) marks.push(t('templates.peekPerPerson'))
  if (isShoppingMode(line.mode)) marks.push(modeLabel(line.mode))
  if (line.conditions) marks.push(t('templates.peekConditional'))
  return marks
}
</script>

<template>
  <section class="sheet-body" data-testid="group-peek-sheet">
    <header class="head">
      <!-- FR-28.8: the sheet names the group, so it carries its mark too. -->
      <ItemMark :mark="template?.icon ?? null" surface="plain" :size="24" class="head-mark" />
      <div class="titles">
        <h1 class="jp-sheet-title" data-testid="group-peek-name">
          {{ template?.name ?? t('templates.notFound') }}
        </h1>
        <p class="context">
          {{ t('templates.peekSubtitle', { n: lines.length }) }}
        </p>
      </div>
      <button
        class="x"
        data-testid="group-peek-close"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <IonIcon :icon="closeOutline" />
      </button>
    </header>

    <ul v-if="lines.length" class="lines">
      <li v-for="line in lines" :key="line.name" data-testid="group-peek-line">
        <span class="name">
          <!-- Its own element so a reader (and a test) can take the item name
               apart from the marks that qualify it. -->
          <span data-testid="group-peek-item">{{ line.name }}</span>
          <span v-for="mark in marksOf(line)" :key="mark" class="mark">{{ mark }}</span>
          <span v-if="sourceOf(line)" class="source" data-testid="group-peek-source">
            {{ sourceOf(line) }}
          </span>
        </span>
        <span class="qty jp-num">×{{ line.quantity }}</span>
      </li>
    </ul>
    <p v-else class="empty" data-testid="group-peek-empty">{{ t('templates.noPositions') }}</p>
  </section>
</template>

<style scoped>
.sheet-body {
  padding: 4px 18px 26px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-bottom: 12px;
}

.head-mark {
  padding-top: 2px;
}

.titles {
  flex: 1;
  min-width: 0;
}

.context {
  margin: 2px 0 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.x {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}

.lines {
  margin: 0;
  padding: 0;
  list-style: none;
}

.lines li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 2px;
  border-top: 1px solid var(--ct-surface0);
}

.name {
  flex: 1;
  min-width: 0;
}

.source {
  display: block;
  margin-top: 2px;
  color: var(--ct-overlay0);
  font-size: var(--jp-text-sm);
}

.mark {
  display: inline-block;
  margin-inline-start: 6px;
  padding: 1px 7px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
  vertical-align: 1px;
}

.qty {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.empty {
  margin: 0;
  padding: 14px 2px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}
</style>
