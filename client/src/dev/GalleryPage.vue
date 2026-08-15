<script setup lang="ts">
/**
 * Component gallery — development only (ADR-013).
 *
 * Every global component in every state, on one scrollable page, with no
 * data to construct first. It exists for the six screen rebuilds queued
 * behind the design foundation: while rebuilding a screen you need to see
 * what a packer avatar, a quantity stepper or an eyebrow *already* looks
 * like, and today that means finding a trip that happens to be in the right
 * state.
 *
 * **It is deliberately not a baseline surface.** The route is behind
 * `import.meta.env.DEV`, following `src/dev/sampleTrip.ts`, so it does not
 * exist in the bundle the visual project drives — which means component
 * states are not regression-guarded. The alternative was shipping a
 * developer surface into every self-hosted instance so it could be
 * screenshotted, and that costs more than it buys. ADR-013 records the
 * trade; the short version is that this page makes *human* review cheap
 * while the baselines make *regression detection* automatic.
 */
import { IonPage, IonContent, IonItem, IonLabel, IonList } from '@ionic/vue'
import { ref } from 'vue'

import QuantityStepper from '@/components/global/QuantityStepper.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'

/** Stepper state, so the control can be exercised rather than only seen. */
const packed = ref(2)
</script>

<template>
  <IonPage>
    <IonContent class="gallery ion-padding">
      <h1 class="jp-page-title">Gallery</h1>
      <p class="intro">
        Development only — this route is absent from a production build. States that need a
        trip live on the real screens; what is here is everything that does not.
      </p>

      <h2 class="section-title jp-eyebrow">Type roles</h2>
      <div class="jp-card demo">
        <p class="jp-page-title">Page title</p>
        <p class="jp-hero-title">Hero title</p>
        <p class="jp-sheet-title">Sheet title</p>
        <p class="jp-eyebrow">Section label</p>
        <p>Body copy, the UI face at its default size.</p>
        <p class="jp-num">0123456789 — tabular figures</p>
      </div>

      <h2 class="section-title jp-eyebrow">Surfaces</h2>
      <div class="planes">
        <div class="plane sunken">sunken</div>
        <div class="plane page">page</div>
        <div class="jp-card plane">card</div>
      </div>

      <h2 class="section-title jp-eyebrow">Avatars</h2>
      <div class="jp-card demo row">
        <UserAvatar name="Andy Pollari" seed="a" />
        <UserAvatar name="Mia" seed="b" />
        <UserAvatar name="Andy" seed="c" variant="assignee" />
        <UserAvatar name="Mia" seed="d" variant="packer" />
        <UserAvatar name="Andy" seed="e" :size="40" />
      </div>

      <h2 class="section-title jp-eyebrow">Quantity stepper</h2>
      <IonList class="jp-card">
        <IonItem>
          <QuantityStepper
            slot="start"
            :quantity="1"
            :packed="0"
            @toggle="packed = packed > 0 ? 0 : 1"
          />
          <IonLabel>Single item — renders as a checkbox</IonLabel>
        </IonItem>
        <IonItem>
          <QuantityStepper
            slot="start"
            :quantity="6"
            :packed="packed"
            @increment="packed += 1"
            @decrement="packed -= 1"
          />
          <IonLabel>Multiple — {{ packed }}/6</IonLabel>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.gallery h2 {
  margin: 28px 0 10px;
}

.intro {
  color: var(--ct-subtext0);
  max-width: 60ch;
}

.demo {
  padding: 16px;
}

.demo p {
  margin: 0 0 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.planes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.plane {
  padding: 20px 14px;
  border-radius: var(--jp-r);
  text-align: center;
}

.plane.sunken {
  background: var(--jp-surface-sunken);
}

.plane.page {
  background: var(--jp-surface-page);
}
</style>
