<script setup lang="ts">
/**
 * The app's only time control: a typed field on the 24-hour clock. A view
 * never writes `<input type="time">` — the browser draws that in its locale's
 * clock, AM/PM on an English device (UX-6), as `DateField` keeps the calendar
 * the app's own (ADR-035). Label, class and test id fall through to the input.
 */
import { IonInput } from '@ionic/vue'
import { ref, watch } from 'vue'

import { t } from '@/i18n'
import { settledTime, typedTime } from '@/lib/clockTime'

/**
 * The time as the field would leave it, from the first keystroke: a sheet
 * saved with the field still focused — no blur, as WebKit has it — reads
 * `09:30` where `9:30` is shown.
 */
const model = defineModel<string>({ required: true })
/** The time once the field is left: `HH:MM`, empty, or what is past the clock. */
const emit = defineEmits<{ settle: [value: string] }>()

/** `HH:MM`. */
const TIME_LENGTH = 5

/** What the field shows, which may be the time half typed. */
const text = ref(model.value)
watch(model, (value) => {
  if (value !== settledTime(text.value)) text.value = value
})

/**
 * The input is written as well as the text: a keystroke the clock drops
 * leaves the text as it was, which Vue would not pass down again.
 */
function show(event: CustomEvent, shown: string) {
  text.value = shown
  ;(event.target as HTMLIonInputElement).value = shown
  model.value = settledTime(shown)
}

function onInput(event: CustomEvent) {
  show(event, typedTime(String((event.detail as { value?: unknown }).value ?? '')))
}

function onChange(event: CustomEvent) {
  const settled = settledTime(String((event.detail as { value?: unknown }).value ?? ''))
  show(event, settled)
  // Not read back from the model: a caller that only listens here passes no update.
  emit('settle', settled)
}
</script>

<template>
  <IonInput
    :value="text"
    inputmode="numeric"
    :maxlength="TIME_LENGTH"
    :placeholder="t('common.timePlaceholder')"
    @ionInput="onInput"
    @ionChange="onChange"
  >
    <!-- A label with more than words — what filled the time — goes in Ionic's own slot. -->
    <div v-if="$slots.label" slot="label"><slot name="label" /></div>
  </IonInput>
</template>
