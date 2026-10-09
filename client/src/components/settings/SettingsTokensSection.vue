<script setup lang="ts">
/**
 * M17's API tokens section (FR-23.7, ADR-039). The page mounts it only with
 * a session: Single-User Mode bypasses authentication and Local Mode has no
 * server, so in both a token would prove nothing (G-8).
 *
 * The minted token lives in component state and is dropped when the sheet
 * closes. It is never written to a store or to localStorage: nothing about a
 * token is persisted anywhere, which is the whole of ADR-039.
 */
import { API_TOKEN_EXPIRY } from '@/api/types'
import type { APITokenExpiry } from '@/api/types'
import {
  IonButton,
  IonList,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonNote,
} from '@ionic/vue'
import { computed, ref } from 'vue'
import { t } from '@/i18n'
import ApiTokenSheet from '@/components/settings/ApiTokenSheet.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'

const orchestrator = useOrchestrator()

const tokenName = ref('')
const tokenExpiry = ref<APITokenExpiry>(API_TOKEN_EXPIRY['90d'])
const tokenPending = ref(false)
const tokenFailed = ref(false)
const mintedToken = ref('')
const mintedExpiresAt = ref('')
const tokenSheetOpen = ref(false)

/**
 * The lifetimes, built as a computed rather than a module constant:
 * finished text in a module-level constant is unreachable by a language
 * switch, which is the trap M17 closed once already.
 */
const tokenExpiryOptions = computed(() => [
  { value: API_TOKEN_EXPIRY['1h'], label: t('settings.tokenExpiry1h') },
  { value: API_TOKEN_EXPIRY['1d'], label: t('settings.tokenExpiry1d') },
  { value: API_TOKEN_EXPIRY['7d'], label: t('settings.tokenExpiry7d') },
  { value: API_TOKEN_EXPIRY['30d'], label: t('settings.tokenExpiry30d') },
  { value: API_TOKEN_EXPIRY['90d'], label: t('settings.tokenExpiry90d') },
  { value: API_TOKEN_EXPIRY['365d'], label: t('settings.tokenExpiry365d') },
  { value: API_TOKEN_EXPIRY.never, label: t('settings.tokenExpiryNever') },
])

async function createToken() {
  tokenPending.value = true
  tokenFailed.value = false
  try {
    const out = await orchestrator.identity.createAPIToken(
      tokenName.value.trim(),
      tokenExpiry.value,
    )
    if (!out) {
      tokenFailed.value = true
      return
    }
    mintedToken.value = out.token
    mintedExpiresAt.value = out.expires_at
    tokenSheetOpen.value = true
    tokenName.value = ''
  } catch {
    // Offline, or the server refused it — the sentence is the same either
    // way, because neither is something the person can act on differently.
    tokenFailed.value = true
  } finally {
    tokenPending.value = false
  }
}

/** Closing the reveal is what ends the token's only readable moment. */
function closeTokenSheet() {
  tokenSheetOpen.value = false
  mintedToken.value = ''
  mintedExpiresAt.value = ''
}
</script>

<template>
  <SectionHead :title="t('settings.apiTokens')" data-testid="settings-section-tokens" />
  <p class="section-hint">{{ t('settings.apiTokensHint') }}</p>
  <IonList>
    <IonItem lines="none">
      <IonInput
        :label="t('settings.tokenName')"
        label-placement="stacked"
        data-testid="token-name"
        :value="tokenName"
        :placeholder="t('settings.tokenNamePlaceholder')"
        :maxlength="60"
        @ionInput="(e: CustomEvent) => (tokenName = e.detail.value ?? '')"
      />
    </IonItem>
    <IonItem lines="none">
      <IonSelect
        :label="t('settings.tokenExpiry')"
        data-testid="token-expiry"
        interface="popover"
        :value="tokenExpiry"
        @ionChange="(e: CustomEvent) => (tokenExpiry = e.detail.value)"
      >
        <IonSelectOption v-for="opt in tokenExpiryOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </IonSelectOption>
      </IonSelect>
    </IonItem>
    <IonItem lines="none">
      <IonButton
        slot="end"
        size="small"
        data-testid="token-create"
        :disabled="!tokenName.trim() || tokenPending"
        @click="createToken"
      >
        {{ t('settings.tokenCreate') }}
      </IonButton>
    </IonItem>
    <IonItem v-if="tokenFailed" lines="none">
      <IonNote data-testid="token-failed">{{ t('settings.tokenFailed') }}</IonNote>
    </IonItem>
  </IonList>
  <ApiTokenSheet
    :open="tokenSheetOpen"
    :token="mintedToken"
    :expires-at="mintedExpiresAt"
    @close="closeTokenSheet"
  />
</template>

<style scoped>
.section-hint {
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
  margin: 0 0 8px;
}
</style>
