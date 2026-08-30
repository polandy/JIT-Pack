<script setup lang="ts">
/**
 * OIDC redirect target (Sync-API §2): validates the state, exchanges
 * the code + PKCE verifier at the server broker, persists the token
 * set, and enters the app.
 */
import { API } from '@/api/routes'
import { ERROR_CODE, type APIError, type SessionTokens } from '@/api/types'
import { IonPage, IonContent, IonSpinner, IonButton } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { saveTokens } from '@/auth/tokens'
import { serverBaseUrl } from '@/config'
import { t } from '@/i18n'

const router = useRouter()
const error = ref('')

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const expectedState = sessionStorage.getItem('jitpack_pkce_state')
  const verifier = sessionStorage.getItem('jitpack_pkce_verifier')
  sessionStorage.removeItem('jitpack_pkce_state')
  sessionStorage.removeItem('jitpack_pkce_verifier')

  if (!code || !verifier || !state || state !== expectedState) {
    error.value = t('login.interrupted')
    return
  }

  try {
    const resp = await fetch(`${serverBaseUrl()}${API.authToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        redirect_uri: `${window.location.origin}/auth/callback`,
      }),
    })
    if (!resp.ok) {
      // FR-23.3: a deactivated account is refused at the broker rather than
      // handed tokens every endpoint would 403 anyway — and it is the one
      // refusal the person can do nothing about by trying again, so it is
      // named. Anything else stays the generic sentence: the exchange fails
      // for reasons (an expired code, a replayed one) that say nothing
      // about the account and would only mislead if they did.
      const body = (await resp.json().catch(() => null)) as APIError | null
      error.value =
        body?.error?.code === ERROR_CODE.account_deactivated
          ? t('login.deactivated')
          : t('login.rejected')
      return
    }
    saveTokens((await resp.json()) as SessionTokens)
    // Full reload so the orchestrator starts with the token in place.
    window.location.replace('/tabs/dashboard')
  } catch {
    error.value = t('login.failed')
  }
})
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <div class="callback">
        <template v-if="!error">
          <IonSpinner />
          <p>{{ t('login.completing') }}</p>
        </template>
        <template v-else>
          <p data-testid="login-error">{{ error }}</p>
          <IonButton @click="router.replace('/login')">{{ t('login.backToLogin') }}</IonButton>
        </template>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.callback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 96px;
  color: var(--ion-color-medium);
}
</style>
