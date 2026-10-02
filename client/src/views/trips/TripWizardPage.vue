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
 */
import { IonPage, IonContent, IonButton } from '@ionic/vue'

import { t } from '@/i18n'
import GroupPeekSheet from '@/components/templates/GroupPeekSheet.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useWizardCore } from './wizard/useWizardCore'
import WizardMetadataStep from './wizard/WizardMetadataStep.vue'
import WizardTravelersStep from './wizard/WizardTravelersStep.vue'
import WizardCompositionStep from './wizard/WizardCompositionStep.vue'
import WizardReviewStep from './wizard/WizardReviewStep.vue'

const core = useWizardCore()
const { step, stepValid, next, back, creation, createTrip } = core
const { peekTemplateId } = core.composition
const { comingCount } = core.review

// ADR-050: the frame renders this page head, above the outlet.
setHeaderTitle(
  () => t('trips.new'),
  () => t('wizard.step', { n: step.value }),
)
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <WizardMetadataStep v-if="step === 1" :core="core" />
      <WizardTravelersStep v-if="step === 2" :core="core" />
      <WizardCompositionStep v-if="step === 3" :core="core" />
      <WizardReviewStep v-if="step === 4" :core="core" />

      <!-- Wizard navigation -->
      <div class="wizard-nav">
        <IonButton v-if="step > 1" data-testid="wizard-back" fill="outline" @click="back">
          {{ t('wizard.back') }}
        </IonButton>
        <IonButton v-if="step < 4" data-testid="wizard-next" :disabled="!stepValid" @click="next">
          {{ t('wizard.next') }}
        </IonButton>
        <IonButton
          v-if="step === 4"
          data-testid="wizard-create"
          color="primary"
          :disabled="creation.submitted.value"
          @click="createTrip"
        >
          {{ t('wizard.createTrip', { n: comingCount }) }}
        </IonButton>
      </div>
      <!-- FR-27.12: look inside a group without losing the draft -->
      <SheetModal :is-open="peekTemplateId !== null" @dismiss="peekTemplateId = null">
        <GroupPeekSheet
          v-if="peekTemplateId"
          :template-id="peekTemplateId"
          @close="peekTemplateId = null"
        />
      </SheetModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.wizard-nav {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>
