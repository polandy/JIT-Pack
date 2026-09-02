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
  actionSheetController,
  useIonRouter,
} from '@ionic/vue'
import { chevronBackOutline, ellipsisVerticalOutline, settingsOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BrandMark from './BrandMark.vue'
import SyncIndicator from './SyncIndicator.vue'
import { backTarget } from '@/router/backTarget'
import { actionsFor } from '@/composables/useHeaderActions'
import { titleFor } from '@/composables/useHeaderTitle'
import { t } from '@/i18n'
import type { SyncState } from '@/composables/useSyncStatus'
import { PATH } from '@/router/paths'

withDefaults(
  defineProps<{
    syncState: SyncState
    syncPendingCount: number
    syncLabel: string
    /** NFR-4.13: a newer build waits — shown as a dot on the G-2 glyph. */
    syncUpdateReady?: boolean
  }>(),
  { syncUpdateReady: false },
)

const emit = defineEmits<{
  syncTap: []
}>()

const route = useRoute()
const ionRouter = useIonRouter()

const back = computed(() => backTarget(route))
const title = computed(
  () => titleFor(route.path) ?? (route.meta.titleKey ? t(route.meta.titleKey) : ''),
)

// G-12: the current page's icon cluster, described by the page rather
// than teleported into this toolbar — see useHeaderActions.
const pageActions = computed(() => actionsFor(route.path).filter((a) => !a.overflow))

// The ones the page put behind the ⋮ (UX-13). An action sheet rather than a
// popover: it is the menu shape the rest of the app already uses (M2's and
// M7's row menus), and it renders each entry as a *word*, which is what the
// bar could not do for them.
const overflowActions = computed(() => actionsFor(route.path).filter((a) => a.overflow))

async function openOverflow() {
  // Held in a box: assigned only inside a callback, so TypeScript's flow
  // analysis would narrow a plain `let` back to `null` at the call below.
  const chosen: { run: (() => void) | null } = { run: null }
  const sheet = await actionSheetController.create({
    buttons: [
      ...overflowActions.value.map((action) => ({
        text: action.label,
        icon: action.icon,
        handler: () => {
          chosen.run = action.onClick
        },
      })),
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
  /*
   * The action runs *after* the sheet is gone, not inside its handler.
   * While an overlay is up Ionic marks the router outlet `aria-hidden` and
   * clears it on dismissal; a handler that navigates races that teardown
   * and the flag stays on the outlet — so the screen the user just opened
   * is fully rendered, entirely clickable, and invisible to assistive
   * technology. Found by an e2e case that could see the button in the DOM
   * and not in the accessibility tree.
   */
  await sheet.onDidDismiss()
  chosen.run?.()
}

// G-9: the gear is on every screen — except M17 itself, where it would
// only reopen the screen it is on.
const onSettings = computed(() => route.path === PATH.settings)

function goHome() {
  ionRouter.navigate(PATH.dashboard, 'back', 'replace')
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
        <IonButton
          data-testid="header-back"
          :aria-label="t('common.back')"
          :title="t('common.back')"
          @click="goBack"
        >
          <IonIcon slot="icon-only" :icon="chevronBackOutline" />
        </IonButton>
      </IonButtons>

      <!-- No element at all rather than an empty one: an empty ion-title
           still claims the slot's padding. -->
      <IonTitle v-if="back && title" data-testid="header-title" class="page-title">
        {{ title }}
      </IonTitle>
      <IonTitle
        v-else-if="!back"
        slot="start"
        class="app-logo"
        data-testid="header-logo"
        @click="goHome"
      >
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
        <IonButton
          v-if="overflowActions.length > 0"
          data-testid="header-overflow"
          :aria-label="t('common.moreActions')"
          :title="t('common.moreActions')"
          @click="openOverflow"
        >
          <IonIcon slot="icon-only" :icon="ellipsisVerticalOutline" />
        </IonButton>
        <SyncIndicator
          :state="syncState"
          :pending-count="syncPendingCount"
          :label="syncLabel"
          :update-ready="syncUpdateReady"
          @tap="emit('syncTap')"
        />
        <IonButton
          v-if="!onSettings"
          :router-link="PATH.settings"
          data-testid="header-settings"
          :aria-label="t('settings.title')"
          :title="t('settings.title')"
        >
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
