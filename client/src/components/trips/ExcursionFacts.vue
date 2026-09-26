<script setup lang="ts">
/**
 * What an excursion's line says under its name (FR-31.6) — rendered inside
 * M4's own `PackingRow`, whose name, mark, glyphs and stepper the line wears
 * like any packing row. This is only the part a packing row does not have:
 * where the thing comes from, and what the line needs done, offered in place
 * — *nicht im Gepäck · Vor Ort besorgen* (FR-31.7), *nicht mehr dabei ·
 * Herausnehmen* (FR-31.5), *vor Ort gekauft · Auf die Packliste* (FR-31.13).
 * The mark is never painted on (FR-28.5/G-15).
 */
import { IonButton } from '@ionic/vue'
import { computed } from 'vue'

import { t } from '@/i18n'
import type { ExcursionItem } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, STATE_SKIPPED } from '@/types/domain'

const props = withDefaults(
  defineProps<{
    line: ExcursionItem
    /** The line borrows a suitcase row this device holds. */
    fromLuggage?: boolean
    /** FR-31.5: its person no longer goes, and it is in the rucksack. */
    leftBehind?: boolean
    /** FR-31.13: bought on the spot and not a suitcase row yet — it can join the trip. */
    canKeep?: boolean
    /** The stable half of every `data-testid` — the row's own key. */
    testKey: string
  }>(),
  { fromLuggage: false, leftBehind: false, canKeep: false },
)

const emit = defineEmits<{ buyOnSite: []; takeOut: []; keep: [] }>()

const skipped = computed(() => props.line.state === STATE_SKIPPED)
const onSite = computed(() => props.line.mode === ITEM_MODE_BUY_LOCAL)
/** Only a line still meant for the suitcase can be missing from it. */
const missing = computed(() => props.line.not_in_luggage && !onSite.value && !skipped.value)

const source = computed(() => {
  if (onSite.value) {
    // Still to buy, the row's own mode glyph says so, as on M4.
    if (!props.line.bought_at) return null
    return props.fromLuggage
      ? `${t('excursions.bought')} · ${t('excursions.kept')}`
      : t('excursions.bought')
  }
  return props.fromLuggage ? t('excursions.fromLuggage') : null
})
</script>

<template>
  <p v-if="missing" class="facts warn" :data-testid="`excursion-missing-${testKey}`">
    {{ t('excursions.notInLuggage') }}
    <IonButton
      fill="clear"
      size="small"
      class="act"
      :data-testid="`excursion-buy-on-site-${testKey}`"
      @click.stop="emit('buyOnSite')"
    >
      {{ t('excursions.buyOnSite') }}
    </IonButton>
  </p>
  <p v-else-if="leftBehind" class="facts warn" :data-testid="`excursion-left-behind-${testKey}`">
    {{ t('excursions.leftBehind') }}
    <IonButton
      fill="clear"
      size="small"
      class="act"
      :data-testid="`excursion-take-out-${testKey}`"
      @click.stop="emit('takeOut')"
    >
      {{ t('excursions.takeOut') }}
    </IonButton>
  </p>
  <p v-else-if="source" class="facts">
    <span :class="{ local: onSite }" :data-testid="`excursion-source-${testKey}`">{{
      source
    }}</span>
    <IonButton
      v-if="canKeep"
      fill="clear"
      size="small"
      class="act"
      :data-testid="`excursion-keep-${testKey}`"
      @click.stop="emit('keep')"
    >
      {{ t('excursions.keep') }}
    </IonButton>
  </p>
</template>

<style scoped>
.facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin: 2px 0 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.local {
  color: var(--jp-done);
}

.warn {
  color: var(--ct-straw);
}

.act {
  --padding-start: 4px;
  --padding-end: 4px;
  margin: 0;
  min-height: 0;
  height: auto;
  font-size: var(--jp-text-xs);
}
</style>
