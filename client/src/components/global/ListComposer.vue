<script setup lang="ts">
/**
 * The composer on top of a list — M25's and M6's one card (one component is
 * what keeps the two lists alike). The field and its ＋ on the first line; below, the rows of
 * chips the caller files the next entry with (`ChipRow`).
 *
 * It has M4's one door (FR-21.24): closed until the caller's ＋ FAB opens it,
 * so the list starts at the top of the screen, and open until the reader
 * closes it — ✕ or Escape. It stays open after an entry, because entries come
 * in runs, and it does not close on blur: closing takes a block out of the
 * flow above the list, and the rows would move under the next tap
 * (QuickAddItem's reason). A list with nothing on it finds it open (G-7) —
 * there the field is the only thing to do.
 *
 * Unlike M4's, opening focuses the field: there is no row of suggestions here
 * for the soft keyboard to cover (FR-25.13c's reason does not apply).
 *
 * It holds no rule of its own: what an entry is, and where it is written, is
 * the caller's.
 */
import { IonButton, IonIcon, IonInput } from '@ionic/vue'
import { addOutline, closeCircleOutline } from 'ionicons/icons'
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder: string
  /** The field's accessible name. */
  label: string
  /** The ＋'s accessible name. */
  addLabel: string
  /** The ✕'s accessible name. */
  closeLabel: string
  testid: string
  inputTestid: string
  submitTestid: string
  formTestid?: string
  /** Nothing on the list (G-7): the composer opens by itself, without focus. */
  listEmpty?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
  /** Closed by the reader; the caller drops what it held for the entry. */
  close: []
}>()

const field = ref<{ $el: HTMLIonInputElement } | null>(null)
const expanded = ref(false)

/*
 * Only opens: a list that fills while the composer is open is the run the
 * composer is there for, and closing it then would move the rows under the
 * next tap.
 */
watch(
  () => props.listEmpty,
  (empty) => {
    if (empty) expanded.value = true
  },
  { immediate: true },
)

/** The FAB's way in: the composer, open, and the field focused. */
async function open() {
  expanded.value = true
  await nextTick()
  await field.value?.$el.setFocus?.()
}

function close() {
  expanded.value = false
  emit('update:modelValue', '')
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

/**
 * `expanded` is exposed, not only `open()`: the FAB has nothing left to do
 * while the composer is open, and the caller that owns it hides it then.
 */
defineExpose({ open, expanded })
</script>

<template>
  <div v-if="expanded" class="list-composer jp-card" :data-testid="testid">
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
        @keydown="onKeydown"
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
      <!-- M4's ✕ (QuickAddItem), the same glyph in the same place. -->
      <button
        type="button"
        class="close-btn"
        :aria-label="closeLabel"
        :data-testid="`${testid}-close`"
        @click="close"
      >
        <IonIcon :icon="closeCircleOutline" aria-hidden="true" />
      </button>
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

/* QuickAddItem's ✕. */
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
</style>
