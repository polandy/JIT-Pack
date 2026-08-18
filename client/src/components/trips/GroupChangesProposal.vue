<script setup lang="ts">
/**
 * FR-27.4 — the question, asked at the trip.
 *
 * A group this trip follows has changed, and the owner's rule (2026-08-18) is
 * that the trip takes it over only if asked and answered. The card names every
 * change before either button is pressed: "N changes" with nothing to read is
 * a dialog that can only be answered by guessing.
 *
 * It sits at the top of M4 rather than in a modal on purpose — a modal over a
 * packing list would have to be dismissed before the list it talks about can
 * be looked at, and dismissing is not one of the two answers.
 */
import { computed, ref } from 'vue'
import { IonButton, IonIcon } from '@ionic/vue'
import { chevronDown, chevronUp } from 'ionicons/icons'

import type { RefreshPlan } from '@/domain/refresh'
import { describeProposedChange } from '@/lib/refreshWording'
import { t } from '@/i18n'

const props = defineProps<{ plan: RefreshPlan }>()
const emit = defineEmits<{ apply: []; decline: [] }>()

/**
 * Above this many lines the list folds. Same threshold and same reason as
 * M2's log (owner, 2026-08-18): a handful is worth reading in place, and a
 * group edit that touched forty positions must not push the packing list
 * itself off the screen.
 */
const INLINE_LIMIT = 10

const expanded = ref(false)
const changes = computed(() => props.plan.log)
const folds = computed(() => changes.value.length > INLINE_LIMIT)
const shown = computed(() =>
  folds.value && !expanded.value ? changes.value.slice(0, INLINE_LIMIT) : changes.value,
)
</script>

<template>
  <section class="jp-card proposal" data-testid="m4-group-proposal">
    <p class="jp-eyebrow">{{ t('trips.proposedTitle') }}</p>
    <p class="lead">{{ t('trips.proposedLead', { n: changes.length }) }}</p>

    <ul class="changes" data-testid="m4-group-proposal-changes">
      <li v-for="(entry, index) in shown" :key="`${entry.item_name}-${index}`">
        {{ describeProposedChange(entry) }}
      </li>
    </ul>

    <button
      v-if="folds"
      class="more"
      data-testid="m4-group-proposal-more"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ t('trips.proposedMore', { n: changes.length }) }}
      <IonIcon :icon="expanded ? chevronUp : chevronDown" />
    </button>

    <p class="note">{{ t('trips.proposedDeclineNote') }}</p>

    <div class="answers">
      <IonButton size="small" data-testid="m4-group-proposal-apply" @click="emit('apply')">
        {{ t('trips.proposedApply') }}
      </IonButton>
      <IonButton
        size="small"
        fill="outline"
        color="medium"
        data-testid="m4-group-proposal-decline"
        @click="emit('decline')"
      >
        {{ t('trips.proposedDecline') }}
      </IonButton>
    </div>
  </section>
</template>

<style scoped>
.proposal {
  margin: 8px 12px 12px;
  padding: 12px 14px 10px;
}

.lead {
  margin: 2px 0 8px;
}

.changes {
  list-style: none;
  margin: 0;
  padding: 0;
  color: var(--ct-subtext0);
}

.changes li + li {
  margin-top: 2px;
}

.more {
  align-items: center;
  background: none;
  border: none;
  color: var(--jp-action);
  display: inline-flex;
  gap: 4px;
  margin-top: 6px;
  padding: 0;
}

.more ion-icon {
  font-size: var(--jp-icon-xs);
}

/* The consequence of "no" is stated where "no" is pressed — it is the one
   thing about this card a user cannot work out from the list above it. */
.note {
  color: var(--ct-overlay1);
  margin: 8px 0 0;
}

.answers {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
