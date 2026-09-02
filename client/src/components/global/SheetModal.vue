<script setup lang="ts">
/**
 * The app's bottom-sheet chrome, once (§3.25 consistency directive): the
 * modal variables, the scroll box and the grab handle every sheet presents.
 *
 * The body is a plain box rather than an `IonContent` on purpose: inside an
 * auto-height modal an `IonContent` has no intrinsic height to give, so the
 * sheet sizes itself to nothing and swallows the taps meant for its own
 * controls — M7's kind chooser paid for that once, and its comment is why
 * this component keeps the box.
 *
 * **M4's filter sheet is deliberately not one of these** and keeps its own
 * chrome: it is 86 % of the viewport rather than as tall as its content, so
 * its body has to scroll, and its handle is a different width and shade.
 * Folding it in is a design decision with a rendered cost (measured: 4 217
 * pixels, the whole panel two pixels lower), not the mechanical move the
 * other four were — see U-3 in the 2026-09-02 review.
 */
import { IonModal } from '@ionic/vue'

withDefaults(
  defineProps<{
    isOpen: boolean
    /** Put on the modal, for a case that has to address this sheet. */
    testid?: string
  }>(),
  { testid: undefined },
)
const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <IonModal
    :is-open="isOpen"
    class="sheet-modal"
    :data-testid="testid"
    @did-dismiss="emit('dismiss')"
  >
    <div class="sheet-box">
      <div class="grab" />
      <slot />
    </div>
  </IonModal>
</template>

<style scoped>
.sheet-modal {
  --height: auto;
  --border-radius: var(--jp-r-lg) var(--jp-r-lg) 0 0;
  --background: var(--ct-mantle);
  --box-shadow: var(--jp-shadow-sheet);
  --backdrop-opacity: 0.62;
  align-items: flex-end;
}

.sheet-box {
  max-height: 85vh;
  overflow-y: auto;
}

.grab {
  width: 36px;
  height: 4px;
  margin: 10px auto 4px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface1);
}
</style>
