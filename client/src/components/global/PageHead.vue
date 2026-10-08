<script setup lang="ts">
/**
 * The page's own name, in the page (G-9): a display-face `h1` in the
 * content, rather than an `ion-title` in the app bar at the size an
 * `ion-title` allows, beside as many glyphs as the screen registered.
 *
 * The frame renders it, once, for every screen that registers a title
 * (`App.vue`, from `useHeaderTitle`) — which is what spares twenty
 * drill-downs a decision each, and what keeps exactly one element in the
 * document carrying the page's name. The tab roots register a title like
 * everything else; a control beside a screen's name is a bar action, which
 * is where a screen-level action lives.
 */
import { computed } from 'vue'

import type { HeadMeta } from '@/composables/shared/useHeaderTitle'

const props = defineProps<{
  title: string
  /** The line under the name — the trip a sub-screen belongs to, a step, what is due. */
  meta?: HeadMeta | null
  /** Yield the space to the content below — see the style block (M4). */
  collapsed?: boolean
}>()

/** The meta's runs when it is more than a sentence; null for a plain one. */
const runs = computed(() => (typeof props.meta === 'string' ? null : (props.meta ?? null)))
</script>

<template>
  <div class="page-head" :class="{ collapsed }" data-testid="page-head">
    <div class="head-body">
      <h1 class="head-title jp-page-title" data-testid="header-title">{{ title }}</h1>
      <p v-if="meta" class="head-meta jp-meta" data-testid="header-meta">
        <template v-if="runs === null">{{ meta }}</template>
        <template v-for="(run, i) in runs ?? []" :key="i">
          <button
            v-if="run.act"
            type="button"
            class="meta-act"
            :class="{ late: run.late }"
            :data-testid="run.testid"
            @click="run.act()"
          >
            {{ run.text }}
          </button>
          <span v-else :class="{ late: run.late }">{{ run.text }}</span>
        </template>
      </p>
      <!-- What else this page's subject has (FR-21.21). Inside the body, so
           it yields with the name on a screen that collapses its head. -->
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page-head {
  /* A one-track grid so the collapse is a *fraction* of the head's own
     height rather than a guessed ceiling: a `max-height` large enough for
     a four-line trip name is also the distance a two-line one has to
     travel, and one short enough to animate clips the long one. */
  display: grid;
  grid-template-rows: 1fr;
  padding: 6px 16px 12px;
  transition:
    grid-template-rows 0.18s ease,
    padding 0.18s ease;
}

.head-body {
  overflow: hidden;
  min-height: 0;
}

/* Scrolling down takes the page's name with the line under it (G-9,
   ADR-050). You know which packing list you are on, and
   the rows are what the screen is for; any upward scroll brings it back.
   Only a screen that drives `collapsed` ever loses its head. Clipped
   rather than faded, like the line under it: a half-transparent name reads
   as two lines printed on top of each other while the list slides past. */
.page-head.collapsed {
  grid-template-rows: 0fr;
  padding-block: 0;
}

@media (prefers-reduced-motion: reduce) {
  .page-head {
    transition: none;
  }
}

/* A long trip name wraps rather than widening the column it sits in. */
.head-title {
  margin: 0;
  overflow-wrap: anywhere;
}

.head-meta {
  margin: 4px 0 0;
}

/* A count that leads to its block (FR-7.11): a link in the line, not a control beside it. */
.meta-act {
  display: inline;
  padding: 0;
  border: 0;
  background: none;
  color: var(--jp-action);
  font: inherit;
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.late {
  color: var(--ct-ember);
}
</style>
