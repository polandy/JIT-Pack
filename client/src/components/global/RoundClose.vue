<script setup lang="ts">
/**
 * The round close control (G-14, FR-21.12): a filled circle on the sunken
 * plane with a hairline, at the round-control size the token table carries.
 * Drawn once, here — a sheet's way out and a search field's ✕ are the same
 * control, and two copies of one control leave nothing recording which
 * was meant.
 *
 * The label is the caller's, because what the ✕ does is: a sheet closes, a
 * persistent search field clears. Testid and click fall through to the
 * button.
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'

defineProps<{ label: string }>()
</script>

<template>
  <button type="button" class="x" :aria-label="label">
    <IonIcon :icon="closeOutline" />
  </button>
</template>

<style scoped>
/* A circle is a shape, not a size — `50%` is the gate's own carve-out. */
.x {
  display: grid;
  place-items: center;
  width: var(--jp-control-round);
  height: var(--jp-control-round);
  flex: none;
  border: 1px solid var(--jp-surface-border);
  border-radius: 50%;
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}
</style>
