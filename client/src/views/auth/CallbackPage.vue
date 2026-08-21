<script setup lang="ts">
/**
 * OIDC redirect target (Sync-API §2): validates the state, exchanges
 * the code + PKCE verifier at the server broker, persists the token
 * set, and enters the app.
 */
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
    const resp = await fetch(`${serverBaseUrl()}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        redirect_uri: `${window.location.origin}/auth/callback`,
      }),
    })
    if (!resp.ok) {
      error.value = t('login.rejected')
      return
    }
    saveTokens(await resp.json())
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
          <p>{{ error }}</p>
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
