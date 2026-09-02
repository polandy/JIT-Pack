<script setup lang="ts">
/**
 * The four anchors at the foot of the screen, below the G-9 breakpoint
 * where the desktop rail takes over (G-1).
 *
 * Plain links beside the one router outlet rather than Ionic's `IonTabs`,
 * which brings a second outlet with it — see ADR-012. It renders the same
 * entries as `NavRail` from the same list, so the two presentations of one
 * idea cannot drift.
 *
 * **Hidden on the packing list** (§3.25): M4 is deliberately full-screen
 * to win list height, and its `‹ back` is what leads out of it. Nothing
 * else hides it — a screen you cannot leave is worse than a short list.
 */
import { IonIcon, IonLabel, useIonRouter } from '@ionic/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { NAV_ANCHORS, isAnchorActive } from '@/router/anchors'
import { t } from '@/i18n'
import { TAB_BAR_ANCHOR_ID } from '@/lib/toast'
import { PATH } from '@/router/paths'

const route = useRoute()
const ionRouter = useIonRouter()

/**
 * The trip screen only — its children (M5, M6, M11) keep the bar, and so
 * does `/trips/new`: the wizard has the same path shape as a trip id but
 * is a root-level flow, and hiding the anchors there took them from the
 * one screen a first-time user starts on.
 */
const fullScreen = computed(
  () => /^\/trips\/[^/]+$/.test(route.path) && route.path !== PATH.newTrip,
)

/* A bottom toast is positioned above this bar rather than onto it (FR-9.4). */
/**
 * An anchor is a **root** navigation, not a push.
 *
 * The four anchors are siblings, not a stack: nothing is "inside" the trip
 * list relative to the inventory, and there is no back edge between them.
 * As plain `<router-link>`s each switch pushed onto the one outlet
 * (ADR-012), and a push interrupted by the next one leaves both pages
 * live — measured 2026-08-31: tapping through the anchors faster than the
 * transition leaves two pages on screen, the older one on the higher
 * z-index, eating every tap meant for the page the URL names.
 *
 * `navigate(href, 'root', 'replace')` says what a switch is, so the outlet
 * keeps one page whether or not the user waited (E2E-G9-17, E2E-G1-06).
 * The element stays a real link: the href is what makes it middle-clickable
 * and readable by assistive tech, and only the default action is taken over.
 */
function go(href: string, event: MouseEvent): void {
  // Let the browser have the modified clicks — a new tab is not a
  // navigation of ours.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  ionRouter.navigate(href, 'root', 'replace')
}
</script>

<template>
  <nav v-if="!fullScreen" :id="TAB_BAR_ANCHOR_ID" class="tab-bar">
    <a
      v-for="anchor in NAV_ANCHORS"
      :key="anchor.match"
      :href="anchor.href"
      class="tab"
      :class="{ active: isAnchorActive(route.path, anchor) }"
      :data-testid="`tab-${anchor.match}`"
      @click="go(anchor.href, $event)"
    >
      <IonIcon :icon="anchor.icon" />
      <IonLabel>{{ t(anchor.nameKey) }}</IonLabel>
    </a>
  </nav>
</template>

<style scoped>
.tab-bar {
  display: flex;
  flex: none;
  border-top: 1px solid var(--ct-surface0);
  background: var(--ion-background-color);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  text-decoration: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
}

/* Identity, not action (G-11): the anchor you are on is the one place
   the brand colour belongs in the chrome. */
.tab.active {
  color: var(--jp-brand);
}

.tab ion-icon {
  font-size: var(--jp-icon-md);
}

.tab ion-label {
  font-size: var(--jp-text-2xs);
}

/* G-9: above the breakpoint the rail carries these instead. */
@media (min-width: 900px) {
  .tab-bar {
    display: none;
  }
}
</style>
