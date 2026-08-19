<script setup lang="ts">
/**
 * The app's one header bar (G-9, ADR-011).
 *
 * There is exactly one; no screen supplies its own. The right-hand group
 * — sync indicator (G-2) and settings/avatar (G-1) — is unconditional,
 * which is what keeps the conflict log reachable from inside a trip.
 * The left slot switches: the logo on a tab root, `‹ back` plus the page
 * title everywhere else — and on a screen that registers no title, the
 * chevron alone. M4 is that screen deliberately; the why is at its own
 * `tripName` (UI-Spec M4).
 */
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonBadge,
  IonIcon,
  useIonRouter,
} from '@ionic/vue'
import { chevronBackOutline, settingsOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BrandMark from './BrandMark.vue'
import SyncIndicator from './SyncIndicator.vue'
import { backTarget } from '@/router/backTarget'
import { actionsFor } from '@/composables/useHeaderActions'
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

// G-12: the current page's icon cluster, described by the page rather
// than teleported into this toolbar — see useHeaderActions.
const pageActions = computed(() => actionsFor(route.path))

function goHome() {
  ionRouter.navigate('/tabs/dashboard', 'back', 'replace')
}

/**
 * The declared parent, not history.back(): a deep link opened from a
 * notification has a one-entry stack, and §7's contract is that back
 * still lands on the parent trip rather than leaving the app.
 *
 * Direction 'back' animates backwards, and the action is **replace**.
 * 'pop' would tell Ionic to unwind its own stack, and the declared
 * parent is frequently not the entry we arrived from — a deep-linked
 * child has no such entry at all. The default push is worse still: it
 * leaves the page we came from mounted *and* mounts a second copy of the
 * parent, so the route ends up with two live instances. The stale one
 * kept winning the header's action registry, which is how the trip
 * list's search field ended up rendered on a page nobody could see.
 */
function goBack() {
  if (back.value) ionRouter.navigate(back.value, 'back', 'replace')
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

      <!-- No element at all rather than an empty one: an empty ion-title
           still claims the slot's padding. -->
      <IonTitle v-if="back && title" data-testid="header-title" class="page-title">
        {{ title }}
      </IonTitle>
      <IonTitle v-else-if="!back" slot="start" class="app-logo" data-testid="header-logo" @click="goHome">
        <span class="logo-row">
          <BrandMark :size="22" />
          <span class="logo-wordmark">JIT<i class="logo-dot">·</i>Pack</span>
        </span>
      </IonTitle>

      <IonButtons slot="end">
        <!-- The current page's G-12 cluster (useHeaderActions). -->
        <IonButton
          v-for="action in pageActions"
          :key="action.id"
          :data-testid="action.id"
          :aria-label="action.label"
          :title="action.label"
          :color="action.active ? 'primary' : undefined"
          @click="action.onClick"
        >
          <IonIcon slot="icon-only" :icon="action.icon" />
          <IonBadge v-if="action.badge" color="primary" class="action-badge">
            {{ action.badge }}
          </IonBadge>
        </IonButton>
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

.action-badge {
  position: absolute;
  top: 2px;
  right: 0;
  font-size: var(--jp-text-3xs);
  padding: 2px 4px;
}

.logo-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  vertical-align: middle;
}

/* The wordmark is a lockup, not a title: it keeps the UI face while the
   surrounding ion-title rule (G-13) sets display type for page titles. */
.logo-wordmark {
  font-family: var(--jp-font-ui);
  font-weight: var(--jp-weight-bold);
  font-size: var(--jp-text-lg);
  letter-spacing: var(--jp-tracking-tight);
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
