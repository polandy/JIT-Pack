<script setup lang="ts">
/**
 * Desktop navigation rail (G-9, ≥900px).
 * Replaces the bottom tab bar with a persistent left-side rail.
 */
import { IonIcon, IonLabel } from '@ionic/vue'
import { useRoute } from 'vue-router'

import { NAV_ANCHORS, isAnchorActive } from '@/router/anchors'

const route = useRoute()
</script>

<template>
  <nav class="nav-rail">
    <router-link
      v-for="anchor in NAV_ANCHORS"
      :key="anchor.match"
      :to="anchor.href"
      class="nav-rail-item"
      :class="{ active: isAnchorActive(route.path, anchor.match) }"
      :data-testid="`rail-${anchor.match}`"
    >
      <IonIcon :icon="anchor.icon" />
      <IonLabel>{{ anchor.name }}</IonLabel>
    </router-link>
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
  font-size: 11px;
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
  font-size: 24px;
}

.nav-rail-item ion-label {
  font-size: 11px;
}

@media (min-width: 900px) {
  .nav-rail {
    display: flex;
  }
}
</style>
