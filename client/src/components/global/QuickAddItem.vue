<script setup lang="ts">
/**
 * Quick-add on the packing list (FR-5.6, FR-25.13/13a).
 *
 * Collapsed by default and opened *and focused* by M4's ＋ FAB, so the
 * add path is one tap from anywhere in the list rather than a target to
 * scroll back to.
 *
 * **The visible confirm button is the primary commit.** A phone has no
 * Enter key in reach, and leaving the action to the soft keyboard's
 * return key makes it invisible — this corrects the original design,
 * which was desktop thinking. Enter stays as the desktop shortcut.
 *
 * The form stays open after adding, because rows are entered in runs, and
 * it closes only when asked to: ✕, Escape, or the FAB again.
 *
 * M8 reuses this component verbatim (§3.25 consistency directive,
 * owner 2026-08-08): `confirmLabel` names the scope on the commit button
 * ("Zur Gruppe hinzufügen") and `excludeItemIds` keeps positions the
 * template already carries out of the suggestions — a duplicate is
 * reported by the caller, not offered again here.
 *
 * **Deliberately no collapse-on-blur**, which FR-25.13a's wording allows
 * for an empty form. Collapsing removes a block from the flow *above* the
 * list, so the rows move between the pointer going down and coming up and
 * the browser dispatches no click at all — the first tap after adding an
 * item was swallowed, every time. An open form the user closes is better
 * than a list that ignores one tap in a place nobody would look for it.
 */
import { IonInput, IonList, IonItem, IonLabel, IonIcon, IonButton } from '@ionic/vue'
import { addCircleOutline, checkmarkOutline, closeCircleOutline } from 'ionicons/icons'
import { ref, computed, nextTick } from 'vue'

import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import type { MasterItem } from '@/types/domain'

const props = withDefaults(
  defineProps<{
    /** M4's FR-9.1 hint: an add on an active trip flags the item Missing. */
    isActive?: boolean
    /** Scope-labelled commit text (FR-25.13 in M8); icon-only when absent. */
    confirmLabel?: string
    /** Master items to keep out of the suggestions (already present). */
    excludeItemIds?: string[]
  }>(),
  { isActive: false, confirmLabel: undefined, excludeItemIds: () => [] },
)

const emit = defineEmits<{
  add: [
    item: {
      name: string
      sourceItemId: string | null
      weightGrams: number | null
      valueCents: number | null
      categoryName: string | null
    },
  ]
}>()

const masterStore = useMasterStore()

const expanded = ref(false)
const query = ref('')
const inputRef = ref<InstanceType<typeof IonInput> | null>(null)

const suggestions = computed(() => {
  if (!query.value || query.value.length < 2) return []
  const excluded = new Set(props.excludeItemIds)
  return masterStore
    .searchItems(query.value)
    .filter((i) => !excluded.has(i.id))
    .slice(0, 5)
})

async function focusInput() {
  await nextTick()
  await inputRef.value?.$el?.setFocus()
}

/** Opened by the FAB (FR-25.13a): expanding without focus costs a second tap. */
async function open() {
  expanded.value = true
  await focusInput()
}

function close() {
  expanded.value = false
  query.value = ''
}

async function toggle() {
  if (expanded.value) close()
  else await open()
}

defineExpose({ open })

function selectSuggestion(item: MasterItem) {
  emit('add', {
    name: item.name,
    sourceItemId: item.id,
    weightGrams: item.weight_grams,
    valueCents: item.value_cents,
    // The generated row carries one grouping key, which since FR-24.1 is
    // the master item's *primary* tag (FR-24.2) — the trip side keeps a
    // single snapshot, it does not gain the whole set.
    categoryName: masterStore.getPrimaryTag(item.id)?.name ?? null,
  })
  query.value = ''
  // Stays open, like a free-text add: picking a suggestion is the same
  // act, and closing on one but not the other would be arbitrary.
  void focusInput()
}

function submitFreeText() {
  const name = query.value.trim()
  if (!name) return

  emit('add', {
    name,
    sourceItemId: null,
    weightGrams: null,
    valueCents: null,
    categoryName: null,
  })
  query.value = ''
  void focusInput()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    submitFreeText()
  }
  if (event.key === 'Escape') {
    close()
  }
}
</script>

<template>
  <div class="quick-add" :class="{ expanded }">
    <button v-if="!expanded" class="quick-add-trigger" data-testid="quick-add-open" @click="toggle">
      <IonIcon :icon="addCircleOutline" />
      <span>{{ t('quickAdd.trigger') }}</span>
    </button>

    <div v-else class="quick-add-form">
      <div class="input-row">
        <IonInput
          ref="inputRef"
          v-model="query"
          data-testid="quick-add-input"
          :placeholder="t('quickAdd.placeholder')"
          :clear-input="true"
          @keydown="onKeydown"
        />
        <!-- The primary commit, and deliberately a button: see the header. -->
        <IonButton
          size="small"
          data-testid="quick-add-confirm"
          :disabled="!query.trim()"
          :aria-label="confirmLabel ?? t('common.add')"
          @click="submitFreeText"
        >
          <template v-if="confirmLabel">{{ confirmLabel }}</template>
          <IonIcon v-else slot="icon-only" :icon="checkmarkOutline" />
        </IonButton>
        <button class="close-btn" :aria-label="t('common.close')" @click="close">
          <IonIcon :icon="closeCircleOutline" />
        </button>
      </div>

      <p v-if="isActive" class="add-hint">{{ t('quickAdd.missingHint') }}</p>

      <IonList v-if="suggestions.length > 0" class="suggestions">
        <IonItem
          v-for="item in suggestions"
          :key="item.id"
          button
          lines="inset"
          data-testid="quick-add-suggestion"
          @click="selectSuggestion(item)"
        >
          <IonLabel>
            <h3>{{ item.name }}</h3>
            <p v-if="item.weight_grams">
              {{
                item.weight_grams >= 1000
                  ? `${(item.weight_grams / 1000).toFixed(1)} kg`
                  : `${item.weight_grams} g`
              }}
            </p>
          </IonLabel>
        </IonItem>
      </IonList>

      <p v-if="query.length >= 2 && suggestions.length === 0" class="no-match">
        {{ t('quickAdd.newItem', { name: query }) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.quick-add {
  padding: 8px 16px;
}

.quick-add-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: var(--ct-surface0);
  border: 1px dashed var(--ct-surface2);
  border-radius: var(--jp-r-sm);
  cursor: pointer;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-md);
}

.quick-add-trigger:active {
  background: var(--ct-surface1);
}

.quick-add-form {
  background: var(--ct-surface0);
  border: 1px solid var(--ct-blue);
  border-radius: var(--jp-r-sm);
  padding: 8px;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.input-row ion-input {
  flex: 1;
}

.close-btn {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-md);
  padding: 4px;
}

.suggestions {
  margin-top: 4px;
  background: transparent;
}

.add-hint {
  font-size: var(--jp-text-xs);
  color: var(--ct-yellow);
  margin: 4px 8px 0;
}

.no-match {
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
  margin: 8px 8px 0;
}
</style>
