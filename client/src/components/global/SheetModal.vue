<script setup lang="ts">
/**
 * The app's bottom-sheet chrome, once (§3.25 consistency directive): the modal
 * variables, the scroll box and the grab handle that M5, M8 and the filter
 * sheet all present.
 *
 * It exists because the peek sheet (FR-27.12) would otherwise have been the
 * *fifth* copy of the same twenty lines — M4's filter sheet, M8's position
 * sheet, M11's container sheet and M7 each carry their own. Those four are
 * unchanged for now; moving them is mechanical and belongs in its own change,
 * not in the one that introduces the sheet they should share.
 */
import { IonModal } from '@ionic/vue'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <IonModal :is-open="isOpen" class="sheet-modal" @did-dismiss="emit('dismiss')">
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
