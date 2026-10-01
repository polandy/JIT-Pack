<script setup lang="ts">
/**
 * One track's figures and its time (FR-29.17): distance, ascent, descent
 * and the highest point, then how long it takes — the kind and *Mit Kind*
 * chosen by hand, the moving time from `domain/track.ts`, the travellers'
 * own pauses on a stepper, and the sum. Under it, small, what the time
 * assumes. Each change is handed up at once; nothing is held here.
 */
import { IonIcon } from '@ionic/vue'
import { accessibilityOutline, bicycleOutline, walkOutline } from 'ionicons/icons'
import { computed } from 'vue'

import { TRACK_KIND, type TrackKind } from '@/api/types'
import { PAUSE_MAX_MIN, movingMinutes, paceOf, stepPause } from '@/domain/track'
import { formatNumber, t } from '@/i18n'
import { formatDistance, formatDuration, formatMetres } from '@/lib/trackFormat'
import type { TrackFields } from '@/types/domain'

const props = defineProps<{ track: TrackFields }>()

const emit = defineEmits<{
  update: [settings: Partial<Pick<TrackFields, 'kind' | 'with_kid' | 'pause_min'>>]
}>()

const KIND_ICON: Record<TrackKind, string> = { hike: walkOutline, bike: bicycleOutline }
const KINDS: TrackKind[] = [TRACK_KIND.hike, TRACK_KIND.bike]

const distance = computed(() => formatDistance(props.track.distance_m))

const heights = computed(() => props.track.max_ele_m !== null)

const moving = computed(() => movingMinutes(props.track))

const paceNote = computed(() => {
  const pace = paceOf(props.track.kind, props.track.with_kid)
  const values = {
    flat: formatNumber(pace.flatKmh),
    up: formatNumber(pace.upMh),
    down: formatNumber(pace.downMh ?? 0),
  }
  if (props.track.kind === TRACK_KIND.bike) {
    return t(props.track.with_kid ? 'track.paceBikeKid' : 'track.paceBike', values)
  }
  return props.track.with_kid ? t('track.paceHikeKid', values) : t('track.paceHike')
})
</script>

<template>
  <div class="track-figures">
    <dl class="figures">
      <div class="fig">
        <dt>{{ t('track.distance') }}</dt>
        <dd class="jp-num" data-testid="track-distance">{{ distance }}</dd>
      </div>
      <div class="fig">
        <dt>{{ t('track.ascent') }}</dt>
        <dd class="jp-num" data-testid="track-ascent">
          {{ heights ? `↑ ${formatMetres(track.ascent_m ?? 0)}` : '–' }}
        </dd>
      </div>
      <div class="fig">
        <dt>{{ t('track.descent') }}</dt>
        <dd class="jp-num" data-testid="track-descent">
          {{ heights ? `↓ ${formatMetres(track.descent_m ?? 0)}` : '–' }}
        </dd>
      </div>
      <div class="fig">
        <dt>{{ t('track.highest') }}</dt>
        <dd class="jp-num" data-testid="track-highest">
          {{ heights ? formatMetres(track.max_ele_m ?? 0) : '–' }}
        </dd>
      </div>
    </dl>

    <div class="timebox">
      <div class="controls">
        <div class="kinds" role="group" :aria-label="t('track.kindLabel')">
          <button
            v-for="kind in KINDS"
            :key="kind"
            type="button"
            class="kind"
            :aria-pressed="track.kind === kind ? 'true' : 'false'"
            :data-testid="`track-kind-${kind}`"
            @click="track.kind !== kind && emit('update', { kind })"
          >
            <IonIcon :icon="KIND_ICON[kind]" aria-hidden="true" />
            {{ t(`track.kind.${kind}`) }}
          </button>
        </div>
        <button
          type="button"
          class="kid"
          :aria-pressed="track.with_kid ? 'true' : 'false'"
          data-testid="track-kid"
          @click="emit('update', { with_kid: !track.with_kid })"
        >
          <IonIcon :icon="accessibilityOutline" aria-hidden="true" />
          {{ t('track.withKid') }}
        </button>
      </div>

      <div class="sum">
        <div class="term">
          <span class="value jp-num" data-testid="track-moving">{{ formatDuration(moving) }}</span>
          <span class="label">{{ t(`track.moving.${track.kind}`) }}</span>
        </div>
        <span class="op" aria-hidden="true">+</span>
        <div class="term">
          <span class="stepper">
            <button
              type="button"
              :disabled="track.pause_min <= 0"
              :aria-label="t('track.lessPause')"
              data-testid="track-pause-less"
              @click="emit('update', { pause_min: stepPause(track.pause_min, -1) })"
            >
              −
            </button>
            <span class="value jp-num" data-testid="track-pause">{{
              formatDuration(track.pause_min)
            }}</span>
            <button
              type="button"
              :disabled="track.pause_min >= PAUSE_MAX_MIN"
              :aria-label="t('track.morePause')"
              data-testid="track-pause-more"
              @click="emit('update', { pause_min: stepPause(track.pause_min, 1) })"
            >
              +
            </button>
          </span>
          <span class="label">{{ t('track.pauses') }}</span>
        </div>
        <span class="op" aria-hidden="true">=</span>
        <div class="term total">
          <span class="value jp-num" data-testid="track-total">
            {{ formatDuration(moving + track.pause_min) }}
          </span>
          <span class="label">{{ t('track.total') }}</span>
        </div>
      </div>
    </div>
    <p class="fineprint" data-testid="track-pace">{{ paceNote }}</p>
  </div>
</template>

<style scoped>
.track-figures {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.figures {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin: 0;
}

.fig {
  display: flex;
  flex-direction: column-reverse;
  gap: 1px;
  min-width: 0;
}

.fig dt {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
}

.fig dd {
  margin: 0;
  color: var(--ct-text);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  white-space: nowrap;
}

.timebox {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kinds {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
}

.kind,
.kid {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  border-radius: var(--jp-r-pill);
  background: transparent;
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.kind[aria-pressed='true'] {
  background: var(--jp-action);
  color: var(--ct-base);
  font-weight: var(--jp-weight-semibold);
}

.kid {
  border: 1px solid var(--jp-surface-border);
  background: var(--jp-surface-card);
}

.kid[aria-pressed='true'] {
  border-color: var(--jp-done);
  background: color-mix(in srgb, var(--jp-done) 16%, transparent);
  color: var(--ct-text);
}

.sum {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 4px;
}

.term {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.value {
  color: var(--ct-text);
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  white-space: nowrap;
}

.total .value {
  color: var(--jp-action);
}

.label {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
}

.op {
  padding-top: 2px;
  color: var(--ct-subtext0);
}

.stepper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stepper button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--jp-surface-border);
  border-radius: 50%;
  background: var(--jp-surface-card);
  color: var(--ct-text);
  font: inherit;
  cursor: pointer;
}

.stepper button:disabled {
  opacity: 0.4;
  cursor: default;
}

.fineprint {
  margin: 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
}

ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
