<script setup lang="ts">
/**
 * FR-25.28 — the for-whom strip's line of toggles: *Gemeinsam*, *Alle*, then
 * one avatar per traveler in roster order.
 *
 * It draws a membership and reports taps; it decides nothing. The two callers
 * differ in what a tap *is* — `ForWhomStrip` rewrites the rows of an item that
 * exists, the quick-add only remembers a choice for the next add — and both
 * need the same line, so the line owns no rows and no store.
 *
 * No avatar lit means *gemeinsam*: an empty membership is not a state the
 * model has (FR-25.21c), so *Gemeinsam* is lit exactly when nobody is.
 */
import { IonIcon } from '@ionic/vue'
import { addOutline, peopleOutline, removeOutline } from 'ionicons/icons'
import { computed } from 'vue'

import UserAvatar from '@/components/global/UserAvatar.vue'
import { MIN_MEMBER_QUANTITY } from '@/domain/membership'
import { t } from '@/i18n'
import type { Traveler } from '@/types/domain'

const props = withDefaults(
  defineProps<{
    travelers: Traveler[]
    /** The amount each member carries, by traveler id. A traveler absent from it is not a member. */
    amounts: ReadonlyMap<string, number>
    /**
     * M5 only: a stepper per lit traveler, listed under the line. M4's strip has none — a lit
     * traveler is a child row from the same tap, and that row's count is where
     * its amount is changed (FR-25.24).
     */
    steppers?: boolean
    /** G-3, or a question standing in the strip: the line reads and does not write. */
    disabled?: boolean
    /** The stable half of every `data-testid`, so two strips on one screen stay apart. */
    testKey: string
  }>(),
  { steppers: false, disabled: false },
)

const emit = defineEmits<{
  shared: []
  all: []
  toggle: [travelerId: string]
  step: [travelerId: string, by: number]
}>()

/**
 * The line is laid out for **three travelers** (owner, 2026-09-18): the common
 * trip, where *Gemeinsam*, *Alle* and three faces share a phone's width with
 * room to spare. Up to that size a toggle is a full 40 px face with its name
 * spelled out under it; a longer roster steps down to the compact 32 px face,
 * which fits five on 360 px, and past that the line scrolls.
 */
const ROOMY_ROSTER_MAX = 3
const AVATAR_ROOMY = 40
const AVATAR_COMPACT = 32

/** The lit travelers, in roster order — the rows M5's amounts are listed for. */
const members = computed(() => props.travelers.filter((tr) => props.amounts.has(tr.id)))

const roomy = computed(() => props.travelers.length <= ROOMY_ROSTER_MAX)
const avatarSize = computed(() => (roomy.value ? AVATAR_ROOMY : AVATAR_COMPACT))

const nobody = computed(() => props.travelers.every((tr) => !props.amounts.has(tr.id)))
const everybody = computed(
  () => props.travelers.length > 0 && props.travelers.every((tr) => props.amounts.has(tr.id)),
)
</script>

<template>
  <div
    class="toggles"
    :class="{ roomy }"
    role="group"
    :aria-label="t('forWhom.title')"
    :data-roomy="roomy"
  >
    <button
      type="button"
      class="who"
      :class="{ on: nobody }"
      :aria-pressed="nobody"
      :disabled="disabled"
      :data-testid="`for-whom-shared-${testKey}`"
      @click="emit('shared')"
    >
      <span class="disc glyph"><IonIcon :icon="peopleOutline" aria-hidden="true" /></span>
      <span class="name">{{ t('membership.shared') }}</span>
    </button>

    <span class="rule" aria-hidden="true" />

    <!-- FR-25.21c: it only ever enlarges, and it is not disabled once full —
         a faded control is G-3's sentence about a claimed row. -->
    <button
      type="button"
      class="who"
      :class="{ on: everybody }"
      :aria-pressed="everybody"
      :disabled="disabled"
      :data-testid="`for-whom-all-${testKey}`"
      @click="emit('all')"
    >
      <span class="disc glyph jp-num">{{ travelers.length }}</span>
      <span class="name">{{ t('forWhom.all') }}</span>
    </button>

    <button
      v-for="tr in travelers"
      :key="tr.id"
      type="button"
      class="who"
      :class="{ on: amounts.has(tr.id) }"
      :aria-pressed="amounts.has(tr.id)"
      :aria-label="tr.name"
      :disabled="disabled"
      :data-testid="`for-whom-${testKey}-${tr.name}`"
      @click="emit('toggle', tr.id)"
    >
      <span class="disc" :class="{ off: !amounts.has(tr.id) }">
        <UserAvatar :name="tr.name" :seed="tr.id" :size="avatarSize" />
      </span>
      <span class="name">{{ tr.name }}</span>
    </button>
  </div>

  <!-- M5 only. Under the line rather than under each avatar: a stepper is
       wider than a toggle, and hung in the toggle's column it reached into its
       neighbours' at five travelers on a phone — found by rendering it. -->
  <ul v-if="steppers && members.length > 0" class="amounts">
    <li v-for="tr in members" :key="tr.id">
      <span class="amount-name">{{ tr.name }}</span>
      <span class="stepper">
        <button
          type="button"
          :disabled="disabled || (amounts.get(tr.id) ?? MIN_MEMBER_QUANTITY) <= MIN_MEMBER_QUANTITY"
          :aria-label="t('membership.less', { name: tr.name })"
          :data-testid="`for-whom-minus-${testKey}-${tr.name}`"
          @click="emit('step', tr.id, -1)"
        >
          <IonIcon :icon="removeOutline" />
        </button>
        <span class="amount jp-num" :data-testid="`for-whom-qty-${testKey}-${tr.name}`">{{
          amounts.get(tr.id)
        }}</span>
        <button
          type="button"
          :disabled="disabled"
          :aria-label="t('membership.more', { name: tr.name })"
          :data-testid="`for-whom-plus-${testKey}-${tr.name}`"
          @click="emit('step', tr.id, 1)"
        >
          <IonIcon :icon="addOutline" />
        </button>
      </span>
    </li>
  </ul>
</template>

<style scoped>
/*
 * One line, never two: a roster too long for the width scrolls sideways
 * rather than wrapping or shrinking a toggle under the touch-target floor
 * (FR-25.28, FR-25.13h's live check).
 */
.toggles {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  overflow-x: auto;
  /* The lit ring is drawn outside the disc; without room it is clipped by
     the scroll container at the line's two ends. */
  padding: 4px;
}

.who {
  /* 40px is the floor: five travelers, *Gemeinsam* and *Alle* fit a 360px
     phone at it, and a sixth scrolls. Measured, not reasoned (FR-25.28). */
  flex: 1 0 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
  cursor: pointer;
}

.who:disabled {
  opacity: 0.45;
  cursor: default;
}

.who.on {
  color: var(--ct-text);
  font-weight: var(--jp-weight-semibold);
}

.disc {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

/* Three travelers or fewer: the full face, and its name at a readable size. */
.roomy .disc {
  width: 40px;
  height: 40px;
}

.roomy .who {
  gap: 6px;
  font-size: var(--jp-text-xs);
}

.roomy .glyph ion-icon {
  font-size: var(--jp-icon-md);
}

/* An unlit traveler keeps the face — who they are is the label — and loses
   the weight, so the lit ones read as the set at a glance. */
.disc.off {
  opacity: 0.5;
}

.glyph {
  border: 1px solid var(--ct-surface2);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-bold);
}

.glyph ion-icon {
  font-size: var(--jp-icon-sm);
}

.who.on .disc {
  box-shadow:
    0 0 0 2px var(--jp-surface-card),
    0 0 0 4px var(--jp-action);
}

.who.on .glyph {
  border-color: var(--jp-action);
  background: var(--jp-action);
  color: var(--ct-on-accent);
}

.name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule {
  flex: none;
  align-self: stretch;
  width: 1px;
  margin: 4px 4px 18px;
  background: var(--ct-surface1);
}

.amounts {
  list-style: none;
  margin: 0;
  padding: 0 4px;
}

.amounts li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--jp-text-base);
}

.stepper {
  display: flex;
  align-items: center;
}

.stepper button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 36px;
  padding: 0;
  border: none;
  background: none;
  color: var(--jp-action);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.stepper button:disabled {
  color: var(--ct-surface2);
  cursor: default;
}

.amount {
  min-width: 16px;
  text-align: center;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
}
</style>
