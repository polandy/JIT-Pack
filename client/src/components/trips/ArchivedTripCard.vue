<script setup lang="ts">
/**
 * What an archived trip leads with — the one real remnant of the dropped
 * "Danach" phase (owner, 2026-08-08).
 *
 * FR-9.4: it says what the review *would* say before the tap, and names the
 * proposals rather than counting them — „2 Vorschläge" is the number the
 * button already implies, and the names are what decide whether the trip is
 * worth reviewing now or later.
 */
import { IonButton, IonIcon } from '@ionic/vue'
import { albumsOutline, sparklesOutline } from 'ionicons/icons'

import { t } from '@/i18n'
import { tripSubPath } from '@/router/paths'

const props = defineProps<{
  tripId: string
  /** The first few proposals M14 would make, already capped by the caller. */
  proposalNames: string[]
}>()
</script>

<template>
  <div class="closing-card">
    <!-- No pictorial mark. The puzzle emoji came from the prototype, where
         §3.27 was about composition; it said nothing about a finished trip.
         Nothing replaced it: every other heading in the app is plain text,
         the card already carries two button icons, and a third glyph
         decorated rather than told. -->
    <h2>{{ t('packing.tripFinished') }}</h2>
    <p class="closing-hint">{{ t('packing.tripFinishedHint') }}</p>
    <p class="closing-hint" data-testid="m4-closing-teaser">
      {{
        props.proposalNames.length > 0
          ? t('packing.reviewTeaser', { names: props.proposalNames.join(', ') })
          : t('packing.reviewTeaserNone')
      }}
    </p>
    <div class="closing-actions">
      <IonButton
        size="small"
        data-testid="m4-template-from-trip"
        :router-link="tripSubPath(props.tripId, 'template')"
      >
        <IonIcon slot="start" :icon="albumsOutline" />
        {{ t('packing.templateFromTrip') }}
      </IonButton>
      <IonButton size="small" fill="outline" :router-link="tripSubPath(props.tripId, 'review')">
        <IonIcon slot="start" :icon="sparklesOutline" />
        {{ t('packing.reviewSuggestions') }}
      </IonButton>
    </div>
  </div>
</template>

<style scoped>
.closing-card {
  margin: 12px;
  padding: 14px;
  border-radius: var(--jp-r);
  background: var(--ct-surface0);
}

.closing-card h2 {
  margin: 0 0 4px;
  font-size: var(--jp-text-lg);
}

.closing-hint {
  margin: 0 0 10px;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.closing-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
