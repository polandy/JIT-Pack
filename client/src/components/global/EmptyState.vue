<script setup lang="ts">
/**
 * The G-7 empty state, once: the illustration, the sentence that names the
 * state, an optional second line in the smaller size, and a slot for the one
 * control that leads out of it.
 *
 * It was hand-built on ten screens with **four different** spacing rules, and
 * a copy that dropped two declarations is what E2E-G2-09 was written for —
 * the master log's sentence wraps, and without `padding`/`text-align` the
 * wrapped paragraph ran from edge to edge under a centred icon. The rule kept
 * here is the majority one (`padding: 48px 24px`), so the four screens that
 * had it are unchanged to the pixel and the four that used `margin-top: 48px`
 * keep the same air above while gaining the inset they lacked.
 *
 * **The title is regular weight**, and M4's three branches gave up their
 * `<strong>` heads to it: an empty state is one sentence on an otherwise
 * blank screen, nothing competes with it, and the hint's smaller size carries
 * the whole hierarchy the two-line variants need.
 *
 * Three shapes are deliberately **not** this component:
 *
 * - **M14's** is a success state, not an absence — a smaller glyph painted in
 *   `--jp-done`, followed by the handled rows rather than owning the screen.
 * - **M8's and M10's** `not-found` line says the record does not exist; it is
 *   an error, and it is a centred row rather than a column.
 * - The inline `.empty-hint` notes (M11's unassigned box, M8's group and
 *   position lists, the wizard's steps) sit inside a populated screen and
 *   annotate one section of it.
 */
import { IonIcon } from '@ionic/vue'

withDefaults(
  defineProps<{
    /** The illustration. Omitted where the state is a filter result, not an absence. */
    icon?: string
    /** The one sentence that names the state. */
    title: string
    /** A second line in the smaller size — what to do about it. */
    hint?: string
    /** Put on the root, so a case can address this state. */
    testid?: string
  }>(),
  { icon: undefined, hint: undefined, testid: undefined },
)
</script>

<template>
  <div class="empty-state" :data-testid="testid">
    <IonIcon v-if="icon" :icon="icon" class="empty-icon" />
    <p class="empty-title">{{ title }}</p>
    <p v-if="hint" class="empty-hint">{{ hint }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty-icon {
  font-size: var(--jp-icon-2xl);
  margin-bottom: 16px;
}

.empty-hint {
  font-size: var(--jp-text-sm);
  margin-top: 8px;
}
</style>
