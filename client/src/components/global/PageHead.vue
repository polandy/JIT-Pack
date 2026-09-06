<script setup lang="ts">
/**
 * The page's own name, in the page (G-9).
 *
 * Until now a drill-down's name lived in the app bar's `ion-title`, at the
 * size an `ion-title` allows, beside as many glyphs as the screen had
 * registered. The three tab roots had already written the other version by
 * hand — a display-face `h1` in the content, with the screen's one control
 * beside it — three times over. This is that version, named once.
 *
 * The frame renders it, once, for every screen that registers a title
 * (`App.vue`, from `useHeaderTitle`) — which is what spares twenty
 * drill-downs a decision each, and what keeps exactly one element in the
 * document carrying the page's name. The three tab roots that used to write
 * their own now register a title like everything else; the control each of
 * them kept beside its name is a bar action, which is where a screen-level
 * action already lived.
 */
defineProps<{
  title: string
  /** The line under the name — the trip a sub-screen belongs to, a step. */
  meta?: string | null
}>()
</script>

<template>
  <div class="page-head" data-testid="page-head">
    <h1 class="head-title jp-page-title" data-testid="header-title">{{ title }}</h1>
    <p v-if="meta" class="head-meta jp-meta" data-testid="header-meta">{{ meta }}</p>
  </div>
</template>

<style scoped>
.page-head {
  padding: 6px 16px 12px;
}

/* A long trip name wraps rather than widening the column it sits in. */
.head-title {
  margin: 0;
  overflow-wrap: anywhere;
}

.head-meta {
  margin: 4px 0 0;
}
</style>
