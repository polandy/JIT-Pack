<script setup lang="ts">
/**
 * The app's one header bar (G-9, ADR-011).
 *
 * There is exactly one; no screen supplies its own. The right-hand group
 * — sync indicator (G-2) and settings/avatar (G-1) — is unconditional,
 * which is what keeps the conflict log reachable from inside a trip.
 * The left slot switches: the logo on a tab root, `‹ back` everywhere
 * else. The page's *name* is not here any more — it is in the page, at a
 * size a bar cannot give it (PageHead, ADR-050).
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
import { useRoute, useRouter } from 'vue-router'
import BrandMark from './BrandMark.vue'
import SyncIndicator from './SyncIndicator.vue'
import { backTarget, enteredFrom } from '@/router/backTarget'
import { actionsFor } from '@/composables/useHeaderActions'
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
const router = useRouter()
const ionRouter = useIonRouter()

const back = computed(() => backTarget(route))

/**
 * How many glyphs the bar will show beside the ⋮ (ADR-050). The count is a
 * budget rather than a description: M4 stood at seven, and every one of them
 * had arrived one at a time because nothing said what full looked like.
 */
const MAX_BAR_ACTIONS = 3

// G-12: the current page's icon cluster, described by the page rather
// than teleported into this toolbar — see useHeaderActions.
const glyphActions = computed(() => actionsFor(route.path).filter((a) => !a.overflow))

const pageActions = computed(() => glyphActions.value.slice(0, MAX_BAR_ACTIONS))

/*
 * The ones the page put behind the ⋮ (UX-13), and the ones that did not fit.
 * An action sheet rather than a popover: it is the menu shape the rest of the
 * app already uses (M2's and M7's row menus), and it renders each entry as a
 * *word*, which is what the bar could not do for them.
 *
 * The surplus keeps its registration order and lands ahead of the declared
 * overflow, so a page that overruns the budget reads as the list it wrote
 * rather than as a reshuffle.
 */
const overflowActions = computed(() => [
  ...glyphActions.value.slice(MAX_BAR_ACTIONS),
  ...actionsFor(route.path).filter((a) => a.overflow),
])

async function openOverflow() {
  // Held in a box: assigned only inside a callback, so TypeScript's flow
  // analysis would narrow a plain `let` back to `null` at the call below.
  const chosen: { run: (() => void) | null } = { run: null }
  const sheet = await actionSheetController.create({
    buttons: [
      ...overflowActions.value.map((action) => ({
        text: action.label,
        icon: action.icon,
        // The same id the action would have carried as a glyph: a menu entry
        // is the same action, and a test that knew where to click should not
        // have to know which of the two shapes it is wearing today.
        htmlAttributes: { 'data-testid': action.id },
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

/**
 * Where the gear points — with the origin already in the href.
 *
 * The origin exists so `‹` returns to the screen the gear was pressed on
 * (Navigation_Concept §7), and the router would write it itself: the
 * stamping guard redirects any entry into an `acceptsFrom` route that
 * carries none (originStamp.ts). Writing it here instead is not a second
 * mechanism but the one that keeps the tap a *single* navigation, and
 * that is what the outlet needs. A redirect aborts the navigation Ionic's
 * `router-link` already staged as a forward push and re-issues it as a
 * replace; Ionic keeps the staged push, and the two disagree about which
 * page is leaving. From two pages deep it hid the wrong one: M17 came up
 * over a still-live packing list, both unhidden in the one outlet, taps
 * landing on whichever won the stacking order. Measured 2026-09-13 —
 * from a tab root the stack is too shallow for the two to disagree, which
 * is why it only ever showed up inside a trip.
 *
 * The guard stays: it answers for the entry points that navigate
 * programmatically, which stage nothing for Ionic to keep and so never
 * hit this. This is the one `router-link` into a stamped route.
 */
const settingsHref = computed(
  () => router.resolve({ path: PATH.settings, query: enteredFrom(route.fullPath) }).fullPath,
)

function goHome() {
  ionRouter.navigate(PATH.dashboard, 'back', 'replace')
}

// __APP_VERSION__ is vite.config.ts's `define` (git describe, or the
// Docker build's APP_VERSION arg) — shown beside the wordmark so the
// running build is visible without opening Settings (M17).
//
// Rendered verbatim: both sources already carry the tag's own `v`
// (`git describe --tags` → `v0.10.0-1-g…`, and the release workflow passes
// `APP_VERSION=${{ github.ref_name }}`, which is the tag name). Adding one
// here made every build say `vv…`, the shipped image included.
const appVersionLabel = computed(() => __APP_VERSION__)

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

      <IonTitle
        v-if="!back"
        slot="start"
        class="app-logo"
        data-testid="header-logo"
        @click="goHome"
      >
        <span class="logo-row">
          <BrandMark :size="22" />
          <span class="logo-wordmark">JIT<i class="logo-dot">·</i>Pack</span>
          <span class="app-version" data-testid="header-app-version">{{ appVersionLabel }}</span>
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
          :router-link="settingsHref"
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

/* Muted, small — an identifier for a bug report, not a label competing
   with the wordmark. Desktop-only alongside it (G-9's own rule below). */
.app-version {
  font-family: var(--jp-font-ui);
  font-size: var(--jp-text-3xs);
  color: var(--ct-subtext0);
  display: none;
}

/* G-9: mark only on mobile, mark + wordmark on desktop */
@media (min-width: 900px) {
  .logo-wordmark {
    display: inline;
  }

  .app-version {
    display: inline;
  }
}
</style>
