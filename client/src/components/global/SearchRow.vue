<script setup lang="ts">
/**
 * The field behind the app bar's magnifier (G-12, FR-25.11k) — one row,
 * present only while the search is open, identical on every screen that
 * offers one. Paired with `useContextSearch`, which owns the state and
 * the header entry.
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline, searchOutline } from 'ionicons/icons'
import { onMounted, ref } from 'vue'

import { t } from '@/i18n'

defineProps<{ modelValue: string; placeholder: string; testid?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; close: [] }>()

// The row exists only while the search is open, so it can own the focus:
// opening a field the user then has to tap costs the tap the icon saved.
const input = ref<HTMLInputElement | null>(null)
onMounted(() => input.value?.focus())
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
    />
    <button :aria-label="t('common.close')" @click="emit('close')">
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
