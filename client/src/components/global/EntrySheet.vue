<script setup lang="ts">
/**
 * The sheet a list's entry is written or edited in — M6's entry, M25's new
 * task from the composer's *＋ Tag* (owner, 2026-09-26: the dialog must be
 * the same, so it is one component). Its head, the name, the due day, the
 * tag, and the buttons: *Entfernen* where the entry can go, and the one that
 * writes. Nothing is written before that button.
 *
 * The day and the tag are the caller's slots (`DueChips`, `TagPicker`), so
 * what they write stays the caller's rule.
 */
import { IonButton, IonIcon, IonInput } from '@ionic/vue'
import { trashOutline } from 'ionicons/icons'

import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { t } from '@/i18n'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    name: string
    nameLabel: string
    dueLabel: string
    confirmLabel: string
    /** Offer *Entfernen* — an existing entry the list owns. */
    removable?: boolean
    /** The day row — absent for an entry that has none to set (a bought one). */
    dated?: boolean
    testid: string
    titleTestid: string
    closeTestid: string
    nameTestid: string
    confirmTestid: string
    removeTestid?: string
  }>(),
  { removable: false, dated: true, removeTestid: undefined },
)

const emit = defineEmits<{
  close: []
  'update:name': [name: string]
  confirm: []
  remove: []
}>()
</script>

<template>
  <SheetModal :is-open="open" :testid="testid" @dismiss="emit('close')">
    <!-- Guarded by `open` itself: `is-open` alone only animates the modal,
         and a spec's stub renders the slot regardless. -->
    <section v-if="open" class="entry-sheet">
      <SheetHead
        :title="title"
        :title-testid="titleTestid"
        :close-testid="closeTestid"
        @close="emit('close')"
      />
      <IonInput
        :value="name"
        :label="nameLabel"
        label-placement="stacked"
        fill="outline"
        :data-testid="nameTestid"
        @ionInput="(e: CustomEvent) => emit('update:name', (e.detail.value as string) ?? '')"
        @keyup.enter="emit('confirm')"
      />
      <div v-if="dated" class="due">
        <div class="due-label jp-section-count">{{ dueLabel }}</div>
        <slot name="due" />
      </div>
      <slot name="tag" />
      <div class="actions">
        <IonButton
          v-if="removable"
          fill="clear"
          color="danger"
          :data-testid="removeTestid"
          @click="emit('remove')"
        >
          <IonIcon slot="start" :icon="trashOutline" aria-hidden="true" />
          {{ t('common.remove') }}
        </IonButton>
        <IonButton
          :disabled="name.trim() === ''"
          :data-testid="confirmTestid"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </IonButton>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
.entry-sheet {
  padding: 4px 18px 22px;
}

.due {
  margin-top: 12px;
}

.due-label {
  margin-bottom: 6px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
