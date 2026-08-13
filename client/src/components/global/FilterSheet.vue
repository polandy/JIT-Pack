<script setup lang="ts">
/**
 * The faceted filter panel (FR-25.11b) — one mechanism, not one per screen.
 *
 * M4 and M6 differ only in their facet set and in whether they have a
 * grouping axis at all, so this takes both as props rather than being
 * copied and drifting apart (FR-25.11g). It is deliberately dumb: values
 * arrive already labelled and counted, because the wording of a bucket
 * ("Gemeinsam", "kein Gepäck") is the screen's vocabulary and the counts
 * are the view model's arithmetic.
 *
 * A bottom sheet rather than an inline accordion: M4 is full-screen with
 * the tab bar hidden to win list height, which a panel pushing the list
 * down would hand straight back.
 */
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonToggle,
} from '@ionic/vue'
import { checkmarkOutline, chevronDownOutline } from 'ionicons/icons'
import { ref } from 'vue'

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
}

defineProps<{
  open: boolean
  facets: FilterFacet[]
  switches: FilterSwitch[]
  /** Null on screens whose tabs already do the arranging, like M6. */
  grouping: { value: string; options: GroupingOption[] } | null
  /** What the current selection would yield, stated before committing. */
  matchCount: number
  activeCount: number
}>()

const emit = defineEmits<{
  close: []
  toggleValue: [facet: string, value: string]
  selectAll: [facet: string]
  clearFacet: [facet: string]
  toggleSwitch: [key: string]
  setGrouping: [value: string]
  reset: []
}>()

// Which accordions stand open. Person first: it is the axis people reach
// for, and an all-collapsed sheet looks like it has nothing in it.
const expanded = ref<string[]>(['person'])

function toggleGroup(key: string) {
  expanded.value = expanded.value.includes(key)
    ? expanded.value.filter((k) => k !== key)
    : [...expanded.value, key]
}
</script>

<template>
  <IonModal
    :is-open="open"
    class="sheet-modal"
    data-testid="filter-sheet"
    @did-dismiss="emit('close')"
  >
    <IonHeader>
      <IonToolbar>
        <IonTitle>{{ t('filter.title') }}</IonTitle>
        <IonButtons slot="end">
          <IonButton data-testid="filter-close" @click="emit('close')">
            {{ t('common.close') }}
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>

    <IonContent class="sheet">
      <!-- Grouping leads, and is visibly *not* a filter: the two axes were
           adjacent look-alikes doing opposite things before FR-25.11. -->
      <section v-if="grouping" class="block">
        <h3>{{ t('filter.groupBy') }}</h3>
        <div class="segment">
          <button
            v-for="option in grouping.options"
            :key="option.value"
            class="seg"
            :class="{ on: option.value === grouping.value }"
            :data-testid="`group-${option.value}`"
            @click="emit('setGrouping', option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </section>

      <!-- Hiding finished rows *is* a filter, so its control lives here on
           every list screen rather than somewhere else per screen. -->
      <section v-for="control in switches" :key="control.key" class="block">
        <div class="switch-row">
          <div>
            <h3>{{ control.label }}</h3>
            <p class="hint">{{ control.hint }}</p>
          </div>
          <span class="count">{{ control.count }}</span>
          <IonToggle
            :checked="control.on"
            :data-testid="`filter-switch-${control.key}`"
            @ion-change="emit('toggleSwitch', control.key)"
          />
        </div>
      </section>

      <section v-for="facet in facets" :key="facet.key" class="block">
        <button class="facet-head" @click="toggleGroup(facet.key)">
          <span class="facet-name">{{ facet.label }}</span>
          <span class="count">
            {{
              facet.options.filter((o) => o.selected).length ||
              t('filter.allValues', { n: facet.options.length })
            }}
          </span>
          <IonIcon
            :icon="chevronDownOutline"
            class="caret"
            :class="{ shut: !expanded.includes(facet.key) }"
          />
        </button>

        <div v-if="expanded.includes(facet.key)" class="facet-body">
          <div class="facet-actions">
            <button @click="emit('selectAll', facet.key)">{{ t('common.all') }}</button>
            <button @click="emit('clearFacet', facet.key)">{{ t('common.none') }}</button>
          </div>
          <button
            v-for="option in facet.options"
            :key="option.value"
            class="option"
            :class="{ on: option.selected }"
            :data-testid="`facet-${facet.key}-${option.value}`"
            @click="emit('toggleValue', facet.key, option.value)"
          >
            <span class="box">
              <IonIcon v-if="option.selected" :icon="checkmarkOutline" />
            </span>
            <span class="option-label">{{ option.label }}</span>
            <span class="count">{{ option.count }}</span>
          </button>
        </div>
      </section>
    </IonContent>

    <!-- The outcome is stated before it is committed, next to the way out. -->
    <IonFooter>
      <IonToolbar>
        <IonButtons slot="start">
          <IonButton
            :disabled="activeCount === 0"
            data-testid="filter-reset"
            @click="emit('reset')"
          >
            {{ t('filter.reset') }}
          </IonButton>
        </IonButtons>
        <IonButtons slot="end">
          <IonButton fill="solid" data-testid="filter-apply" @click="emit('close')">
            {{ t('filter.show', { n: matchCount }) }}
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonFooter>
  </IonModal>
</template>

<style scoped>
/* A bottom sheet by height and anchoring rather than by Ionic's drag
   breakpoints: with breakpoints the modal box stays full-height and is
   translated down, which pushes ion-footer — the panel's outcome line and
   its Zurücksetzen — clean off the bottom of the screen. */
.sheet-modal {
  --height: 82%;
  --border-radius: 16px 16px 0 0;
  align-items: flex-end;
}

.sheet {
  --padding-top: 4px;
  --padding-bottom: 16px;
}

.block {
  padding: 10px 16px;
  border-bottom: 1px solid var(--ct-surface0);
}

h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.hint {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--ct-subtext0);
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.switch-row > div {
  flex: 1;
}

.segment {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.seg {
  flex: 1 1 auto;
  padding: 7px 10px;
  border: 1px solid var(--ct-surface1);
  border-radius: 10px;
  background: none;
  color: var(--ct-subtext1);
  font-size: 0.85rem;
  cursor: pointer;
}

.seg.on {
  background: var(--ct-blue);
  border-color: var(--ct-blue);
  color: var(--ct-on-accent);
  font-weight: 600;
}

.facet-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 4px 0;
  background: none;
  border: none;
  color: var(--ct-text);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.facet-name {
  flex: 1;
  text-align: start;
}

.count {
  color: var(--ct-subtext0);
  font-size: 0.8rem;
  font-weight: 500;
}

.caret {
  transition: transform 0.18s ease;
}

.caret.shut {
  transform: rotate(-90deg);
}

.facet-actions {
  display: flex;
  gap: 12px;
  padding: 6px 0;
}

.facet-actions button {
  background: none;
  border: none;
  color: var(--ct-blue);
  font-size: 0.8rem;
  cursor: pointer;
}

.option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 0;
  background: none;
  border: none;
  color: var(--ct-text);
  font-size: 0.9rem;
  cursor: pointer;
}

.option-label {
  flex: 1;
  text-align: start;
}

.box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--ct-surface2);
  border-radius: 6px;
  color: var(--ct-on-accent);
}

.option.on .box {
  background: var(--ct-blue);
  border-color: var(--ct-blue);
}
</style>
