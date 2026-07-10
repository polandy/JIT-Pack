<script setup lang="ts">
/**
 * OIDC login (Sync-API §2): fetches the IdP endpoints from the server
 * (GET /auth/config, zero client config), generates PKCE material, and
 * redirects to the IdP. Servers without OIDC (Single-User, plain
 * HS256) answer 501 — no login is needed there.
 */
import { IonPage, IonContent, IonButton, IonIcon, IonNote } from '@ionic/vue'
import { logInOutline } from 'ionicons/icons'
import { onMounted, ref } from 'vue'

import { buildAuthorizeURL, challengeS256, generateVerifier } from '@/auth/pkce'
import { serverBaseUrl } from '@/config'

const error = ref('')
const loginRequired = ref<boolean | null>(null)

onMounted(async () => {
  try {
    const resp = await fetch(`${serverBaseUrl()}/api/v1/auth/config`)
    loginRequired.value = resp.ok
  } catch {
    error.value = 'Server unreachable'
    loginRequired.value = false
  }
})

async function signIn() {
  error.value = ''
  try {
    const resp = await fetch(`${serverBaseUrl()}/api/v1/auth/config`)
    if (!resp.ok) {
      error.value = 'This server does not offer OIDC login'
      return
    }
    const config = (await resp.json()) as { authorize_url: string; client_id: string }

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
    error.value = 'Could not start the login flow'
  }
}
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <div class="login">
        <h1>Sign in</h1>
        <p v-if="loginRequired === false" class="hint">
          This server does not require a login — you can head back to the app.
        </p>
        <template v-else>
          <p class="hint">
            Your identity provider handles the login; JIT-Pack never sees your password.
          </p>
          <IonButton expand="block" @click="signIn">
            <IonIcon slot="start" :icon="logInOutline" />
            Sign in with SSO
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

.login h1 {
  font-size: 1.5rem;
  font-weight: 700;
}

.hint {
  color: var(--ion-color-medium);
  margin-bottom: 24px;
}
</style>
