<script setup lang="ts">
import {
  IonTabBar,
  IonTabButton,
  IonTabs,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
} from '@ionic/vue'
import { homeOutline, airplaneOutline, listOutline, cubeOutline } from 'ionicons/icons'
</script>

<template>
  <IonTabs>
    <IonRouterOutlet />
    <IonTabBar slot="bottom">
      <IonTabButton tab="dashboard" href="/tabs/dashboard">
        <IonIcon :icon="homeOutline" />
        <IonLabel>Dashboard</IonLabel>
      </IonTabButton>
      <IonTabButton tab="trips" href="/tabs/trips">
        <IonIcon :icon="airplaneOutline" />
        <IonLabel>Trips</IonLabel>
      </IonTabButton>
      <IonTabButton tab="templates" href="/tabs/templates">
        <IonIcon :icon="listOutline" />
        <IonLabel>Templates</IonLabel>
      </IonTabButton>
      <IonTabButton tab="items" href="/tabs/items">
        <IonIcon :icon="cubeOutline" />
        <IonLabel>Items</IonLabel>
      </IonTabButton>
    </IonTabBar>
  </IonTabs>
</template>
