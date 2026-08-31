<script setup lang="ts">
/**
 * Desktop navigation rail (G-9, ≥900px).
 * Replaces the bottom tab bar with a persistent left-side rail.
 */
import { IonIcon, IonLabel, useIonRouter } from '@ionic/vue'
import { useRoute } from 'vue-router'

import { NAV_ANCHORS, isAnchorActive } from '@/router/anchors'
import { t } from '@/i18n'

const route = useRoute()
const ionRouter = useIonRouter()
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
  <nav class="nav-rail">
    <a
      v-for="anchor in NAV_ANCHORS"
      :key="anchor.match"
      :href="anchor.href"
      class="nav-rail-item"
      :class="{ active: isAnchorActive(route.path, anchor.match) }"
      :data-testid="`rail-${anchor.match}`"
      @click="go(anchor.href, $event)"
    >
      <IonIcon :icon="anchor.icon" />
      <IonLabel>{{ t(anchor.nameKey) }}</IonLabel>
    </a>
  </nav>
</template>

<style scoped>
/*
 * G-9: the rail is the desktop presentation of the four anchors; below
 * the breakpoint the bottom tab bar carries them instead. The rule lives
 * here rather than in App.vue because a scoped `.nav-rail` outranks an
 * unscoped `.desktop-nav`, so the outside rule never won and the rail
 * showed at every width.
 */
.nav-rail {
  display: none;
  flex-direction: column;
  width: 80px;
  min-height: 100%;
  background: var(--ion-background-color);
  border-right: 1px solid var(--ion-border-color);
  padding-top: 12px;
}

.nav-rail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  text-decoration: none;
  color: var(--ion-color-medium);
  font-size: var(--jp-text-2xs);
  border-radius: var(--jp-r-sm);
  margin: 2px 8px;
  transition:
    background 0.15s,
    color 0.15s;
}

.nav-rail-item:hover {
  background: var(--ion-color-light);
}

/* The desktop half of the same rule as TabBar (G-11). */
.nav-rail-item.active {
  color: var(--jp-brand);
  background: color-mix(in srgb, var(--jp-brand) 12%, transparent);
}

.nav-rail-item ion-icon {
  font-size: var(--jp-icon-md);
}

.nav-rail-item ion-label {
  font-size: var(--jp-text-2xs);
}

@media (min-width: 900px) {
  .nav-rail {
    display: flex;
  }
}
</style>
