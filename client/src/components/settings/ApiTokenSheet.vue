<script setup lang="ts">
/**
 * The one-time reveal of a minted API token (FR-23.7, ADR-039).
 *
 * The token is rendered as text and *then* offered for copying, not only put
 * on the clipboard: a value shown exactly once has to be shown to the person,
 * and the clipboard is refusable. That is also what lets the e2e case assert
 * on what the user sees rather than on a browser permission.
 *
 * It is held in the caller's component state and dropped when this closes —
 * nothing about a token is ever persisted, here or anywhere else.
 */
import { ref, watch } from 'vue'
import { IonButton, IonIcon } from '@ionic/vue'
import { copyOutline, checkmarkOutline } from 'ionicons/icons'
import SheetModal from '@/components/global/SheetModal.vue'
import { copyText } from '@/lib/clipboard'
import { t } from '@/i18n'

const props = defineProps<{ open: boolean; token: string; expiresAt: string }>()
const emit = defineEmits<{ close: [] }>()

const copied = ref(false)

// A fresh token is a fresh reveal: the confirmation must not carry over from
// the previous one and claim this token was copied.
watch(
  () => props.token,
  () => {
    copied.value = false
  },
)

async function copy() {
  copied.value = await copyText(props.token)
}

/** The expiry as the person set it, in their own locale. */
function expirySentence(): string {
  if (!props.expiresAt) return t('settings.tokenNeverExpires')
  return t('settings.tokenExpiresAt', {
    date: new Date(props.expiresAt).toLocaleDateString(),
  })
}
</script>

<template>
  <SheetModal :is-open="open" @dismiss="emit('close')">
    <div class="reveal" data-testid="token-sheet">
      <h2 class="jp-sheet-title">{{ t('settings.tokenRevealTitle') }}</h2>

      <p class="warn">{{ t('settings.tokenShownOnce') }}</p>

      <code class="jp-mono value" data-testid="token-value">{{ token }}</code>

      <IonButton expand="block" data-testid="token-copy" @click="copy">
        <IonIcon slot="start" :icon="copied ? checkmarkOutline : copyOutline" />
        {{ copied ? t('common.copied') : t('common.copy') }}
      </IonButton>

      <p class="note">{{ expirySentence() }}</p>
      <p class="note">{{ t('settings.tokenNoRevoke') }}</p>

      <IonButton expand="block" fill="clear" data-testid="token-done" @click="emit('close')">
        {{ t('common.done') }}
      </IonButton>
    </div>
  </SheetModal>
</template>

<style scoped>
.reveal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 20px 20px;
}

/*
 * The value sits in the sunken role: it is the thing being read out of the
 * sheet, not a control on it.
 */
.value {
  display: block;
  background: var(--jp-surface-sunken);
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  padding: 12px;
  user-select: all;
}

.warn {
  margin: 0;
  color: var(--jp-brand);
}

.note {
  margin: 0;
  color: var(--ct-subtext0);
}
</style>
