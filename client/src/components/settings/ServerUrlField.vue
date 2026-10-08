<script setup lang="ts">
/**
 * The server URL a person types — M19's server card and M17's move-to-server
 * card. Ionic's stacked input draws no box, so on a card the value read as a
 * caption under its label rather than something to type into (UX-21). The
 * value sits in the app's filled field instead, as M11's and M27's name
 * fields do: the label above, the value on `--ct-surface0`.
 */
import { IonInput } from '@ionic/vue'

defineProps<{ label: string; modelValue: string; placeholder?: string }>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <IonInput
    class="server-url"
    :label="label"
    label-placement="stacked"
    type="url"
    inputmode="url"
    :placeholder="placeholder"
    :value="modelValue"
    @ionInput="(e: CustomEvent) => emit('update:modelValue', String(e.detail.value ?? ''))"
  />
</template>

<style scoped>
/* Ionic renders the input scoped, not in a shadow root, so its wrapper is
   reachable; the label stays Ionic's, which keeps it the input's name. */
.server-url :deep(.native-wrapper) {
  margin-top: 6px;
  padding-inline: 12px;
  border-radius: var(--jp-r-md);
  background: var(--ct-surface0);
}
</style>
