<script setup lang="ts">
/**
 * One entry of a thread, looked at properly (FR-7.9, FR-7.13) — the sheet
 * behind an entry's words on M26. Everyone who has ticked the thread is named
 * on its first note's sheet and only there (decision 3): the list itself
 * stays a list, not a read-receipt board. Deleting a first note deletes its
 * thread, so the button says how many replies go with it.
 *
 * Presentation only, per §6 of the concept: a phone number in the body reads
 * as a `tel:` link, and holding a press on the text copies it verbatim — the
 * note is stored as plain text either way, in clear, visible to every member
 * and in the server export. It is a key-box code, not a password.
 */
import { IonButton, IonIcon } from '@ionic/vue'
import { copyOutline, trashOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import SheetHead from '@/components/global/SheetHead.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { useLongPress } from '@/composables/useLongPress'
import { copyText } from '@/lib/clipboard'
import { linkifyPhoneNumbers } from '@/domain/noteText'
import { t } from '@/i18n'
import { createdStampText } from '@/lib/taskFacts'
import type { NameOf } from '@/lib/rowFacts'
import type { ItemComment } from '@/types/domain'

const props = defineProps<{
  note: ItemComment
  /** Every user id that has ticked this thread (decision 3); empty for a reply. */
  ackedBy: ReadonlySet<string>
  /** FR-7.13: the replies a delete of this first note takes with it. */
  replyCount: number
  nameOf: NameOf
}>()

const emit = defineEmits<{
  close: []
  remove: []
}>()

const isReply = computed(() => props.note.parent_id !== null)
const removeLabel = computed(() => {
  if (isReply.value) return t('notes.removeReply')
  if (props.replyCount > 0) return t('notes.removeWithReplies', { n: props.replyCount })
  return t('notes.remove')
})

const stamp = computed(() =>
  createdStampText({ ...props.note, resolved_at: null, resolved_by_user_id: null }, props.nameOf),
)
const segments = computed(() => linkifyPhoneNumbers(props.note.body))
const ackedNames = computed(() =>
  [...props.ackedBy].map((id) => props.nameOf(id) ?? id).sort((a, b) => a.localeCompare(b)),
)

const copied = ref(false)
const press = useLongPress<string>(async (text) => {
  copied.value = await copyText(text)
  if (copied.value) setTimeout(() => (copied.value = false), 1500)
})
</script>

<template>
  <div class="sheet" data-testid="note-sheet">
    <SheetHead
      :title="isReply ? t('notes.replySheetTitle') : note.title || t('notes.sheetTitle')"
      :meta="stamp"
      title-testid="note-sheet-title"
      close-testid="note-sheet-close"
      @close="emit('close')"
    />

    <p
      class="body"
      data-testid="note-sheet-body"
      @pointerdown="press.down(note.body, $event.clientX, $event.clientY)"
      @pointermove="press.move($event.clientX, $event.clientY)"
      @pointerup="press.cancel()"
      @pointercancel="press.cancel()"
    >
      <template v-for="(seg, i) in segments" :key="i">
        <a v-if="seg.tel" :href="`tel:${seg.tel}`" class="tel" @click.stop>{{ seg.text }}</a>
        <template v-else>{{ seg.text }}</template>
      </template>
    </p>
    <p v-if="copied" class="copied" data-testid="note-sheet-copied">
      <IonIcon :icon="copyOutline" aria-hidden="true" />
      {{ t('notes.copied') }}
    </p>

    <div v-if="ackedNames.length > 0" class="acked" data-testid="note-sheet-acked">
      <div class="acked-label jp-section-count">{{ t('notes.ackedBy') }}</div>
      <div v-for="name in ackedNames" :key="name" class="acked-row">
        <UserAvatar :name="name" :seed="name" :size="22" />
        <span>{{ name }}</span>
      </div>
    </div>

    <div class="actions">
      <IonButton
        expand="block"
        fill="clear"
        data-testid="note-sheet-remove"
        @click="emit('remove')"
      >
        <IonIcon slot="start" :icon="trashOutline" />
        {{ removeLabel }}
      </IonButton>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  padding: 4px 16px 18px;
}

.body {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  /* Selecting the text would fight the long-press-to-copy gesture. */
  user-select: none;
}

.tel {
  color: var(--jp-action);
  text-decoration: underline;
}

.copied {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.acked {
  margin: 16px 0 0;
}

.acked-label {
  margin-bottom: 4px;
}

.acked-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: var(--jp-text-sm);
}

.actions {
  margin-top: 18px;
}
</style>
