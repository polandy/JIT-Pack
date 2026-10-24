<script setup lang="ts">
/**
 * An idea's links in the detail view (FR-29.22), one card each in their
 * order, opening in a new tab: the link's name — its label, else its site —
 * with the site beneath where the name is a label.
 */
import { IonIcon } from '@ionic/vue'
import { linkOutline, openOutline } from 'ionicons/icons'

import { linkSite } from './domain/ideas'
import { linkName, type IdeaLinkEntry } from './domain/links'

defineProps<{ links: readonly IdeaLinkEntry[] }>()
</script>

<template>
  <div v-if="links.length > 0" class="link-cards">
    <a
      v-for="link in links"
      :key="link.id"
      class="link-card"
      :href="link.url"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="idea-detail-link"
    >
      <IonIcon :icon="linkOutline" aria-hidden="true" />
      <span class="text">
        <span class="name">{{ linkName(link, null) }}</span>
        <span v-if="linkName(link, null) !== linkSite(link.url)" class="site">
          {{ linkSite(link.url) }}
        </span>
      </span>
      <IonIcon class="out" :icon="openOutline" aria-hidden="true" />
    </a>
  </div>
</template>

<style scoped>
.link-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--jp-action);
  text-decoration: none;
}

.text {
  flex: 1;
  min-width: 0;
}

.name,
.site {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  font-weight: var(--jp-weight-semibold);
}

.site {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.out {
  color: var(--ct-subtext0);
}
</style>
