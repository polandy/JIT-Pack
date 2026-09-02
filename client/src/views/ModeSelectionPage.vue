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
import BrandMark from '@/components/global/BrandMark.vue'
import { defaultServerBaseUrl } from '@/config'
import { isValidServerUrl } from '@/mode'
import { t } from '@/i18n'

const emit = defineEmits<{
  select: [mode: 'local' | 'server', serverUrl: string | null]
}>()

// Pre-filled rather than merely placeheld — see defaultServerBaseUrl().
const serverUrl = ref(defaultServerBaseUrl())

const serverUrlValid = computed(() => isValidServerUrl(serverUrl.value))
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <div class="mode-selection" data-testid="mode-selection">
        <BrandMark :size="56" class="welcome-mark" />
        <h1 class="jp-sheet-title">{{ t('firstRun.welcome') }}</h1>
        <p class="intro">{{ t('firstRun.intro') }}</p>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>
              <IonIcon :icon="phonePortraitOutline" />
              {{ t('firstRun.localTitle') }}
            </IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <p>{{ t('firstRun.localBody') }}</p>
            <IonButton
              expand="block"
              data-testid="mode-local"
              @click="emit('select', 'local', null)"
            >
              {{ t('firstRun.localAction') }}
            </IonButton>
          </IonCardContent>
        </IonCard>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>
              <IonIcon :icon="serverOutline" />
              {{ t('firstRun.serverTitle') }}
            </IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <p>{{ t('firstRun.serverBody') }}</p>
            <IonInput
              :label="t('firstRun.serverUrl')"
              label-placement="stacked"
              placeholder="https://jitpack.example.com"
              type="url"
              data-testid="mode-server-url"
              :value="serverUrl"
              @ionInput="(e: CustomEvent) => (serverUrl = e.detail.value ?? '')"
            />
            <IonNote v-if="serverUrl && !serverUrlValid" color="danger">
              {{ t('firstRun.serverUrlInvalid') }}
            </IonNote>
            <IonButton
              expand="block"
              fill="outline"
              data-testid="mode-server-connect"
              :disabled="!serverUrlValid"
              @click="emit('select', 'server', serverUrl)"
            >
              {{ t('firstRun.serverAction') }}
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

.welcome-mark {
  margin-bottom: 12px;
}

.intro {
  color: var(--ion-color-medium);
  margin-bottom: 24px;
}

ion-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--jp-text-lg);
}

ion-card-content p {
  margin-bottom: 12px;
}
</style>
