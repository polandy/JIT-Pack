<script setup lang="ts">
/**
 * M3 — Trip Creation Wizard
 *
 * Four steps: metadata (FR-2.1/2.1a, attributes FR-15.1) → travelers
 * + sharing/roles (FR-2.5, FR-4.5/4.7) → template selection with live
 * dedup/exclusion preview (FR-2.2/2.3a/15.2) → quantity review.
 * "Create trip" commits the cascade through the orchestrator and opens
 * M4. The draft lives in component state until then — Cancel leaves no
 * residue.
 *
 * The sharing part of step 2 renders only with an OIDC session — in
 * Single-User and Local Mode there is no second account to share with
 * (FR-17.3/FR-19.3/G-8).
 *
 * Each step is a component under `wizard/`, each step's draft a composable
 * there; `useWizardCore` holds them together.
 *
 * The navigation is a footer pinned above the tab bar (G-16): a step's button
 * sits where the last one did, however long the step's content.
 */
import { IonPage, IonContent, IonFooter, IonButton, IonIcon } from '@ionic/vue'
import { chevronBackOutline } from 'ionicons/icons'

import { t } from '@/i18n'
import GroupPeekSheet from '@/components/templates/GroupPeekSheet.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { useWizardCore } from './wizard/useWizardCore'
import WizardMetadataStep from './wizard/WizardMetadataStep.vue'
import WizardTravelersStep from './wizard/WizardTravelersStep.vue'
import WizardCompositionStep from './wizard/WizardCompositionStep.vue'
import WizardReviewStep from './wizard/WizardReviewStep.vue'

const core = useWizardCore()
const { step, stepValid, next, back, creation, createTrip } = core
const { peekTemplateId } = core.composition
const { comingCount } = core.review

/** The head's name for each step, in step order. */
const STEP_NAME_KEYS = [
  'wizard.stepName1',
  'wizard.stepName2',
  'wizard.stepName3',
  'wizard.stepName4',
] as const

// ADR-050: the frame renders this page head, above the outlet.
setHeaderTitle(
  () => t('trips.new'),
  () =>
    t('wizard.step', {
      n: step.value,
      // `step` is clamped to 1–4 by `next`/`back`; the index cannot miss.
      name: t(STEP_NAME_KEYS[step.value - 1] ?? STEP_NAME_KEYS[0]),
    }),
)
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <WizardMetadataStep v-if="step === 1" :core="core" />
      <WizardTravelersStep v-if="step === 2" :core="core" />
      <WizardCompositionStep v-if="step === 3" :core="core" />
      <WizardReviewStep v-if="step === 4" :core="core" />

      <!-- FR-27.12: look inside a group without losing the draft -->
      <SheetModal :is-open="peekTemplateId !== null" @dismiss="peekTemplateId = null">
        <GroupPeekSheet
          v-if="peekTemplateId"
          :template-id="peekTemplateId"
          @close="peekTemplateId = null"
        />
      </SheetModal>
    </IonContent>
    <IonFooter class="wizard-nav" data-testid="wizard-footer">
      <IonButton
        class="back"
        data-testid="wizard-back"
        fill="outline"
        :disabled="step === 1"
        :aria-label="t('wizard.back')"
        @click="back"
      >
        <IonIcon slot="icon-only" :icon="chevronBackOutline" />
      </IonButton>
      <IonButton
        v-if="step < 4"
        class="forward"
        data-testid="wizard-next"
        :disabled="!stepValid"
        @click="next"
      >
        {{ t('wizard.next') }}
      </IonButton>
      <IonButton
        v-else
        class="forward"
        data-testid="wizard-create"
        :disabled="creation.submitted.value"
        @click="createTrip"
      >
        {{ t('wizard.createTrip', { n: comingCount }) }}
      </IonButton>
    </IonFooter>
  </IonPage>
</template>

<style scoped>
.wizard-nav {
  display: flex;
  gap: 10px;
  padding: 10px 16px 12px;
  background: var(--jp-surface-page);
  border-top: 1px solid var(--jp-surface-border);
}

.wizard-nav ion-button {
  margin: 0;
  height: 46px;
}

/* The back square: a known place, not a second label competing with the step's action. */
.wizard-nav .back {
  flex: 0 0 46px;
  --padding-start: 0;
  --padding-end: 0;
}

.wizard-nav .forward {
  flex: 1;
}
</style>
