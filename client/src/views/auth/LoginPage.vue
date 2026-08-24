<script setup lang="ts">
/**
 * OIDC login (Sync-API §2): fetches the IdP endpoints from the server
 * (GET /auth/config, zero client config), generates PKCE material, and
 * redirects to the IdP. Servers without OIDC (Single-User, plain
 * HS256) answer 501 — no login is needed there.
 */
import { API } from '@/api/routes'
import type { AuthConfigResponse } from '@/api/types'
import { IonPage, IonContent, IonButton, IonIcon, IonNote } from '@ionic/vue'
import { logInOutline } from 'ionicons/icons'
import { onMounted, ref } from 'vue'

import { buildAuthorizeURL, challengeS256, generateVerifier } from '@/auth/pkce'
import { serverBaseUrl } from '@/config'
import { t } from '@/i18n'

const error = ref('')
const loginRequired = ref<boolean | null>(null)

onMounted(async () => {
  try {
    const resp = await fetch(`${serverBaseUrl()}${API.authConfig}`)
    loginRequired.value = resp.ok
  } catch {
    error.value = t('login.serverUnreachable')
    loginRequired.value = false
  }
})

async function signIn() {
  error.value = ''
  try {
    const resp = await fetch(`${serverBaseUrl()}${API.authConfig}`)
    if (!resp.ok) {
      error.value = t('login.noOidc')
      return
    }
    const config = (await resp.json()) as AuthConfigResponse

    const verifier = generateVerifier()
    const state = generateVerifier()
    sessionStorage.setItem('jitpack_pkce_verifier', verifier)
    sessionStorage.setItem('jitpack_pkce_state', state)

    window.location.href = buildAuthorizeURL({
      authorizeUrl: config.authorize_url,
      clientId: config.client_id,
      redirectUri: `${window.location.origin}/auth/callback`,
      challenge: await challengeS256(verifier),
      state,
    })
  } catch {
    error.value = t('login.startFailed')
  }
}
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <div class="login">
        <h1 class="jp-sheet-title">{{ t('login.title') }}</h1>
        <p v-if="loginRequired === false" class="hint">{{ t('login.notRequired') }}</p>
        <template v-else>
          <p class="hint">{{ t('login.hint') }}</p>
          <IonButton expand="block" @click="signIn">
            <IonIcon slot="start" :icon="logInOutline" />
            {{ t('login.action') }}
          </IonButton>
        </template>
        <IonNote v-if="error" color="danger">{{ error }}</IonNote>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.login {
  max-width: 400px;
  margin: 0 auto;
  padding-top: 64px;
}

.hint {
  color: var(--ion-color-medium);
  margin-bottom: 24px;
}
</style>
