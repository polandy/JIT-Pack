<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonBackButton, IonButtons } from '@ionic/vue'

const props = defineProps<{ tripId: string; itemId: string }>()
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton :default-href="`/trips/${props.tripId}`" />
        </IonButtons>
        <IonTitle>Item Detail</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p>M5 — Item {{ props.itemId }} in trip {{ props.tripId }}</p>
    </IonContent>
  </IonPage>
</template>
