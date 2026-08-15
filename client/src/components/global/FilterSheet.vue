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
 */
import { IonModal, IonContent, IonIcon, IonCheckbox, IonLabel } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'

import { t } from '@/i18n'

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
  <IonModal
    :is-open="open"
    class="sheet-modal"
    data-testid="filter-sheet"
    @did-dismiss="emit('close')"
  >
    <IonContent class="sheet">
      <div class="grab" />

      <header class="head">
        <div class="titles">
          <h2>{{ t('filter.title') }}</h2>
          <!-- The outcome of what is already in force, not a promise. -->
          <p class="count" data-testid="filter-count">
            {{ t('filter.showing', { n: matchCount }) }}
          </p>
        </div>
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
        <button
          class="x"
          data-testid="filter-close"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <IonIcon :icon="closeOutline" />
        </button>
      </header>

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
  </IonModal>
</template>

<style scoped>
/* A bottom sheet by height and anchoring rather than by Ionic's drag
   breakpoints: with breakpoints the modal box stays full-height and is
   translated down, which pushed the panel's own controls off the screen.
   The lighter surface, the rim and the shadow are what lift it off the list
   behind it — at --ct-base it read as part of the same page. */
.sheet-modal {
  --height: 86%;
  --border-radius: var(--jp-r-lg) var(--jp-r-lg) 0 0;
  --background: var(--ct-mantle);
  --box-shadow: var(--jp-shadow-sheet);
  --backdrop-opacity: 0.62;
  align-items: flex-end;
}

.sheet {
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

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0 12px;
}

.titles {
  flex: 1;
  min-width: 0;
}

.head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.count {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ct-subtext0);
}

.reset {
  flex: none;
  background: none;
  border: none;
  color: var(--ct-blue);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: none;
  border-radius: 50%;
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  cursor: pointer;
}

.x ion-icon {
  font-size: 18px;
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
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ct-subtext0);
}

.sl ion-icon {
  font-size: 15px;
}

.all,
.clear {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.all {
  color: var(--ct-overlay0);
}

.clear {
  background: none;
  border: none;
  color: var(--ct-blue);
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
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.seg ion-icon {
  font-size: 17px;
}

.seg.on {
  background: var(--ct-blue);
  border-color: var(--ct-blue);
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
  font-size: 0.82rem;
  cursor: pointer;
}

.chip .n {
  color: var(--ct-overlay0);
  font-size: 0.72rem;
}

.chip.on {
  /* Mixed from the token, never re-typed as a literal: a second copy of
     a palette value is a second place to change it (invariant 9). */
  background: color-mix(in srgb, var(--ct-blue) 16%, transparent);
  border-color: var(--ct-blue);
  color: var(--ct-text);
}

.chip.on .n {
  color: var(--ct-blue);
}

.switch {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
}

.switch b {
  display: block;
  font-size: 0.85rem;
}

.switch span {
  font-size: 0.75rem;
  color: var(--ct-subtext0);
}
</style>
