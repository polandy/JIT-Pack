<script setup lang="ts">
/**
 * The composer on top of a list — M25's and M6's one card (one component is
 * what keeps the two lists alike). The field and its ＋ on the first line; below, the rows of
 * chips the caller files the next entry with (`ChipRow`).
 *
 * It holds no rule of its own: what an entry is, and where it is written, is
 * the caller's.
 */
import { IonButton, IonIcon, IonInput } from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { ref } from 'vue'

defineProps<{
  modelValue: string
  placeholder: string
  /** The field's accessible name. */
  label: string
  /** The ＋'s accessible name. */
  addLabel: string
  testid: string
  inputTestid: string
  submitTestid: string
  formTestid?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>()

const field = ref<{ $el: HTMLIonInputElement } | null>(null)

/** The FAB's way in: the field, focused. */
async function focus() {
  await field.value?.$el.setFocus()
}

defineExpose({ focus })
</script>

<template>
  <div class="list-composer jp-card" :data-testid="testid">
    <form class="add" :data-testid="formTestid" @submit.prevent="emit('submit')">
      <IonInput
        ref="field"
        :model-value="modelValue"
        class="add-input"
        :placeholder="placeholder"
        :aria-label="label"
        enterkeyhint="done"
        :data-testid="inputTestid"
        @update:model-value="
          (value: string | number | null | undefined) =>
            emit('update:modelValue', String(value ?? ''))
        "
        @keyup.enter="emit('submit')"
      />
      <IonButton
        type="submit"
        fill="clear"
        :disabled="modelValue.trim() === ''"
        :aria-label="addLabel"
        :data-testid="submitTestid"
      >
        <IonIcon slot="icon-only" :icon="addOutline" aria-hidden="true" />
      </IonButton>
    </form>
    <slot />
  </div>
</template>

<style scoped>
.list-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 12px 4px;
  padding: 4px 12px 12px;
}

.add {
  display: flex;
  align-items: center;
  gap: 4px;
}

.add-input {
  flex: 1;
  min-height: 40px;
}

/* The ＋ is a control in a row of 40, not a 48 that pushes the chips down. */
.add ion-button {
  margin: 0;
  height: 40px;
}
</style>
