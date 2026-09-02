<script setup lang="ts">
/**
 * FR-19.7 — the offer to apply a waiting version now.
 *
 * The announcement itself is older (NFR-4.13): a dot on the G-2 glyph and a
 * sentence two taps away in its detail sheet. Both require knowing what the
 * dot means, which is the whole complaint this bar answers — it sits under
 * the app bar on every screen and is one press from the new version.
 *
 * It states what the press costs, because the press reloads the page: the
 * outbox is durable (NFR-4.1), so unsent changes survive, and saying so is
 * the difference between an offer and a dare.
 *
 * Purely presentational — App.vue owns whether it renders and what the press
 * does, so this component's test can state a moment exactly.
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline, sparklesOutline } from 'ionicons/icons'

import { t } from '@/i18n'

withDefaults(
  defineProps<{
    /** True from the press until the page is replaced — no second press. */
    applying?: boolean
  }>(),
  { applying: false },
)

const emit = defineEmits<{
  /** Apply the waiting version now. */
  apply: []
  /** Hide the bar for this load — the dot and the sheet keep the offer. */
  later: []
}>()
</script>

<template>
  <div class="update-banner" role="status" data-testid="update-banner">
    <IonIcon class="spark" :icon="sparklesOutline" />
    <span class="text">
      <strong>{{ t('update.banner.title') }}</strong>
      <span class="note">{{ t('update.banner.note') }}</span>
    </span>
    <button
      class="apply"
      data-testid="update-banner-apply"
      :disabled="applying"
      @click="emit('apply')"
    >
      {{ applying ? t('update.applying') : t('update.apply') }}
    </button>
    <button
      class="later"
      data-testid="update-banner-later"
      :aria-label="t('update.later')"
      @click="emit('later')"
    >
      <IonIcon :icon="closeOutline" />
    </button>
  </div>
</template>

<style scoped>
.update-banner {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  margin: 8px 12px 0;
  padding: 10px 8px 10px 12px;
  border: 1px solid color-mix(in srgb, var(--jp-action) 34%, transparent);
  border-radius: var(--jp-r-md);
  background: color-mix(in srgb, var(--jp-action) 14%, var(--jp-surface-page));
}

.spark {
  flex: none;
  color: var(--jp-action);
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

.apply {
  flex: none;
  padding: 7px 14px;
  border: none;
  border-radius: var(--jp-r-pill);
  background: var(--jp-action);
  color: var(--ct-base);
  font: inherit;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.apply:disabled {
  cursor: default;
  opacity: 0.6;
}

.later {
  display: grid;
  flex: none;
  padding: 6px;
  border: none;
  background: none;
  color: var(--ct-subtext0);
  cursor: pointer;
  place-items: center;
}

.later ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
