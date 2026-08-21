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
import { IonIcon, IonLabel } from '@ionic/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { NAV_ANCHORS, isAnchorActive } from '@/router/anchors'
import { t } from '@/i18n'

const route = useRoute()

/**
 * The trip screen only — its children (M5, M6, M11) keep the bar, and so
 * does `/trips/new`: the wizard has the same path shape as a trip id but
 * is a root-level flow, and hiding the anchors there took them from the
 * one screen a first-time user starts on.
 */
const fullScreen = computed(
  () => /^\/trips\/[^/]+$/.test(route.path) && route.path !== '/trips/new',
)
</script>

<template>
  <nav v-if="!fullScreen" class="tab-bar">
    <router-link
      v-for="anchor in NAV_ANCHORS"
      :key="anchor.match"
      :to="anchor.href"
      class="tab"
      :class="{ active: isAnchorActive(route.path, anchor.match) }"
      :data-testid="`tab-${anchor.match}`"
    >
      <IonIcon :icon="anchor.icon" />
      <IonLabel>{{ t(anchor.nameKey) }}</IonLabel>
    </router-link>
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
