<script setup lang="ts">
/**
 * FR-25.33: the pack snackbar after its *Notiz* — the same sentence and
 * undo, with a one-line field for what exactly went in. An Ionic toast
 * cannot hold a field, so the screen renders this in the snackbar's place;
 * the undo it offers is the snackbar's own, still armed (`usePackAnnouncer`).
 *
 * The field saves on Enter and leaves on Escape. Leaving it any other way
 * keeps nothing: a bar that wrote on blur would write half a word whenever
 * the keyboard folded away.
 */
import { computed, onMounted, ref } from 'vue'

import { PACK_NOTE_MAX_LENGTH, packNoteValue } from '@/domain/packNote'
import { t } from '@/i18n'

const props = defineProps<{
  /** The snackbar's sentence (*Lange Hose gepackt*). */
  message: string
  /** The row's note as it stands, the field's start. */
  current: string | null
}>()

const emit = defineEmits<{
  /** The note as typed; the action decides what that stores. */
  save: [typed: string]
  undo: []
  close: []
}>()

const typed = ref(props.current ?? '')
const input = ref<HTMLInputElement | null>(null)
const count = computed(() => Array.from(typed.value).length)

onMounted(() => input.value?.focus())

function save() {
  // An unchanged note is no edit: it would cost a write, an activity line
  // and an HLC for nothing.
  if (packNoteValue(typed.value) === props.current) emit('close')
  else emit('save', typed.value)
}
</script>

<template>
  <div class="pack-note-bar" data-testid="m4-pack-note-bar">
    <div class="line">
      <span class="message">{{ message }}</span>
      <!-- mousedown is held back so the tap does not blur the field first,
           folding the keyboard and moving the button from under the finger. -->
      <button
        type="button"
        class="act"
        data-testid="m4-pack-note-undo"
        @mousedown.prevent
        @click="emit('undo')"
      >
        {{ t('packing.undo') }}
      </button>
    </div>
    <input
      ref="input"
      v-model="typed"
      data-testid="m4-pack-note-input"
      :maxlength="PACK_NOTE_MAX_LENGTH"
      :aria-label="t('packing.packNoteLabel')"
      :placeholder="t('packing.packNotePlaceholder')"
      autocomplete="off"
      enterkeyhint="done"
      @keydown.enter.prevent="save"
      @keydown.esc.prevent="emit('close')"
    />
    <div class="count jp-meta" data-testid="m4-pack-note-count">
      {{ t('packing.packNoteCount', { n: count, max: PACK_NOTE_MAX_LENGTH }) }}
    </div>
  </div>
</template>

<style scoped>
/* The snackbar's own look (App.vue's `.pack-toast`), where the snackbar stood:
   above the FAB, so the field is never under it. */
.pack-note-bar {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: calc(84px + var(--ion-safe-area-bottom, 0px));
  max-width: 560px;
  margin-left: auto;
  padding: 10px 14px 8px;
  background: var(--ct-surface1);
  color: var(--ct-text);
  border: 1px solid var(--ct-surface2);
  border-radius: var(--jp-r-md);
  box-shadow: var(--jp-shadow);
  z-index: 10;
}

.line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.message {
  flex: 1;
  min-width: 0;
}

.act {
  background: none;
  border: none;
  padding: 6px 4px;
  color: var(--jp-brand);
  font-weight: var(--jp-weight-bold);
  text-transform: uppercase;
}

input {
  width: 100%;
  box-sizing: border-box;
  background: var(--ct-surface0);
  border: 1px solid var(--jp-brand);
  border-radius: var(--jp-r-sm);
  padding: 8px 10px;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
}

.count {
  margin-top: 4px;
  text-align: right;
}
</style>
