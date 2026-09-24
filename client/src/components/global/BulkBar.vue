<script setup lang="ts">
/**
 * What a selection can be acted on with — the floating bar at the foot of a
 * selecting list, above where the FAB stands (M9's shape, then M6's; M25's
 * since 2026-09-24). The actions are the screen's: each is a button in the
 * slot, an icon over a word; `class="danger"` marks the one that removes
 * (M9's retire).
 */
</script>

<template>
  <div class="bulkbar" slot="fixed">
    <slot />
  </div>
</template>

<style scoped>
.bulkbar {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 8px;
  padding: 8px;
  background: var(--jp-surface-card);
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r);
  box-shadow: var(--jp-shadow);
}

.bulkbar :slotted(button) {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: none;
  border: none;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
  cursor: pointer;
}

.bulkbar :slotted(button.danger) {
  color: var(--ion-color-danger);
}

.bulkbar :slotted(button ion-icon) {
  font-size: var(--jp-icon-md);
}
</style>
