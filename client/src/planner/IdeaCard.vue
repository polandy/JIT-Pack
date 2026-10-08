<script setup lang="ts">
/**
 * One idea on the board (FR-29.6): its cover as a flat banner when it has
 * pictures (FR-29.5) — or its first GPX track's line where it has none but a
 * track (FR-29.17) — its title, the tag, the rain mark, the link's site and
 * the first track's distance and climb as chips, and a foot with the two tallies and the discussion's size.
 * Tapping it opens the idea. On the shortlist, while the trip has its dates,
 * it also says which day it is planned on, or that it has none (FR-29.14).
 *
 * The tallies show who voted, as avatars, because votes are open (FR-29.3);
 * where nobody else votes — Local and Single-User Mode, a trip nobody shares
 * — the foot shows the discussion alone (G-8).
 */
import { IonIcon, IonSpinner } from '@ionic/vue'
import {
  calendarOutline,
  bicycleOutline,
  chatbubbleOutline,
  linkOutline,
  walkOutline,
  thumbsDownOutline,
  thumbsUpOutline,
  umbrellaOutline,
} from 'ionicons/icons'

import { computed } from 'vue'

import TrackLines from '@/components/global/TrackLines.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { trackHueClass } from '@/lib/trackColors'
import { decodeLine } from '@/domain/track'
import { t } from '@/i18n'
import type { NameOf } from '@/lib/rowFacts'
import { shortDueDay } from '@/lib/taskDueText'
import { tracksSummary } from '@/lib/trackFormat'
import type { IdeaImage, IdeaTrack } from '@/types/domain'
import { isPlanTime } from './domain/dayPlan'
import { linkSite, type IdeaCard } from './domain/ideas'
import IdeaPicture from './IdeaPicture.vue'

const props = defineProps<{
  card: IdeaCard
  /** The idea's pictures, cover first; the banner shows the cover. */
  pictures: IdeaImage[]
  /** The idea's GPX tracks in their order (FR-29.17). */
  tracks: IdeaTrack[]
  /** A link's picture on its way (FR-29.16): the banner shows it coming. */
  pictureComing: boolean
  /** Whether votes are shown at all (FR-29.3's G-8). */
  votesShown: boolean
  nameOf: NameOf
  /** Whether the card says its day (FR-29.14): a shortlisted idea on a trip with dates. */
  planShown: boolean
}>()

const emit = defineEmits<{ open: [] }>()

/** Every track's line, the first one in front — the banner where there is no picture. */
const lines = computed(() =>
  props.tracks.map((track, index) => ({
    id: track.id,
    points: decodeLine(track.line),
    hueClass: trackHueClass(index),
    chosen: index === 0,
  })),
)

/** The first track's figures, and how many more there are. */
const trackFacts = computed(() => tracksSummary(props.tracks))
</script>

<template>
  <button
    type="button"
    class="idea-card"
    :data-testid="`idea-card-${card.idea.id}`"
    :data-state="card.idea.state"
    @click="emit('open')"
  >
    <span v-if="pictures[0]" class="banner" :data-testid="`idea-card-cover-${card.idea.id}`">
      <IdeaPicture :image="pictures[0]" alt="" />
      <span
        v-if="pictures.length > 1"
        class="count jp-num"
        :data-testid="`idea-card-pictures-${card.idea.id}`"
      >
        {{ t('ideas.pictureCount', { n: pictures.length }) }}
      </span>
    </span>
    <span
      v-else-if="pictureComing"
      class="banner coming"
      :data-testid="`idea-card-picture-coming-${card.idea.id}`"
    >
      <IonSpinner name="dots" aria-hidden="true" />
      <span>{{ t('ideas.pictureComing') }}</span>
    </span>
    <span
      v-else-if="tracks.length > 0"
      class="banner trace"
      :data-testid="`idea-card-trace-${card.idea.id}`"
    >
      <TrackLines :lines="lines" frame-all :ends="false" />
    </span>
    <span class="title">{{ card.idea.title }}</span>
    <span
      v-if="card.idea.tag || card.idea.rain_proof || card.idea.link || trackFacts"
      class="chips"
    >
      <span v-if="card.idea.tag" class="chip" :data-testid="`idea-card-tag-${card.idea.id}`">
        {{ t(`ideas.tag.${card.idea.tag}`) }}
      </span>
      <span
        v-if="card.idea.rain_proof"
        class="chip rain"
        :data-testid="`idea-card-rain-${card.idea.id}`"
      >
        <IonIcon :icon="umbrellaOutline" aria-hidden="true" />
        {{ t('ideas.rainProofShort') }}
      </span>
      <span v-if="card.idea.link" class="site" :data-testid="`idea-card-link-${card.idea.id}`">
        <IonIcon :icon="linkOutline" aria-hidden="true" />
        {{ linkSite(card.idea.link) }}
      </span>
      <span v-if="trackFacts" class="chip jp-num" :data-testid="`idea-card-track-${card.idea.id}`">
        <IonIcon
          :icon="trackFacts.kind === 'bike' ? bicycleOutline : walkOutline"
          aria-hidden="true"
        />
        {{ trackFacts.text }}
      </span>
    </span>
    <span
      v-if="planShown"
      class="plan-chip"
      :class="{ none: !card.idea.planned_on }"
      :data-testid="`idea-card-plan-${card.idea.id}`"
    >
      <IonIcon :icon="calendarOutline" aria-hidden="true" />
      <template v-if="card.idea.planned_on">
        {{ shortDueDay(card.idea.planned_on) }}
        <template v-if="isPlanTime(card.idea.planned_at)"> · {{ card.idea.planned_at }}</template>
      </template>
      <template v-else>{{ t('ideas.notPlanned') }}</template>
    </span>
    <span v-if="votesShown || card.comments > 0" class="foot jp-num">
      <template v-if="votesShown">
        <span
          class="tally up"
          :aria-label="t('ideas.upCount', { n: card.tally.up.length })"
          :data-testid="`idea-card-up-${card.idea.id}`"
        >
          <IonIcon :icon="thumbsUpOutline" aria-hidden="true" />
          {{ card.tally.up.length }}
          <UserAvatar
            v-for="userId in card.tally.up"
            :key="userId"
            class="voter"
            :name="nameOf(userId)"
            :seed="userId"
            :size="16"
          />
        </span>
        <span
          class="tally down"
          :aria-label="t('ideas.downCount', { n: card.tally.down.length })"
          :data-testid="`idea-card-down-${card.idea.id}`"
        >
          <IonIcon :icon="thumbsDownOutline" aria-hidden="true" />
          {{ card.tally.down.length }}
          <UserAvatar
            v-for="userId in card.tally.down"
            :key="userId"
            class="voter"
            :name="nameOf(userId)"
            :seed="userId"
            :size="16"
          />
        </span>
      </template>
      <span
        v-if="card.comments > 0"
        class="comments"
        :aria-label="t('ideas.commentCount', { n: card.comments })"
        :data-testid="`idea-card-comments-${card.idea.id}`"
      >
        <IonIcon :icon="chatbubbleOutline" aria-hidden="true" />
        {{ card.comments }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.idea-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid var(--jp-surface-border);
  background: transparent;
  color: var(--ct-text);
  text-align: start;
  cursor: pointer;
}

.idea-card:last-child {
  border-bottom: 0;
}

.banner {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 21 / 9;
  max-width: 100%;
  margin-bottom: 2px;
  overflow: hidden;
  border-radius: var(--jp-r-sm);
}

.banner.trace {
  padding: 8px;
  background-color: var(--jp-surface-sunken);
  background-image:
    linear-gradient(var(--jp-surface-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--jp-surface-border) 1px, transparent 1px);
  background-size: 20px 20px;
}

.banner.coming {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.count {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 8px;
  border-radius: var(--jp-r-pill);
  background: color-mix(in srgb, var(--ct-crust) 72%, transparent);
  color: var(--ct-text);
  font-size: var(--jp-text-xs);
}

.title {
  font-weight: var(--jp-weight-semibold);
  overflow-wrap: anywhere;
}

.plan-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
}

.plan-chip.none {
  border-style: dashed;
  border-color: var(--ct-surface2);
  background: transparent;
  color: var(--ct-subtext0);
}

.chips,
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
}

.chip.rain {
  color: var(--jp-action);
}

.site {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--jp-action);
  font-size: var(--jp-text-xs);
}

.foot {
  width: 100%;
  gap: 12px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.tally,
.comments {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.comments {
  margin-inline-start: auto;
}

.voter + .voter {
  margin-inline-start: -6px;
}

ion-icon {
  font-size: var(--jp-icon-xs);
}
</style>
