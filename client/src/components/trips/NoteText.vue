<script setup lang="ts">
/**
 * A note's words as FR-7.9 and FR-7.13 present them: a phone number as a
 * `tel:` link, a short code as a chip that copies itself — the thing a
 * reader came to the notes for, one tap from the clipboard.
 *
 * `live` is false on M26's list card: the card is itself a button, and a
 * control inside a control is neither valid nor reachable. There the chip
 * only marks the code; the thread view is where it copies.
 */
import { computed } from 'vue'

import { noteSegments } from '@/domain/noteText'
import { t } from '@/i18n'
import { copyText } from '@/lib/clipboard'
import { presentToast } from '@/lib/toast'

const props = defineProps<{
  body: string
  live: boolean
}>()

const segments = computed(() => noteSegments(props.body))

async function copyCode(code: string) {
  if (await copyText(code)) await presentToast({ message: t('notes.codeCopied', { code }) })
}
</script>

<template>
  <template v-for="(seg, i) in segments" :key="i">
    <template v-if="live">
      <a v-if="seg.tel" :href="`tel:${seg.tel}`" class="tel" @click.stop>{{ seg.text }}</a>
      <button
        v-else-if="seg.code"
        type="button"
        class="code jp-num"
        data-testid="note-code"
        @click.stop="copyCode(seg.code)"
      >
        {{ seg.text }}
      </button>
      <template v-else>{{ seg.text }}</template>
    </template>
    <template v-else>
      <span v-if="seg.tel" class="tel">{{ seg.text }}</span>
      <span v-else-if="seg.code" class="code jp-num">{{ seg.text }}</span>
      <template v-else>{{ seg.text }}</template>
    </template>
  </template>
</template>

<style scoped>
.tel {
  color: var(--jp-action);
  text-decoration: underline;
}

.code {
  display: inline-block;
  padding: 0 6px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-xs);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font: inherit;
  font-weight: var(--jp-weight-semibold);
  line-height: inherit;
}

button.code {
  cursor: copy;
}
</style>
