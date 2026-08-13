<script setup lang="ts">
/**
 * The app's one header bar (G-9, ADR-011).
 *
 * There is exactly one; no screen supplies its own. The right-hand group
 * — sync indicator (G-2) and settings/avatar (G-1) — is unconditional,
 * which is what keeps the conflict log reachable from inside a trip.
 * The left slot switches: the logo on a tab root, `‹ back` plus the page
 * title everywhere else. Pages needing their own actions teleport them
 * into `#header-actions`.
 */
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  useIonRouter,
} from '@ionic/vue'
import { chevronBackOutline, settingsOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BrandMark from './BrandMark.vue'
import SyncIndicator from './SyncIndicator.vue'
import { backTarget } from '@/router/backTarget'
import { titleFor } from '@/composables/useHeaderTitle'
import type { SyncState } from '@/composables/useSyncStatus'

defineProps<{
  syncState: SyncState
  syncPendingCount: number
  syncLabel: string
}>()

const emit = defineEmits<{
  syncTap: []
}>()

const route = useRoute()
const ionRouter = useIonRouter()

const back = computed(() => backTarget(route))
const title = computed(() => titleFor(route.path) ?? route.meta.title ?? '')

function goHome() {
  ionRouter.navigate('/tabs/dashboard', 'back', 'replace')
}

/**
 * The declared parent, not history.back(): a deep link opened from a
 * notification has a one-entry stack, and §7's contract is that back
 * still lands on the parent trip rather than leaving the app.
 *
 * Direction 'back' animates backwards; the action stays the default
 * push. 'pop' would tell Ionic to unwind its own stack, and the parent
 * is frequently not the entry we arrived from — a deep-linked child has
 * no such entry at all — which left Ionic dereferencing an undefined
 * page mid-transition.
 */
function goBack() {
  if (back.value) ionRouter.navigate(back.value, 'back')
}
</script>

<template>
  <IonHeader>
    <IonToolbar>
      <IonButtons v-if="back" slot="start">
        <IonButton data-testid="header-back" aria-label="Back" @click="goBack">
          <IonIcon slot="icon-only" :icon="chevronBackOutline" />
        </IonButton>
      </IonButtons>

      <IonTitle v-if="back" data-testid="header-title" class="page-title">{{ title }}</IonTitle>
      <IonTitle v-else slot="start" class="app-logo" data-testid="header-logo" @click="goHome">
        <span class="logo-row">
          <BrandMark :size="22" />
          <span class="logo-wordmark">JIT<i class="logo-dot">·</i>Pack</span>
        </span>
      </IonTitle>

      <IonButtons slot="end">
        <!-- Pages teleport their own actions here (M4's G-12 cluster). -->
        <span id="header-actions" class="header-actions" />
        <SyncIndicator
          :state="syncState"
          :pending-count="syncPendingCount"
          :label="syncLabel"
          @tap="emit('syncTap')"
        />
        <IonButton router-link="/tabs/settings" aria-label="Settings">
          <IonIcon slot="icon-only" :icon="settingsOutline" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
</template>

<style scoped>
.app-logo {
  cursor: pointer;
}

.page-title {
  padding-inline-start: 0;
}

.header-actions {
  display: contents;
}

.logo-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  vertical-align: middle;
}

.logo-wordmark {
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: -0.02em;
  display: none;
}

.logo-dot {
  font-style: normal;
  color: var(--ion-color-primary);
}

/* G-9: mark only on mobile, mark + wordmark on desktop */
@media (min-width: 900px) {
  .logo-wordmark {
    display: inline;
  }
}
</style>
