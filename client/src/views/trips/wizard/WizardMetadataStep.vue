<script setup lang="ts">
/**
 * M3 step 1 — the trip's metadata (FR-2.1/2.1a/15.1): the two required fields,
 * the dates open beside them, and everything else optional folded behind one
 * row (FR-2.1c).
 */
import { IonList, IonItem, IonInput, IonSelect, IonSelectOption, IonIcon } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'

import DateRangeField from '@/components/global/DateRangeField.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import SeriesPicker from '@/components/trips/SeriesPicker.vue'
import { t } from '@/i18n'
import type { WizardCore } from './useWizardCore'

const { core } = defineProps<{ core: WizardCore }>()

const { stepDefaultAction } = core
const {
  name,
  yearChoices,
  year,
  moreOpen,
  startDate,
  endDate,
  onDates,
  season,
  transportMode,
  accommodation,
  tagsInput,
  seriesChoice,
  newSeriesName,
  pickSeries,
  optionalSummary,
  seriesTaken,
} = core.metadata
</script>

<template>
  <section data-testid="wizard-step-1">
    <SectionHead :title="t('wizard.sectionTrip')" />
    <IonList>
      <IonItem>
        <IonInput
          data-testid="wizard-name"
          :label="t('wizard.name')"
          label-placement="stacked"
          :placeholder="t('wizard.namePlaceholder')"
          :value="name"
          @keydown.enter="stepDefaultAction"
          @ionInput="(e: CustomEvent) => (name = e.detail.value ?? '')"
        />
      </IonItem>
      <IonItem>
        <IonSelect
          data-testid="wizard-year"
          :label="t('wizard.year')"
          label-placement="stacked"
          interface="popover"
          :value="year"
          @ionChange="(e: CustomEvent) => (year = Number(e.detail.value))"
        >
          <IonSelectOption v-for="option in yearChoices" :key="option" :value="option">
            {{ option }}
          </IonSelectOption>
        </IonSelect>
      </IonItem>
      <!-- FR-2.1c: optional, but not rare — open, and saying why it is worth
           the tap, without becoming a gate (FR-2.1b). -->
      <IonItem>
        <div class="dates">
          <DateRangeField
            testid="wizard-dates"
            :label="t('wizard.dates')"
            :start-label="t('tripEdit.startDate')"
            :end-label="t('tripEdit.endDate')"
            :start="startDate"
            :end="endDate"
            @update="onDates"
          />
          <p class="dates-hint" data-testid="wizard-dates-hint">{{ t('wizard.datesHint') }}</p>
        </div>
      </IonItem>
    </IonList>

    <!-- FR-2.1c: everything optional behind one row, which states what
         is set behind it — a folded option nobody can see is one
         nobody remembers setting. -->
    <button
      class="more-row"
      :class="{ open: moreOpen }"
      data-testid="wizard-more"
      @click="moreOpen = !moreOpen"
    >
      <IonIcon :icon="chevronForwardOutline" class="caret" />
      <span class="more-label">{{ t('wizard.moreOptions') }}</span>
      <span class="more-summary" data-testid="wizard-more-summary">
        {{ optionalSummary || t('wizard.moreSummaryEmpty') }}
      </span>
    </button>

    <template v-if="moreOpen">
      <SeriesPicker
        testid="wizard-series"
        :choice="seriesChoice"
        :new-name="newSeriesName"
        :taken="seriesTaken"
        @pick="pickSeries"
        @name="(value) => (newSeriesName = value)"
        @enter="stepDefaultAction"
      />
      <SectionHead :title="t('wizard.sectionAttributes')" />
      <IonList>
        <IonItem>
          <IonSelect
            :label="t('wizard.season')"
            interface="popover"
            :value="season"
            @ionChange="(e: CustomEvent) => (season = e.detail.value)"
          >
            <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
            <IonSelectOption value="summer">{{ t('season.summer') }}</IonSelectOption>
            <IonSelectOption value="winter">{{ t('season.winter') }}</IonSelectOption>
            <IonSelectOption value="transitional">{{ t('season.transitional') }}</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem>
          <IonSelect
            :label="t('wizard.transport')"
            interface="popover"
            :value="transportMode"
            @ionChange="(e: CustomEvent) => (transportMode = e.detail.value)"
          >
            <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
            <IonSelectOption value="car">{{ t('transport.car') }}</IonSelectOption>
            <IonSelectOption value="bike">{{ t('transport.bike') }}</IonSelectOption>
            <IonSelectOption value="plane">{{ t('transport.plane') }}</IonSelectOption>
            <IonSelectOption value="train">{{ t('transport.train') }}</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem>
          <IonSelect
            :label="t('wizard.accommodation')"
            interface="popover"
            :value="accommodation"
            @ionChange="(e: CustomEvent) => (accommodation = e.detail.value)"
          >
            <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
            <IonSelectOption value="hotel">{{ t('accommodation.hotel') }}</IonSelectOption>
            <IonSelectOption value="holiday_flat">{{
              t('accommodation.holiday_flat')
            }}</IonSelectOption>
            <IonSelectOption value="camping">{{ t('accommodation.camping') }}</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem>
          <IonInput
            :label="t('wizard.tags')"
            label-placement="stacked"
            :placeholder="t('wizard.tagsPlaceholder')"
            :value="tagsInput"
            @keydown.enter="stepDefaultAction"
            @ionInput="(e: CustomEvent) => (tagsInput = e.detail.value ?? '')"
          />
        </IonItem>
      </IonList>
    </template>
  </section>
</template>

<style scoped>
/* FR-2.1c: one row standing in for every optional field. */
.more-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 14px 4px;
  margin-top: 4px;
  background: none;
  border: none;
  border-top: 1px solid var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  text-align: start;
  cursor: pointer;
}

.more-row .caret {
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-xs);
  transition: transform 0.18s ease;
}

.more-row.open .caret {
  transform: rotate(90deg);
}

.more-label {
  flex: none;
}

.more-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: end;
  font-weight: var(--jp-weight-medium);
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.dates {
  width: 100%;
}

.dates-hint {
  margin: 0 0 10px;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}
</style>
