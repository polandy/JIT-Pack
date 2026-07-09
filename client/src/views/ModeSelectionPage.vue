<script setup lang="ts">
/**
 * M19 — First-Launch Mode Selection (Addendum 3.19, FR-19.1)
 *
 * One-time choice between Local Mode (everything on this device, no
 * server) and Server Mode (enter a server URL). The choice is
 * persisted and not silently switchable — leaving Local Mode later
 * goes through the explicit export/import migration path (FR-19.5).
 * Rendered by App.vue before the router, so nothing else exists yet.
 */
import {
  IonPage,
  IonContent,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonInput,
  IonIcon,
  IonNote,
} from '@ionic/vue'
import { phonePortraitOutline, serverOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

const emit = defineEmits<{
  select: [mode: 'local' | 'server', serverUrl: string | null]
}>()

const serverUrl = ref('')

const serverUrlValid = computed(() => {
  try {
    const url = new URL(serverUrl.value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
})
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <div class="mode-selection">
        <h1>Welcome to JIT-Pack</h1>
        <p class="intro">Where should your packing data live? This is a one-time choice per device.</p>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>
              <IonIcon :icon="phonePortraitOutline" />
              Local — just this device
            </IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <p>Everything stays in this browser/app. No server, no account. Sharing and multi-device sync are unavailable; regular exports are your backup.</p>
            <IonButton expand="block" @click="emit('select', 'local', null)">
              Use Local Mode
            </IonButton>
          </IonCardContent>
        </IonCard>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>
              <IonIcon :icon="serverOutline" />
              Server — sync &amp; collaborate
            </IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <p>Connect to a self-hosted JIT-Pack server for multi-device sync and shared trips.</p>
            <IonInput
              label="Server URL"
              label-placement="stacked"
              placeholder="https://jitpack.example.com"
              type="url"
              :value="serverUrl"
              @ionInput="(e: CustomEvent) => (serverUrl = e.detail.value ?? '')"
            />
            <IonNote v-if="serverUrl && !serverUrlValid" color="danger">
              Enter a full http(s) URL.
            </IonNote>
            <IonButton
              expand="block"
              fill="outline"
              :disabled="!serverUrlValid"
              @click="emit('select', 'server', serverUrl)"
            >
              Connect to server
            </IonButton>
          </IonCardContent>
        </IonCard>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.mode-selection {
  max-width: 480px;
  margin: 0 auto;
  padding-top: 32px;
}

.mode-selection h1 {
  font-size: 1.5rem;
  font-weight: 700;
}

.intro {
  color: var(--ion-color-medium);
  margin-bottom: 24px;
}

ion-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
}

ion-card-content p {
  margin-bottom: 12px;
}
</style>
