<script setup lang="ts">
/**
 * FR-19.8 — step three of the move off Local Mode, after the reload.
 *
 * The FR-19.7 bar's sibling: the person switched the app to a server on
 * M17 and came back up here, and the one thing left to do is restore the
 * file they downloaded a minute ago. A sentence in a sheet would be the
 * "reader and no verb" shape again, so it is a bar under the app bar on
 * every screen until the restore commits — or until they say they want a
 * fresh start, which App.vue confirms before it clears the flag.
 *
 * Purely presentational: App.vue owns whether it renders and what the two
 * presses do.
 */
import { IonIcon } from '@ionic/vue'
import { archiveOutline } from 'ionicons/icons'

import { t } from '@/i18n'

const emit = defineEmits<{
  /** Open M18 to restore the backup. */
  restore: []
  /** Decline the restore — a fresh start on the server. */
  skip: []
}>()
</script>

<template>
  <div class="migration-banner" role="status" data-testid="migration-banner">
    <IonIcon class="mark" :icon="archiveOutline" />
    <span class="text">
      <strong>{{ t('migration.banner.title') }}</strong>
      <span class="note">{{ t('migration.banner.note') }}</span>
    </span>
    <button class="restore" data-testid="migration-banner-restore" @click="emit('restore')">
      {{ t('migration.banner.restore') }}
    </button>
    <button class="skip" data-testid="migration-banner-skip" @click="emit('skip')">
      {{ t('migration.banner.skip') }}
    </button>
  </div>
</template>

<style scoped>
.migration-banner {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  margin: 8px 12px 0;
  padding: 10px 8px 10px 12px;
  border: 1px solid color-mix(in srgb, var(--jp-brand) 34%, transparent);
  border-radius: var(--jp-r-md);
  background: color-mix(in srgb, var(--jp-brand) 14%, var(--jp-surface-page));
}

.mark {
  flex: none;
  color: var(--jp-brand);
  font-size: var(--jp-icon-sm);
}

.text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.text strong {
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
}

.note {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
}

.restore {
  flex: none;
  padding: 7px 14px;
  border: none;
  border-radius: var(--jp-r-pill);
  background: var(--jp-brand);
  color: var(--ct-base);
  font: inherit;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.skip {
  flex: none;
  padding: 6px 8px;
  border: none;
  background: none;
  color: var(--ct-subtext0);
  font: inherit;
  font-size: var(--jp-text-xs);
  cursor: pointer;
}
</style>
