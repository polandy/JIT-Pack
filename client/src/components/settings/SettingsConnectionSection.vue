<script setup lang="ts">
/**
 * M17's Connection section (FR-19.9): the two ways off a device that cannot
 * talk to its instance — end the session, or forget the connection
 * altogether and be asked again. The page mounts it in Server Mode only
 * (G-8): Local Mode has no connection, and resetting the one thing M19
 * decided is not a Local Mode question.
 */
import { IonButton, IonList, IonItem, IonLabel } from '@ionic/vue'
import { endSession } from '@/auth/refresh'
import { loadTokens } from '@/auth/tokens'
import { resetConnection } from '@/mode'
import { serverBaseUrl } from '@/config'
import { confirmAction, confirmDestructive } from '@/composables/shared/confirm'
import { t } from '@/i18n'
import SectionHead from '@/components/global/SectionHead.vue'

/** Which instance this device is pointed at — the stored URL wins (`config.ts`). */
const serverUrl = serverBaseUrl()

/**
 * Only an OIDC session can be logged out of. Single-User Mode has no session
 * to end, so the action would be a button that does nothing (G-8).
 */
const canLogOut = !!loadTokens()

/** FR-19.9: end the session; the app shell takes the device back to M16. */
async function logOut() {
  const ok = await confirmAction({
    header: t('settings.logoutConfirmTitle'),
    message: t('settings.logoutConfirmBody'),
    confirmLabel: t('settings.logout'),
    testid: 'settings-logout-confirm',
  })
  if (ok) endSession()
}

/**
 * FR-19.9: forget the session, the mode and the server URL, then reload into
 * M19. Destructive in wording because it throws away a choice, not data —
 * which is exactly what the confirmation has to say.
 */
async function forgetConnection() {
  const ok = await confirmDestructive({
    header: t('settings.resetConnectionConfirmTitle'),
    message: t('settings.resetConnectionConfirmBody'),
    confirmLabel: t('settings.resetConnection'),
    testid: 'settings-reset-connection-confirm',
  })
  if (ok) resetConnection()
}
</script>

<template>
  <SectionHead :title="t('settings.connection')" data-testid="settings-section-connection" />
  <IonList>
    <IonItem lines="none">
      <IonLabel>
        <h3>{{ t('settings.connectionServer') }}</h3>
        <p class="diagnostic" data-testid="settings-server-url">{{ serverUrl }}</p>
      </IonLabel>
    </IonItem>
    <IonItem v-if="canLogOut" lines="none">
      <IonLabel>
        <h3>{{ t('settings.logout') }}</h3>
        <p>{{ t('settings.logoutHint') }}</p>
      </IonLabel>
      <IonButton slot="end" size="small" data-testid="settings-logout" @click="logOut">
        {{ t('settings.logout') }}
      </IonButton>
    </IonItem>
    <IonItem lines="none">
      <IonLabel>
        <h3>{{ t('settings.resetConnection') }}</h3>
        <p>{{ t('settings.resetConnectionHint') }}</p>
      </IonLabel>
      <IonButton
        slot="end"
        size="small"
        color="warning"
        data-testid="settings-reset-connection"
        @click="forgetConnection"
      >
        {{ t('settings.resetConnection') }}
      </IonButton>
    </IonItem>
  </IonList>
</template>

<style scoped>
.diagnostic {
  /* A URL is read out or copied from this line, never wrapped by hand. */
  overflow-wrap: anywhere;
}
</style>
