<script setup lang="ts">
/**
 * Desktop navigation rail (G-9, ≥900px).
 * Replaces the bottom tab bar with a persistent left-side rail.
 */
import { IonIcon, IonLabel } from '@ionic/vue'
import { homeOutline, airplaneOutline, listOutline, cubeOutline } from 'ionicons/icons'
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { name: 'Dashboard', icon: homeOutline, href: '/tabs/dashboard', match: 'dashboard' },
  { name: 'Trips', icon: airplaneOutline, href: '/tabs/trips', match: 'trips' },
  { name: 'Templates', icon: listOutline, href: '/tabs/templates', match: 'templates' },
  { name: 'Items', icon: cubeOutline, href: '/tabs/items', match: 'items' },
] as const

function isActive(match: string): boolean {
  return route.path.includes(`/tabs/${match}`)
}
</script>

<template>
  <nav class="nav-rail">
    <router-link
      v-for="tab in tabs"
      :key="tab.match"
      :to="tab.href"
      class="nav-rail-item"
      :class="{ active: isActive(tab.match) }"
    >
      <IonIcon :icon="tab.icon" />
      <IonLabel>{{ tab.name }}</IonLabel>
    </router-link>
  </nav>
</template>

<style scoped>
.nav-rail {
  display: flex;
  flex-direction: column;
  width: 80px;
  min-height: 100%;
  background: var(--ion-background-color, #fff);
  border-right: 1px solid var(--ion-border-color, #e0e0e0);
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
  border-radius: 8px;
  margin: 2px 8px;
  transition:
    background 0.15s,
    color 0.15s;
}

.nav-rail-item:hover {
  background: var(--ion-color-light);
}

.nav-rail-item.active {
  color: var(--ion-color-primary);
  background: var(--ion-color-primary-tint, rgba(var(--ion-color-primary-rgb), 0.1));
}

.nav-rail-item ion-icon {
  font-size: 24px;
}

.nav-rail-item ion-label {
  font-size: 11px;
}
</style>
