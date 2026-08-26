<script setup lang="ts">
/**
 * The app's only date control (ADR-035): a read-only field that renders its
 * value through `formatDay` — the one temporal formatter — and opens the
 * calendar in the app's own sheet chrome. A view never writes
 * `<input type="date">`; the browser's rendering of that control belongs to
 * the browser's locale and theme, not the app's (UX-6).
 */
import { computed, ref } from 'vue'
import { IonDatetime, IonInput } from '@ionic/vue'

import SheetModal from '@/components/global/SheetModal.vue'
import { t, formatDay, intlLocale } from '@/i18n'

const props = withDefaults(
  defineProps<{
    label: string
    value: string
    testid: string
    readonly?: boolean
  }>(),
  { readonly: false },
)

const emit = defineEmits<{ update: [iso: string] }>()

const open = ref(false)

const display = computed(() => (props.value ? formatDay(props.value) : ''))

function onPicked(picked: string | string[] | null | undefined) {
  // presentation="date" still reports a full ISO datetime; the field's value
  // is the day alone.
  emit('update', typeof picked === 'string' ? picked.slice(0, 10) : '')
  open.value = false
}
</script>

<template>
  <IonInput
    :label="label"
    label-placement="stacked"
    :value="display"
    :placeholder="t('dateField.placeholder')"
    :data-testid="testid"
    readonly
    @click="!props.readonly && (open = true)"
    @keyup.enter="!props.readonly && (open = true)"
  />
  <SheetModal :is-open="open" @dismiss="open = false">
    <div class="picker ion-padding">
      <IonDatetime
        presentation="date"
        :value="props.value || undefined"
        :locale="intlLocale()"
        :first-day-of-week="1"
        show-default-buttons
        show-clear-button
        :done-text="t('common.done')"
        :cancel-text="t('common.cancel')"
        :clear-text="t('dateField.clear')"
        :data-testid="`${testid}-picker`"
        @ionChange="onPicked(($event as CustomEvent).detail.value)"
        @ionCancel="open = false"
      />
    </div>
  </SheetModal>
</template>

<style scoped>
.picker {
  display: flex;
  justify-content: center;
}

.picker ion-datetime {
  --background: var(--jp-surface-card);
  border-radius: var(--jp-r-lg);
}
</style>
