<script setup lang="ts">
/**
 * FR-9.5 — what the most similar earlier trip recorded as missing, at the head
 * of a planning trip's list.
 *
 * Presentational: which trip, which entries and how a comment's meta line
 * reads are decided by the caller (`usePackingHead`), so this card has no
 * opinion about modes.
 */
import { IonButton } from '@ionic/vue'

import { t } from '@/i18n'

/** One remark on an entry, its meta line already joined. */
export interface RadarCardComment {
  id: string
  body: string
  meta: string
}

/** One missing item, as the card shows it. */
export interface RadarCardEntry {
  key: string
  name: string
  why: string
  comments: RadarCardComment[]
}

const props = defineProps<{
  tripName: string
  reason: string
  entries: RadarCardEntry[]
  /** The reference trip's rows are not on this device yet (Server Mode, ADR-033). */
  pending: boolean
}>()

const emit = defineEmits<{ add: [key: string]; hide: [] }>()
</script>

<template>
  <section class="radar-card" data-testid="m4-radar" :aria-label="props.tripName">
    <p v-if="!props.pending" class="jp-eyebrow radar-eyebrow">
      {{ t('packing.radarEyebrow', { n: props.entries.length }) }}
    </p>
    <h2>{{ props.tripName }}</h2>
    <p class="radar-reason">{{ props.reason }}</p>
    <p v-if="props.pending" class="radar-reason" data-testid="m4-radar-pending">
      {{ t('packing.radarPending') }}
    </p>
    <ul v-else class="radar-entries">
      <li
        v-for="entry in props.entries"
        :key="entry.key"
        class="radar-entry"
        :data-testid="`m4-radar-entry-${entry.name}`"
      >
        <span class="radar-name">{{ entry.name }}</span>
        <span class="radar-why">{{ entry.why }}</span>
        <IonButton
          class="radar-add"
          size="small"
          fill="outline"
          :data-testid="`m4-radar-add-${entry.name}`"
          @click="emit('add', entry.key)"
        >
          {{ t('packing.radarAdd') }}
        </IonButton>
        <p
          v-for="comment in entry.comments"
          :key="comment.id"
          class="radar-comment"
          data-testid="m4-radar-comment"
        >
          <q>{{ comment.body }}</q>
          <span class="radar-why" data-testid="m4-radar-comment-meta">{{ comment.meta }}</span>
        </p>
      </li>
    </ul>
    <div class="radar-foot">
      <IonButton size="small" fill="clear" data-testid="m4-radar-hide" @click="emit('hide')">
        {{ t('packing.radarHide') }}
      </IonButton>
    </div>
  </section>
</template>

<style scoped>
.radar-card {
  margin: 12px;
  padding: 14px;
  border-radius: var(--jp-r);
  background: var(--ct-surface0);
}

.radar-eyebrow {
  margin: 0;
  /* The brand role, not the recessive label colour: this line is the reason
     the card is there at all. */
  color: var(--jp-brand);
}

.radar-card h2 {
  margin: 2px 0;
  font-size: var(--jp-text-lg);
}

.radar-reason {
  margin: 0 0 10px;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.radar-entries {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.radar-entry {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  align-items: start;
  padding: 10px 10px 10px 12px;
  border-radius: var(--jp-r-md);
  background: var(--ct-base);
}

.radar-name {
  font-weight: var(--jp-weight-semibold);
}

.radar-why {
  display: block;
  grid-column: 1;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.radar-add {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  margin: 0;
}

.radar-comment {
  grid-column: 1 / -1;
  margin: 6px 0 0;
  padding-top: 6px;
  border-top: 1px solid var(--ct-surface0);
  font-size: var(--jp-text-sm);
}

.radar-comment q {
  quotes: '„' '“';
}

.radar-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}
</style>
