<script setup lang="ts">
/**
 * The search field, one row, identical on every screen that offers one.
 *
 * Two lives, and the prop says which. **Behind the app bar's magnifier**
 * (G-12, FR-25.11k) it is present only while the search is open, owns the
 * focus — opening a field the user then has to tap costs the tap the icon
 * saved — and its ✕ *closes* it. **Persistent** (M9, FR-24.6) it is part of
 * the screen: it takes no focus on arrival, because a keyboard nobody asked
 * for covers the list the screen exists to show, and its ✕ appears only with
 * something to clear, because a control that does nothing is worse than no
 * control. The event is `close` either way; what closing *means* belongs to
 * the screen that renders the row.
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline, searchOutline } from 'ionicons/icons'
import { onMounted, ref } from 'vue'

import { t } from '@/i18n'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder: string
    testid?: string
    /** Part of the screen rather than revealed by the magnifier — see above. */
    persistent?: boolean
  }>(),
  { testid: undefined, persistent: false },
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  close: []
  /** Enter in the field — what it means is the screen's (FR-24.11 on M9). */
  submit: []
}>()

const input = ref<HTMLInputElement | null>(null)
onMounted(() => {
  if (!props.persistent) input.value?.focus()
})
</script>

<template>
  <div class="search-row">
    <IonIcon :icon="searchOutline" />
    <input
      ref="input"
      :value="modelValue"
      :data-testid="testid ?? 'search-input'"
      :placeholder="placeholder"
      autocomplete="off"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown.enter="emit('submit')"
    />
    <button
      v-if="!persistent || modelValue !== ''"
      :aria-label="persistent ? t('common.clear') : t('common.close')"
      :data-testid="persistent ? 'search-clear' : undefined"
      @click="emit('close')"
    >
      <IonIcon :icon="closeOutline" />
    </button>
  </div>
</template>

<style scoped>
.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}

.search-row input {
  flex: 1;
  min-width: 0;
  background: var(--ct-surface0);
  border: none;
  border-radius: var(--jp-r-sm);
  padding: 8px 10px;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
}

.search-row button {
  background: none;
  border: none;
  color: var(--ct-subtext0);
  cursor: pointer;
}
</style>
