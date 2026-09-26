<script setup lang="ts">
/**
 * One line of an excursion's list (FR-31.6) — the lean sibling of M4's
 * `PackingRow`: a mark (or, as a cluster's child, the person), the name and
 * amount, one fact line, the tick. No packer, container or weight.
 *
 * The fact line says where the thing comes from — *aus dem Gepäck*, *vor
 * Ort* — and, where the list needs something done, says what and offers it
 * in place: *nicht im Gepäck · Vor Ort besorgen* (FR-31.7), *nicht mehr dabei
 * · Herausnehmen* (FR-31.5). The mark is never painted on (FR-28.5/G-15); the
 * problem is a line of words where the problem is.
 */
import { IonButton, IonLabel } from '@ionic/vue'
import { computed } from 'vue'

import ItemMark from '@/components/items/ItemMark.vue'
import ListRow from '@/components/global/ListRow.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { t } from '@/i18n'
import type { ExcursionItem, MasterItem } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, STATE_SKIPPED } from '@/types/domain'

/** The mark's box, in px — the slot M4 gives an item row. */
const MARK_SIZE = 22
/** A child row's person, in px — M4's cluster child. */
const AVATAR_SIZE = 24

const props = withDefaults(
  defineProps<{
    line: ExcursionItem
    /** The master row behind it, for the mark; null for a line typed by hand. */
    master?: MasterItem | null
    /** As a cluster's child: the person instead of the mark and the name. */
    person?: { id: string; name: string } | null
    /** The line borrows a suitcase row this device holds. */
    fromLuggage?: boolean
    /** FR-31.5: its person no longer goes, and it is in the rucksack. */
    leftBehind?: boolean
    /**
     * The stable half of every `data-testid`: the name for a line, the name and
     * the person for a cluster's child — what the suite addresses it by.
     */
    testKey: string
  }>(),
  { master: null, person: null, fromLuggage: false, leftBehind: false },
)

const emit = defineEmits<{
  tick: []
  open: []
  buyOnSite: []
  takeOut: []
}>()

const skipped = computed(() => props.line.state === STATE_SKIPPED)
const done = computed(() => skipped.value || props.line.packed_count >= props.line.quantity)
const onSite = computed(() => props.line.mode === ITEM_MODE_BUY_LOCAL)
/** Only a line still meant for the suitcase can be missing from it. */
const missing = computed(() => props.line.not_in_luggage && !onSite.value && !skipped.value)

const source = computed(() => {
  if (onSite.value) return props.line.bought_at ? t('excursions.bought') : t('excursions.onSite')
  return props.fromLuggage ? t('excursions.fromLuggage') : null
})
</script>

<template>
  <ListRow
    :checked="skipped ? null : done"
    :done="done"
    :tick-label="line.name"
    :data-testid="`excursion-line-${testKey}`"
    @tick="emit('tick')"
  >
    <template #start>
      <UserAvatar
        v-if="person"
        slot="start"
        :name="person.name"
        :seed="person.id"
        :size="AVATAR_SIZE"
        class="lead"
      />
      <ItemMark
        v-else
        slot="start"
        :mark="master?.icon ?? null"
        surface="packing"
        :photo-item="master"
        :size="MARK_SIZE"
        class="lead"
      />
    </template>

    <button
      type="button"
      class="open"
      :aria-label="t('excursions.lineMenu', { item: line.name })"
      :data-testid="`excursion-line-open-${testKey}`"
      @click="emit('open')"
    >
      <IonLabel class="row-name">
        {{ person ? person.name : line.name }}
        <span v-if="line.quantity > 1" class="qty">×{{ line.quantity }}</span>
      </IonLabel>
    </button>

    <template v-if="source || missing || leftBehind" #facts>
      <span v-if="missing" class="warn" :data-testid="`excursion-missing-${testKey}`">
        {{ t('excursions.notInLuggage') }}
        <IonButton
          fill="clear"
          size="small"
          class="act"
          :data-testid="`excursion-buy-on-site-${testKey}`"
          @click="emit('buyOnSite')"
        >
          {{ t('excursions.buyOnSite') }}
        </IonButton>
      </span>
      <span v-else-if="leftBehind" class="warn" :data-testid="`excursion-left-behind-${testKey}`">
        {{ t('excursions.leftBehind') }}
        <IonButton
          fill="clear"
          size="small"
          class="act"
          :data-testid="`excursion-take-out-${testKey}`"
          @click="emit('takeOut')"
        >
          {{ t('excursions.takeOut') }}
        </IonButton>
      </span>
      <span
        v-else-if="source"
        :class="{ local: onSite }"
        :data-testid="`excursion-source-${testKey}`"
      >
        {{ source }}
      </span>
    </template>
  </ListRow>
</template>

<style scoped>
.lead {
  margin-inline-end: 12px;
}

.open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
}

.qty {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.local {
  color: var(--jp-done);
}

.warn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--ct-straw);
}

.act {
  --padding-start: 4px;
  --padding-end: 4px;
  margin: 0;
  min-height: 0;
  height: auto;
  font-size: var(--jp-text-sm);
}
</style>
