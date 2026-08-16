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
import { resolvedLines } from '@/domain/templates'
import { useMasterStore } from '@/stores/masterStore'

const props = defineProps<{ templateId: string }>()
const emit = defineEmits<{ close: [] }>()

const masterStore = useMasterStore()

const template = computed(() => masterStore.getTemplate(props.templateId))
const lines = computed(() =>
  resolvedLines(masterStore.resolve(props.templateId), masterStore.itemList),
)
</script>

<template>
  <section class="sheet-body" data-testid="group-peek-sheet">
    <header class="head">
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
        <span class="name">{{ line.name }}</span>
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
