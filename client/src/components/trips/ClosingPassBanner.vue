<script setup lang="ts">
/**
 * FR-9.3's closing pass, announced on the list it is a mode of.
 *
 * The pass is a posture of M4 rather than a screen of its own, so the only
 * thing it owes the reader is what it is asking and how to leave — and
 * *Fertig* is the archive step itself, never a gate in front of it.
 */
import { IonButton } from '@ionic/vue'

import { t } from '@/i18n'

const emit = defineEmits<{ finish: []; cancel: [] }>()
</script>

<template>
  <div class="jp-card pass-banner" data-testid="m4-pass-banner">
    <!-- The class this div carried in `PackingListPage.vue` was `grow`, which
         that file's scoped stylesheet never defined and no global one does
         either; it is dropped rather than carried over. -->
    <div>
      <h2 class="jp-eyebrow">{{ t('packing.passTitle') }}</h2>
      <p>{{ t('packing.passHint') }}</p>
    </div>
    <div class="pass-actions">
      <IonButton size="small" data-testid="m4-pass-finish" @click="emit('finish')">
        {{ t('packing.passFinish') }}
      </IonButton>
      <IonButton size="small" fill="clear" data-testid="m4-pass-cancel" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </IonButton>
    </div>
  </div>
</template>

<style scoped>
.pass-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
}

.pass-banner p {
  margin: 4px 0 0;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.pass-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}
</style>
