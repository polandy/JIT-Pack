<script setup lang="ts">
/**
 * FR-25.29 — each traveler's share of the trip, as a ring around their face.
 *
 * Drawn for three travelers — three columns, no scrolling — and wrapping in
 * threes beyond that, with anything past {@link TRAVELER_FOLD_CAP} folded
 * behind one slot so a large party never pushes the list further down.
 *
 * A tap toggles the traveler in the person facet (FR-25.11), the same filter
 * the sheet sets, so several can be picked; this strip owns no filter of its
 * own. What it draws is the
 * whole trip regardless of that filter, like the trip line above it (FR-25.20):
 * a share that shrank with the list would stop being a share of the trip.
 */
import { computed, ref } from 'vue'

import UserAvatar from '@/components/global/UserAvatar.vue'
import { NO_VALUE } from '@/domain/packingView'
import {
  TRAVELER_FOLD_CAP,
  foldTravelers,
  travelerDone,
  travelerPercent,
  type TravelerProgress,
  type TravelerShare,
} from '@/domain/travelerProgress'
import type { PackUnits } from '@/domain/packState'
import { t } from '@/i18n'

const props = defineProps<{
  progress: TravelerProgress
  /** The person facet's selected values — a traveler id, or `NO_VALUE` for shared. */
  selected: readonly string[]
}>()

const emit = defineEmits<{
  /** A traveler id, or `NO_VALUE` for the shared rows. */
  select: [value: string]
}>()

/** Diameter of the ring; the face inside is inset by the arc's width. */
const RING_PX = 56
const FACE_PX = 44
/** A row of the strip holds three, the party it is drawn for. */
const COLUMNS = 3

const expanded = ref(false)

const folded = computed(() =>
  foldTravelers(props.progress.travelers, {
    expanded: expanded.value,
    selected: props.selected,
  }),
)

/** Unfolding is only offered where there was something to fold. */
const foldable = computed(() => props.progress.travelers.length > TRAVELER_FOLD_CAP)

const columns = computed(() => {
  const slots = folded.value.shown.length + (folded.value.hidden.length > 0 ? 1 : 0)
  return Math.min(COLUMNS, slots)
})

function isSelected(value: string): boolean {
  return props.selected.includes(value)
}

function countLine(units: PackUnits): string {
  if (units.total === 0) return t('travelerProgress.nothing')
  if (travelerDone(units)) return t('travelerProgress.done')
  return t('travelerProgress.count', { done: units.done, total: units.total })
}

function faceLabel(share: TravelerShare): string {
  return t('travelerProgress.face', { name: share.traveler.name, count: countLine(share) })
}
</script>

<template>
  <section
    class="strip"
    :aria-label="t('travelerProgress.title')"
    data-testid="m4-traveler-progress"
  >
    <!-- Hidden from the reader: the section already names itself. -->
    <p class="head jp-eyebrow" aria-hidden="true">{{ t('travelerProgress.title') }}</p>

    <div class="faces" :style="{ '--columns': columns }">
      <button
        v-for="share in folded.shown"
        :key="share.traveler.id"
        class="face"
        :class="{ done: travelerDone(share) }"
        :aria-pressed="isSelected(share.traveler.id)"
        :aria-label="faceLabel(share)"
        :data-testid="`m4-traveler-progress-${share.traveler.name}`"
        @click="emit('select', share.traveler.id)"
      >
        <span
          class="ring"
          :style="{ '--ring-px': `${RING_PX}px`, '--share': travelerPercent(share) }"
          aria-hidden="true"
        >
          <UserAvatar :name="share.traveler.name" :seed="share.traveler.id" :size="FACE_PX" />
        </span>
        <span class="name">{{ share.traveler.name }}</span>
        <span class="count jp-num" data-testid="m4-traveler-progress-count">
          {{ countLine(share) }}
        </span>
      </button>

      <button
        v-if="folded.hidden.length > 0"
        class="face more"
        :aria-expanded="false"
        :aria-label="t('travelerProgress.moreLabel', { n: folded.hidden.length })"
        data-testid="m4-traveler-progress-more"
        @click="expanded = true"
      >
        <span class="more-n jp-num" aria-hidden="true">+{{ folded.hidden.length }}</span>
        <span class="name">{{ t('travelerProgress.more') }}</span>
        <span class="count jp-num" data-testid="m4-traveler-progress-more-open">
          {{
            folded.hiddenOpen > 0
              ? t('travelerProgress.moreOpen', { n: folded.hiddenOpen })
              : t('travelerProgress.moreAllDone')
          }}
        </span>
      </button>
    </div>

    <button
      v-if="foldable && expanded"
      class="less"
      :aria-expanded="true"
      data-testid="m4-traveler-progress-less"
      @click="expanded = false"
    >
      {{ t('travelerProgress.less') }}
    </button>

    <!-- The rows that are for nobody, so the strip adds up to the trip line
         (FR-25.22). A line rather than a fourth face: it is not a person, and
         a fourth column would squeeze the three that are. -->
    <button
      v-if="progress.shared.total > 0"
      class="shared"
      :class="{ done: travelerDone(progress.shared) }"
      :aria-pressed="isSelected(NO_VALUE)"
      :aria-label="t('travelerProgress.sharedLabel', { count: countLine(progress.shared) })"
      data-testid="m4-traveler-progress-shared"
      @click="emit('select', NO_VALUE)"
    >
      <span class="name">{{ t('travelerProgress.shared') }}</span>
      <span class="track" aria-hidden="true">
        <i :style="{ width: `${travelerPercent(progress.shared)}%` }"></i>
      </span>
      <span class="count jp-num">{{ countLine(progress.shared) }}</span>
    </button>
  </section>
</template>

<style scoped>
.strip {
  padding: 2px 16px 12px;
}

.head {
  margin: 0 0 8px;
}

.faces {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  gap: 8px;
}

.face {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 10px 6px 8px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r);
  background: var(--jp-surface-card);
  color: var(--ct-text);
  cursor: pointer;
}

.face[aria-pressed='true'],
.shared[aria-pressed='true'] {
  border-color: var(--jp-action);
  background: color-mix(in srgb, var(--jp-action) 14%, transparent);
}

.face:focus-visible,
.shared:focus-visible,
.less:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

/* The same construction as ProgressRing: a conic arc with the hole punched
   in the card's own surface, so the face sits in it rather than on it. The
   arc is `--jp-done` — progress has one colour in this app (G-11). */
.ring {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--ring-px);
  height: var(--ring-px);
  border-radius: 50%;
  background: conic-gradient(var(--jp-done) calc(var(--share) * 1%), var(--jp-surface-border) 0);
}

.ring::before {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--jp-surface-card);
}

.ring > * {
  position: relative;
}

.face[aria-pressed='true'] .ring::before {
  background: color-mix(in srgb, var(--jp-action) 14%, var(--jp-surface-card));
}

.name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
}

.count {
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.done .count {
  color: var(--jp-done);
  font-weight: var(--jp-weight-semibold);
}

.more {
  justify-content: center;
}

.more-n {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--jp-surface-sunken);
  color: var(--jp-action);
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-bold);
}

.less {
  margin-top: 6px;
  padding: 4px 0;
  border: none;
  background: none;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.shared {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  margin-top: 8px;
  padding: 7px 12px;
  border: 1px dashed var(--ct-surface2);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-text);
  text-align: start;
  cursor: pointer;
}

.shared[aria-pressed='true'] {
  border-style: solid;
}

.track {
  height: 5px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-border);
  overflow: hidden;
}

.track i {
  display: block;
  height: 100%;
  border-radius: var(--jp-r-pill);
  background: var(--jp-done);
}
</style>
