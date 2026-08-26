<script setup lang="ts">
/**
 * The visible file trigger (ADR-035): a themed, catalogue-labelled button in
 * front of a hidden `<input type="file">` — the same pattern M10's photo and
 * M17's avatar already use, made shareable for the surfaces whose trigger
 * *is* the control (UX-6). The browser's own "Choose File / No file chosen"
 * chrome speaks the browser's language, not the app's.
 */
import { ref } from 'vue'
import { IonButton } from '@ionic/vue'

import { t } from '@/i18n'

defineProps<{ accept: string; testid: string }>()
const emit = defineEmits<{ file: [file: File] }>()

const input = ref<HTMLInputElement | null>(null)

function onChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('file', file)
  // The same file can be picked again after a failed parse.
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<template>
  <IonButton fill="outline" size="small" :data-testid="testid" @click="input?.click()">
    {{ t('common.chooseFile') }}
  </IonButton>
  <input
    ref="input"
    type="file"
    :accept="accept"
    hidden
    :data-testid="`${testid}-input`"
    @change="onChange"
  />
</template>
