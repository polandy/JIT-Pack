<script setup lang="ts">
/**
 * The faceted filter panel (FR-25.11b) — one mechanism, not one per screen.
 *
 * M4 and M6 differ only in their facet set and in whether they have a
 * grouping axis at all, so this takes both as props rather than being
 * copied and drifting apart (FR-25.11g). It is deliberately dumb: values
 * arrive already labelled and counted, because the wording of a bucket
 * ("Gemeinsam", "Ohne Gepäck") is the screen's vocabulary and the counts
 * are the view model's arithmetic.
 *
 * **Every tap is in force immediately** (owner, 2026-08-14). There is no
 * apply button because there is nothing left to apply: the head states the
 * outcome of what the list behind the panel is *already* showing, and the
 * other facets' counts recompute as you go — which is what makes
 * FR-25.11d visible rather than theoretical.
 *
 * **Values are chips, not an accordion.** Folding each facet behind a
 * caret is what made the panel read as cluttered: reading the current
 * filter cost one tap per axis, and the counts stayed hidden exactly while
 * they were most useful.
 *
 * A bottom sheet rather than an inline accordion: M4 is full-screen with
 * the tab bar hidden to win list height, which a panel pushing the list
 * down would hand straight back.
 *
 * Shares `SheetModal`'s chrome since U-3 (2026-09-02 review): the sized
 * variant (`height="86%"`, `grab="wide"`) keeps this panel's own dimensions
 * pixel-identical to before the fold, so folding it in cost no design
 * decision — only `SheetModal.vue` grew the two props this needed.
 */
import { IonContent, IonIcon, IonCheckbox, IonLabel } from '@ionic/vue'

import { t } from '@/i18n'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'

/** One offer inside a facet — already worded and counted by the caller. */
export interface FilterOption {
  value: string
  label: string
  count: number
  selected: boolean
}

export interface FilterFacet {
  key: string
  label: string
  /** An `ionicons` import: the axis is recognised by its glyph before its word. */
  icon: string
  options: FilterOption[]
}

/** A switch that hides a whole class of rows (FR-25.11i, FR-25.20). */
export interface FilterSwitch {
  key: string
  label: string
  hint: string
  on: boolean
  count: number
}

export interface GroupingOption {
  value: string
  label: string
  icon: string
}

defineProps<{
  open: boolean
  facets: FilterFacet[]
  switches: FilterSwitch[]
  /** Null on screens whose tabs already do the arranging, like M6. */
  grouping: { value: string; options: GroupingOption[] } | null
  /** What the list behind the panel is showing right now. */
  matchCount: number
  activeCount: number
}>()

const emit = defineEmits<{
  close: []
  toggleValue: [facet: string, value: string]
  clearFacet: [facet: string]
  toggleSwitch: [key: string]
  setGrouping: [value: string]
  reset: []
}>()
</script>

<template>
  <SheetModal
    :is-open="open"
    testid="filter-sheet"
    height="86%"
    grab="wide"
    @dismiss="emit('close')"
  >
    <IonContent class="sheet">
      <SheetHead :title="t('filter.title')" close-testid="filter-close" @close="emit('close')">
        <template #meta>
          <!-- The outcome of what is already in force, not a promise. -->
          <span data-testid="filter-count">{{ t('filter.showing', { n: matchCount }) }}</span>
        </template>
        <template #trail>
          <!-- Quiet on purpose: it appears only when there is something to
               undo, and it must not compete with the way out. -->
          <button
            v-if="activeCount > 0"
            class="reset"
            data-testid="filter-reset"
            @click="emit('reset')"
          >
            {{ t('filter.reset') }}
          </button>
        </template>
      </SheetHead>

      <!-- Grouping leads, and is visibly *not* a filter: the two axes were
           adjacent look-alikes doing opposite things before FR-25.11. -->
      <section v-if="grouping" class="sec">
        <h3 class="sl">{{ t('filter.groupBy') }}</h3>
        <div class="segment">
          <button
            v-for="option in grouping.options"
            :key="option.value"
            class="seg"
            :class="{ on: option.value === grouping.value }"
            :data-testid="`group-${option.value}`"
            @click="emit('setGrouping', option.value)"
          >
            <IonIcon :icon="option.icon" />
            {{ option.label }}
          </button>
        </div>
      </section>

      <section v-for="facet in facets" :key="facet.key" class="sec">
        <h3 class="sl">
          <IonIcon :icon="facet.icon" />
          {{ facet.label }}
          <button
            v-if="facet.options.some((o) => o.selected)"
            class="clear"
            :data-testid="`facet-clear-${facet.key}`"
            @click="emit('clearFacet', facet.key)"
          >
            {{ t('filter.reset') }}
          </button>
          <span v-else class="all">{{ t('filter.allValues') }}</span>
        </h3>
        <div class="chips">
          <button
            v-for="option in facet.options"
            :key="option.value"
            class="chip"
            :class="{ on: option.selected }"
            :data-testid="`facet-${facet.key}-${option.value}`"
            @click="emit('toggleValue', facet.key, option.value)"
          >
            {{ option.label }}<span class="n">{{ option.count }}</span>
          </button>
        </div>
      </section>

      <!-- Both switches hide a class of rows, so they render from one shape
           and sit together at the foot: the rarely-touched pair. -->
      <section v-if="switches.length > 0" class="sec">
        <label v-for="control in switches" :key="control.key" class="switch">
          <IonCheckbox
            :checked="control.on"
            :data-testid="`filter-switch-${control.key}`"
            @ion-change="emit('toggleSwitch', control.key)"
          />
          <IonLabel>
            <b>{{ control.label }}</b>
            <span>{{ control.hint }} · {{ control.count }}</span>
          </IonLabel>
        </label>
      </section>
    </IonContent>
  </SheetModal>
</template>

<style scoped>
.sheet {
  flex: 1;
  min-height: 0;
  --background: var(--ct-mantle);
  --padding-start: 16px;
  --padding-end: 16px;
  --padding-bottom: 24px;
}

.grab {
  width: 38px;
  height: 4px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface2);
  margin: 10px auto 2px;
}

.reset {
  flex: none;
  background: none;
  border: none;
  color: var(--ct-glacier);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.sec {
  padding: 13px 0;
  border-top: 1px solid var(--ct-surface0);
}

.sl {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-semibold);
  letter-spacing: var(--jp-tracking-label);
  text-transform: uppercase;
  color: var(--ct-subtext0);
}

.sl ion-icon {
  font-size: var(--jp-icon-sm);
}

.all,
.clear {
  margin-left: auto;
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
  letter-spacing: 0;
  text-transform: none;
}

.all {
  color: var(--ct-overlay0);
}

.clear {
  background: none;
  border: none;
  color: var(--ct-glacier);
  cursor: pointer;
}

.segment {
  display: flex;
  gap: 6px;
}

.seg {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 9px 4px;
  border: 1px solid transparent;
  border-radius: var(--jp-r-md);
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.seg ion-icon {
  font-size: var(--jp-icon-sm);
}

.seg.on {
  background: var(--ct-glacier);
  border-color: var(--ct-glacier);
  color: var(--ct-on-accent);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border: 1px solid transparent;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.chip .n {
  color: var(--ct-overlay0);
  font-size: var(--jp-text-2xs);
}

.chip.on {
  /* Mixed from the token, never re-typed as a literal: a second copy of
     a palette value is a second place to change it (invariant 9). */
  background: color-mix(in srgb, var(--ct-glacier) 16%, transparent);
  border-color: var(--ct-glacier);
  color: var(--ct-text);
}

.chip.on .n {
  color: var(--ct-glacier);
}

.switch {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
}

.switch b {
  display: block;
  font-size: var(--jp-text-sm);
}

.switch span {
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}
</style>
