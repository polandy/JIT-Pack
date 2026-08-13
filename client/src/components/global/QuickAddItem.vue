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

defineProps<{
  tripId: string
  isActive: boolean
}>()

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
  return masterStore.searchItems(query.value).slice(0, 5)
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
  const catMap = new Map<string, string>()
  for (const cat of masterStore.categoryList) {
    catMap.set(cat.id, cat.name)
  }

  emit('add', {
    name: item.name,
    sourceItemId: item.id,
    weightGrams: item.weight_grams,
    valueCents: item.value_cents,
    categoryName: item.category_id ? (catMap.get(item.category_id) ?? null) : null,
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
          :aria-label="t('common.add')"
          @click="submitFreeText"
        >
          <IonIcon slot="icon-only" :icon="checkmarkOutline" />
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
  border-radius: 10px;
  cursor: pointer;
  color: var(--ct-subtext0);
  font-size: 0.95rem;
}

.quick-add-trigger:active {
  background: var(--ct-surface1);
}

.quick-add-form {
  background: var(--ct-surface0);
  border: 1px solid var(--ct-blue);
  border-radius: 10px;
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
  font-size: 20px;
  padding: 4px;
}

.suggestions {
  margin-top: 4px;
  background: transparent;
}

.add-hint {
  font-size: 0.75rem;
  color: var(--ct-yellow);
  margin: 4px 8px 0;
}

.no-match {
  font-size: 0.8rem;
  color: var(--ct-subtext0);
  margin: 8px 8px 0;
}
</style>
