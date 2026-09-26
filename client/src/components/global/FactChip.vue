<script setup lang="ts">
/**
 * The read-only "fact" chip — a small pill that states one thing about a
 * row (a quantity, an assignment, a flag), never something pressed
 * (component extraction worklist item 4). Not the interactive filter/toggle
 * chips scattered elsewhere (`FilterSheet.vue`, `ItemInventoryPage.vue`,
 * `PackingListPage.vue`, `ShoppingPage.vue`, `QuantityEditor.vue`'s own
 * `.qty-chip`) — those independently evolved a different surface, border and
 * "on" state each, and unifying them is a real redesign decision, not this
 * extraction.
 *
 * `tone` names what the chip says, not a colour — several names share a
 * colour today (`buy`/`warn` both `--ct-larch`, `done`/`applied` both
 * `--jp-done`, `cond`/`unused` both `--ct-heather`) because the four source
 * screens independently reached for the same handful of meanings.
 *
 * `bordered` is a caller choice, not tied to a tone: every bordered chip
 * across the four screens mixes its ring from its own text colour at the
 * same 50%, so one `currentColor` rule covers all of them.
 *
 * Padding/density is layout, not identity, and stays with the caller via an
 * override class — same pattern as `RemoveButton.vue`'s `.rm-gap`.
 */
withDefaults(
  defineProps<{
    tone?: 'accent' | 'buy' | 'warn' | 'done' | 'cond' | 'unused' | 'missing' | 'applied' | null
    bordered?: boolean
  }>(),
  { tone: null, bordered: false },
)
</script>

<template>
  <span class="chip" :class="[tone, { bordered }]"><slot /></span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
}

.chip.bordered {
  border-color: color-mix(in srgb, currentColor 50%, transparent);
}

.chip.accent {
  color: var(--jp-action);
}

.chip.buy,
.chip.warn {
  color: var(--ct-larch);
}

.chip.done,
.chip.applied {
  color: var(--jp-done);
}

.chip.cond,
.chip.unused {
  color: var(--ct-heather);
}

.chip.missing {
  color: var(--ct-straw);
}
</style>
