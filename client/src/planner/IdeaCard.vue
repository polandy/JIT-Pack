<script setup lang="ts">
/**
 * One idea on the board (FR-29.6): its title, the tag, the rain mark and the
 * link's site as chips, and a foot with the two tallies and the discussion's
 * size. Tapping it opens the idea.
 *
 * The tallies show who voted, as avatars, because votes are open (FR-29.3);
 * where nobody else votes — Local and Single-User Mode, a trip nobody shares
 * — the foot shows the discussion alone (G-8).
 */
import { IonIcon } from '@ionic/vue'
import {
  chatbubbleOutline,
  linkOutline,
  thumbsDownOutline,
  thumbsUpOutline,
  umbrellaOutline,
} from 'ionicons/icons'

import UserAvatar from '@/components/global/UserAvatar.vue'
import { t } from '@/i18n'
import type { NameOf } from '@/lib/rowFacts'
import { linkSite, type IdeaCard } from './domain/ideas'

defineProps<{
  card: IdeaCard
  /** Whether votes are shown at all (FR-29.3's G-8). */
  votesShown: boolean
  nameOf: NameOf
}>()

const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <button
    type="button"
    class="idea-card"
    :data-testid="`idea-card-${card.idea.id}`"
    :data-state="card.idea.state"
    @click="emit('open')"
  >
    <span class="title">{{ card.idea.title }}</span>
    <span v-if="card.idea.tag || card.idea.rain_proof || card.idea.link" class="chips">
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

.title {
  font-weight: var(--jp-weight-semibold);
  overflow-wrap: anywhere;
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
