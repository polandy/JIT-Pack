<script setup lang="ts">
/**
 * M3 step 4 — the quantity review (FR-2.6, FR-14.2), the companions the draft
 * pulls in (FR-20.2–20.4) and the destination checklist offer (FR-13.3).
 */
import { IonList, IonItem, IonLabel, IonInput, IonCheckbox, IonIcon, IonNote } from '@ionic/vue'
import { closeOutline, refreshOutline } from 'ionicons/icons'

import SectionHead from '@/components/global/SectionHead.vue'
import { t } from '@/i18n'
import { reviewKeyOf } from '@/domain/instantiate'
import type { QuantitySuggestion } from '@/domain/suggestions'
import { modeLabel } from '@/lib/modeLabels'
import { isShoppingMode } from '@/types/domain'
import type { WizardCore } from './useWizardCore'

const { core } = defineProps<{ core: WizardCore }>()

const { stepDefaultAction } = core
const { generation, companionResolution } = core.composition
const {
  acceptedSuggestions,
  toggleSuggestion,
  includeChecklist,
  offeredChecklist,
  reviewQuantity,
  dropRow,
  restoreRow,
  isDropped,
  overrideQuantity,
  suggestionFor,
  acceptSuggestion,
} = core.review

function suggestionHint(s: QuantitySuggestion): string {
  return s.history.map((h) => `${h.year}: ${h.quantity}`).join(' · ')
}

function travelerName(index: number | null): string | null {
  return index === null
    ? null
    : core.roster.travelers.value[index]?.name || t('wizard.travelerFallback', { n: index + 1 })
}
</script>

<template>
  <section data-testid="wizard-step-4">
    <SectionHead :title="t('wizard.sectionReview')" />
    <IonList v-if="generation.items.length > 0">
      <IonItem
        v-for="item in generation.items"
        :key="reviewKeyOf(item)"
        class="review-row"
        :class="{ dropped: isDropped(item) }"
        data-testid="wizard-review-row"
      >
        <IonLabel>
          <h3>
            {{ item.name }}
            <!-- FR-2.6: marks explain what the row already is. Labels, not
                 controls — procurement and assignment have one editor (M5),
                 and a second one here is what this FR argues against. -->
            <span v-if="item.per_person" class="mark">
              {{ t('wizard.perPerson') }}
            </span>
            <span v-if="isShoppingMode(item.mode)" class="mark">
              {{ modeLabel(item.mode) }}
            </span>
            <span v-if="isDropped(item)" class="mark">{{ t('wizard.dropped') }}</span>
          </h3>
          <p>
            <template v-if="travelerName(item.traveler_index)"
              >{{ travelerName(item.traveler_index) }} ·
            </template>
            <template v-if="item.category_name">{{ item.category_name }}</template>
          </p>
          <!-- FR-14.2: history hint "2024: 5 · 2025: 6 → suggested 6" -->
          <button
            v-if="suggestionFor(item)"
            type="button"
            class="history-hint"
            data-testid="wizard-history-hint"
            @click="acceptSuggestion(item)"
          >
            {{
              t('wizard.reviewUseSuggestion', {
                history: suggestionHint(suggestionFor(item)!),
                n: suggestionFor(item)!.suggested,
              })
            }}
          </button>
        </IonLabel>
        <span slot="end" class="qty-value jp-num" data-testid="wizard-review-qty">
          {{ reviewQuantity(item) }}
        </span>
        <IonInput
          v-if="!isDropped(item)"
          slot="end"
          class="qty-input"
          type="number"
          min="0"
          :value="reviewQuantity(item)"
          :aria-label="t('wizard.reviewQuantity')"
          @keydown.enter="stepDefaultAction"
          @ionInput="(e: CustomEvent) => overrideQuantity(item, e.detail.value ?? '')"
        />
        <button
          v-if="!isDropped(item)"
          slot="end"
          class="row-action"
          :aria-label="t('wizard.dropRow', { name: item.name })"
          data-testid="wizard-review-drop"
          @click="dropRow(item)"
        >
          <IonIcon :icon="closeOutline" />
        </button>
        <button
          v-else
          slot="end"
          class="row-action"
          :aria-label="t('wizard.restoreRow', { name: item.name })"
          data-testid="wizard-review-restore"
          @click="restoreRow(item)"
        >
          <IonIcon :icon="refreshOutline" />
        </button>
      </IonItem>
    </IonList>
    <div v-else class="empty-hint">{{ t('wizard.reviewEmpty') }}</div>

    <!-- FR-20.2/20.3: companions of on-list items join automatically -->
    <template
      v-if="companionResolution.required.length > 0 || companionResolution.deduped.length > 0"
    >
      <SectionHead :title="t('wizard.sectionCompanions')" />
      <IonList v-if="companionResolution.required.length > 0">
        <IonItem v-for="c in companionResolution.required" :key="c.item_id">
          <IonLabel>
            <h3>{{ c.name }}</h3>
            <p>{{ t('wizard.companionWith', { name: c.via_item_name }) }}</p>
          </IonLabel>
          <IonNote slot="end">×{{ c.quantity }}</IonNote>
        </IonItem>
      </IonList>
      <IonNote v-for="d in companionResolution.deduped" :key="d.item_id" class="dedup-note">
        {{ t('wizard.companionDeduped', { name: d.name }) }}
      </IonNote>
    </template>

    <!-- FR-20.4: suggested companions, one tap each -->
    <template v-if="companionResolution.suggested.length > 0">
      <SectionHead :title="t('wizard.sectionSuggestedCompanions')" />
      <IonList>
        <IonItem
          v-for="s in companionResolution.suggested"
          :key="s.item_id"
          :data-testid="`wizard-companion-suggestion-${s.item_id}`"
        >
          <IonCheckbox
            slot="start"
            :checked="acceptedSuggestions.has(s.item_id)"
            @ionChange="(e: CustomEvent) => toggleSuggestion(s.item_id, e.detail.checked)"
          />
          <IonLabel>
            <h3>{{ s.name }}</h3>
            <p>{{ t('wizard.companionSuggestedWith', { name: s.via_item_name }) }}</p>
          </IonLabel>
          <IonNote slot="end">×{{ s.quantity }}</IonNote>
        </IonItem>
      </IonList>
    </template>

    <!-- FR-13.3: destination checklist offer from the series profile -->
    <template v-if="offeredChecklist.length > 0">
      <SectionHead :title="t('wizard.sectionChecklist')" />
      <IonItem lines="none">
        <IonCheckbox
          slot="start"
          :checked="includeChecklist"
          @ionChange="(e: CustomEvent) => (includeChecklist = e.detail.checked)"
        />
        <IonLabel>
          {{ t('wizard.checklistAdd', { n: offeredChecklist.length }) }}
        </IonLabel>
      </IonItem>
      <IonNote>{{ offeredChecklist.map((c) => c.label).join(', ') }}</IonNote>
    </template>
  </section>
</template>

<style scoped>
.review-row.dropped h3,
.review-row.dropped p {
  text-decoration: line-through;
  color: var(--ct-overlay0);
}

.mark {
  display: inline-block;
  margin-inline-start: 6px;
  padding: 1px 7px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
  vertical-align: 1px;
}

.qty-value {
  display: none;
}

.review-row.dropped .qty-value {
  display: inline;
  color: var(--ct-overlay0);
}

.row-action {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.empty-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-base);
  margin: 8px 0 16px;
}

.dedup-note {
  display: block;
  font-size: var(--jp-text-sm);
  margin: 4px 0;
}

.qty-input {
  max-width: 72px;
  text-align: right;
}

.history-hint {
  margin-top: 4px;
  padding: 2px 8px;
  border: 1px solid var(--ion-color-primary);
  border-radius: var(--jp-r-md);
  background: transparent;
  color: var(--ion-color-primary);
  font-size: var(--jp-text-xs);
  cursor: pointer;
}
</style>
