<script setup lang="ts">
/**
 * M3 step 2 — the travelers (FR-2.5/2.5a, FR-1.9) and, with an OIDC session
 * only, sharing and roles (FR-4.5/4.7, G-8).
 */
import {
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonNote,
} from '@ionic/vue'
import { addOutline, closeOutline, peopleOutline, personOutline } from 'ionicons/icons'

import SectionHead from '@/components/global/SectionHead.vue'
import { t } from '@/i18n'
import type { WizardCore } from './useWizardCore'
import { NO_ACCOUNT } from './useWizardTravelers'

const { core } = defineProps<{ core: WizardCore }>()

const { stepDefaultAction } = core
const {
  travelers,
  addTraveler,
  removeTraveler,
  addAccountTraveler,
  setTravelerRole,
  isMe,
  collaborative,
  shares,
  shareCandidates,
  travelerAccountCandidates,
  addShare,
  setShareRole,
  removeShare,
  shareName,
  linkableFor,
} = core.roster
</script>

<template>
  <section data-testid="wizard-step-2">
    <SectionHead :title="t('wizard.sectionTravelers')" />
    <IonList v-if="travelers.length > 0">
      <IonItem v-for="(traveler, index) in travelers" :key="index">
        <IonIcon slot="start" :icon="traveler.member ? peopleOutline : personOutline" />
        <IonInput
          data-testid="wizard-traveler-name"
          :placeholder="t('wizard.travelerNamePlaceholder')"
          :value="traveler.name"
          @keydown.enter="stepDefaultAction"
          @ionInput="(e: CustomEvent) => (traveler.name = e.detail.value ?? '')"
        />
        <IonSelect
          v-if="traveler.member && !isMe(traveler.linkedUserId)"
          slot="end"
          data-testid="wizard-traveler-role"
          interface="popover"
          :aria-label="t('role.label')"
          :value="traveler.role"
          @ionChange="(e: CustomEvent) => setTravelerRole(index, e.detail.value)"
        >
          <IonSelectOption value="editor">{{ t('role.editor') }}</IonSelectOption>
          <IonSelectOption value="admin">{{ t('role.admin') }}</IonSelectOption>
        </IonSelect>
        <IonSelect
          v-else-if="!traveler.member && linkableFor(index).length > 0"
          slot="end"
          class="link"
          interface="popover"
          :aria-label="t('wizard.travelerAccountOf', { name: traveler.name })"
          :value="traveler.linkedUserId"
          data-testid="wizard-traveler-account"
          @ionChange="(e: CustomEvent) => (traveler.linkedUserId = String(e.detail.value))"
        >
          <IonSelectOption :value="NO_ACCOUNT">{{ t('wizard.travelerNoAccount') }}</IonSelectOption>
          <IonSelectOption v-for="a in linkableFor(index)" :key="a.userId" :value="a.userId">
            {{ a.name }}
          </IonSelectOption>
        </IonSelect>
        <IonButton
          slot="end"
          fill="clear"
          color="medium"
          data-testid="wizard-traveler-remove"
          :aria-label="t('wizard.travelerRemove')"
          @click="removeTraveler(index)"
        >
          <IonIcon slot="icon-only" :icon="closeOutline" />
        </IonButton>
      </IonItem>
    </IonList>
    <div v-else class="empty-hint">{{ t('wizard.travelersEmpty') }}</div>
    <IonButton data-testid="wizard-add-traveler" fill="outline" size="small" @click="addTraveler">
      <IonIcon slot="start" :icon="addOutline" />
      {{ t('wizard.addTraveler') }}
    </IonButton>
    <!-- An existing account as traveler — sessions with accounts only (G-8) -->
    <IonItem v-if="collaborative && travelerAccountCandidates.length > 0" lines="none">
      <IonSelect
        data-testid="wizard-add-account-traveler"
        interface="popover"
        :placeholder="t('wizard.addAccountTraveler')"
        :aria-label="t('wizard.addAccountTravelerLabel')"
        :value="null"
        @ionChange="(e: CustomEvent) => addAccountTraveler(e.detail.value)"
      >
        <IonSelectOption v-for="u in travelerAccountCandidates" :key="u.user_id" :value="u.user_id">
          {{ u.display_name }}
        </IonSelectOption>
      </IonSelect>
    </IonItem>

    <!-- Sharing & roles (FR-4.5/4.7) — OIDC sessions only (G-8) -->
    <template v-if="collaborative">
      <SectionHead :title="t('wizard.sectionShare')" />
      <IonList v-if="shares.length > 0">
        <IonItem
          v-for="(share, index) in shares"
          :key="share.userId"
          :data-testid="`wizard-share-${share.userId}`"
        >
          <IonLabel>{{ shareName(share.userId) }}</IonLabel>
          <IonSelect
            interface="popover"
            :aria-label="t('role.label')"
            :value="share.role"
            @ionChange="(e: CustomEvent) => setShareRole(index, e.detail.value)"
          >
            <IonSelectOption value="editor">{{ t('role.editor') }}</IonSelectOption>
            <IonSelectOption value="admin">{{ t('role.admin') }}</IonSelectOption>
          </IonSelect>
          <IonButton
            slot="end"
            fill="clear"
            color="medium"
            :aria-label="t('wizard.shareRemove')"
            @click="removeShare(index)"
          >
            <IonIcon slot="icon-only" :icon="closeOutline" />
          </IonButton>
        </IonItem>
      </IonList>
      <IonItem v-if="shareCandidates.length > 0" lines="none">
        <IonSelect
          data-testid="wizard-share-add"
          interface="popover"
          :placeholder="t('wizard.shareAdd')"
          :aria-label="t('wizard.shareAddLabel')"
          :value="null"
          @ionChange="(e: CustomEvent) => addShare(e.detail.value)"
        >
          <IonSelectOption v-for="u in shareCandidates" :key="u.user_id" :value="u.user_id">
            {{ u.display_name }}
          </IonSelectOption>
        </IonSelect>
      </IonItem>
      <IonNote v-else-if="shares.length === 0" class="empty-hint">
        {{ t('wizard.shareEmpty') }}
      </IonNote>
      <IonNote class="share-note">{{ t('wizard.shareNote') }}</IonNote>
    </template>
  </section>
</template>

<style scoped>
/* Bounded, so a long display name cannot squeeze the name field out. */
.link {
  max-width: 40%;
}

.empty-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-base);
  margin: 8px 0 16px;
}

.share-note {
  display: block;
  font-size: var(--jp-text-sm);
  margin: 8px 0 16px;
}
</style>
