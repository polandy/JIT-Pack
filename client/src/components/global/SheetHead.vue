<script setup lang="ts">
/**
 * The head of a bottom sheet: what the sheet is about, the line under it,
 * and the way out (§3.25, G-13).
 *
 * Eight sheets had written this by hand, and the drift was not in the
 * markup — it was in the close button, which existed in two designs split
 * four against four: a filled circle on `--ct-surface0` at the round-control
 * size, and a 32px ghost in `--ct-overlay0`. The same control, two
 * appearances, and nothing recording which was meant. The concept prototype
 * settles it: a filled circle on the sunken plane with a hairline, at the
 * round-control size the token table already carries.
 *
 * The second line was two sizes as well (`--jp-text-xs` in three sheets,
 * `--jp-text-sm` in two). It is `.jp-meta` now — the role the page head
 * already uses for exactly this fact, one step down from the title and
 * recessive.
 *
 * Three slots, because what varies between sheets is what sits *around* the
 * two lines: `lead` for a mark, a thumbnail or a state glyph; `meta` where
 * the second line carries more than a string (M11's overload warning);
 * `trail` for the save indicator.
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'

import { t } from '@/i18n'

withDefaults(
  defineProps<{
    title: string
    /** The line under the title. A `meta` slot overrides it. */
    meta?: string | null
    /** Put on the title, for the cases that address the sheet by its name. */
    titleTestid?: string
    /** Put on the close button, for the cases that leave the sheet. */
    closeTestid?: string
  }>(),
  { meta: null, titleTestid: undefined, closeTestid: undefined },
)

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <header class="head">
    <slot name="lead" />
    <div class="titles">
      <h1 class="jp-sheet-title" :data-testid="titleTestid">{{ title }}</h1>
      <p v-if="$slots.meta || meta" class="meta jp-meta">
        <slot name="meta">{{ meta }}</slot>
      </p>
    </div>
    <slot name="trail" />
    <button
      class="x"
      :data-testid="closeTestid"
      :aria-label="t('common.close')"
      @click="emit('close')"
    >
      <IonIcon :icon="closeOutline" />
    </button>
  </header>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 0 12px;
}

.titles {
  flex: 1;
  min-width: 0;
}

/* The role names type and no spacing, so the browser's own h1 margin is
   still there to decline — four sheets used to decline it separately, and
   the one that forgot had its title start half a line below the glyph it
   was supposed to align with. */
.titles h1 {
  margin: 0;
}

.meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 3px 0 0;
}

/* A circle is a shape, not a size — `50%` is the gate's own carve-out. */
.x {
  display: grid;
  place-items: center;
  width: var(--jp-control-round);
  height: var(--jp-control-round);
  flex: none;
  border: 1px solid var(--jp-surface-border);
  border-radius: 50%;
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}
</style>
