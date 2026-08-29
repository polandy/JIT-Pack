<script setup lang="ts">
/**
 * FR-25.13d — the inventory browse-sheet, the composer's second posture.
 *
 * The chip rows (FR-25.13c) answer "offer me something"; this sheet answers
 * "let me work through it": the whole inventory, filtered along the M9 tag
 * axis (any of an item's tags, FR-24.2) and grouped like M9 by the primary
 * one, with one-tap rows that stay open for runs. Together they are the two
 * ways FR-25.13's "one way to add" becomes — *Erfassen* (the composer) and
 * *Zusammenstellen* (this sheet) — on every list screen alike, because the
 * shared composer is the only door in.
 *
 * A carried item is a **state, not an error**: it stays listed — hiding it
 * would imply it does not exist — but says "already in" where the free rows
 * carry the add control, and it is not tappable. After a tap the caller's
 * carried set grows and the row flips right here, which is the feedback a
 * run needs. Free text is demoted to an explicit footer line that hands
 * back to the composer's field; the sheet itself never raises a keyboard.
 *
 * **FR-25.13e** lets that stance be put away for a run: one opt-in switch
 * hides the carried rows, and what it hides is the set carried **when the
 * switch was flipped** — never what this run adds. A row vanishing under the
 * finger would reflow the list into the next tap and would delete the flip
 * above, which is the only feedback the sheet has; so a row added while the
 * sheet is open stays where it is and says "added". The hidden rows stay
 * present as a count, and every state this can empty offers a way back.
 */
import { IonIcon } from '@ionic/vue'
import { addCircleOutline, checkmarkOutline, closeOutline, createOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import { browseHideCarried } from '@/composables/useBrowseHideCarried'
import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import { UNTAGGED_KEY } from '@/domain/tags'
import type { MasterItem } from '@/types/domain'

const props = defineProps<{
  /** Item ids the scope already carries — rendered as "already in". */
  carriedItemIds: string[]
}>()

const emit = defineEmits<{
  /** One tap on a free row; the sheet stays open for the run. */
  add: [item: MasterItem]
  /** The footer line: back to the composer's field for a new name. */
  freeText: []
  close: []
}>()

const masterStore = useMasterStore()

/** `null` = the "Alle" chip: no tag filter (the M9 idiom). */
const tagFilter = ref<string | null>(null)

const { hideCarried, toggle: toggleHideCarried } = browseHideCarried()

/**
 * The FR-25.13e snapshot: item ids the scope carried when this posture began.
 * Taken on exactly three events — the sheet being created (which is what
 * re-opening it is, the caller keys it per run), the switch going on, and the
 * tag filter changing.
 */
// Taken during setup rather than on mount: a sheet re-opened with the switch
// already on must paint filtered, never one frame of "added just now" rows.
const hidden = ref<ReadonlySet<string>>(new Set(props.carriedItemIds))

function retakeSnapshot(): void {
  hidden.value = new Set(props.carriedItemIds)
}

watch(hideCarried, (on) => {
  if (on) retakeSnapshot()
})
watch(tagFilter, retakeSnapshot)

/**
 * The M9 rule verbatim: a tag filter matches an item with the tag anywhere
 * in its set, not only as primary — filtering by *Sommer* has to surface
 * the swimsuit that is filed under *Kleidung*.
 */
const filtered = computed<MasterItem[]>(() => {
  if (tagFilter.value === null) return masterStore.activeItemList
  const onTag = new Set(
    masterStore.itemTagList.filter((a) => a.tag_id === tagFilter.value).map((a) => a.item_id),
  )
  return masterStore.activeItemList.filter((item) => onTag.has(item.id))
})

/** What the list actually renders once the FR-25.13e switch has had its say. */
const shown = computed<MasterItem[]>(() =>
  hideCarried.value ? filtered.value.filter((item) => !hidden.value.has(item.id)) : filtered.value,
)

const groups = computed(() => masterStore.itemsByPrimaryTag(shown.value))

const carried = computed(() => new Set(props.carriedItemIds))

/**
 * How many rows the switch is hiding, or would hide — always counted **inside
 * the current tag filter**, because a number that does not match what the
 * screen would hide is one the user can catch out.
 */
const hideableCount = computed(
  () =>
    filtered.value.filter((item) =>
      hideCarried.value ? hidden.value.has(item.id) : carried.value.has(item.id),
    ).length,
)

const noMatch = computed(() => filtered.value.length === 0)

/** Everything the filter matches is carried and hidden — success, not emptiness. */
const allCarried = computed(() => !noMatch.value && shown.value.length === 0)

/**
 * A carried row added during *this* run: it stays visible under the switch and
 * says so, so the run keeps its ledger (see the FR-25.13e note above).
 */
function isAddedNow(id: string): boolean {
  return hideCarried.value && carried.value.has(id) && !hidden.value.has(id)
}

/** The heading a group renders — the untagged bucket is not a tag name. */
function groupLabel(key: string): string {
  return key === UNTAGGED_KEY ? t('items.untagged') : key
}
</script>

<template>
  <section class="sheet-body" data-testid="inventory-browse-sheet">
    <header class="head">
      <div class="titles">
        <h1 class="jp-sheet-title">{{ t('quickAdd.browseTitle') }}</h1>
        <p class="context">{{ t('quickAdd.browseSubtitle') }}</p>
      </div>
      <button
        class="x"
        data-testid="browse-close"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <IonIcon :icon="closeOutline" />
      </button>
    </header>

    <!-- The M9 tag axis (FR-24.2): filter on any tag, group by the primary. -->
    <div v-if="masterStore.tagList.length > 0" class="tag-axis" role="group">
      <button
        class="tag-chip"
        :class="{ sel: tagFilter === null }"
        :aria-pressed="tagFilter === null"
        data-testid="browse-tag-all"
        @click="tagFilter = null"
      >
        {{ t('items.tagFilterAll') }}
      </button>
      <button
        v-for="axisTag in masterStore.tagList"
        :key="axisTag.id"
        class="tag-chip"
        :class="{ sel: tagFilter === axisTag.id }"
        :aria-pressed="tagFilter === axisTag.id"
        :data-testid="`browse-tag-${axisTag.name}`"
        @click="tagFilter = axisTag.id"
      >
        {{ axisTag.name }}
      </button>
    </div>

    <!-- FR-25.13e: the count states what is in the way, the switch puts it
         away. Absent at zero — a control that would do nothing is furniture. -->
    <div v-if="hideableCount > 0" class="hide-line">
      <span class="jp-num" data-testid="browse-hide-count">{{
        hideCarried
          ? t('quickAdd.browseHiddenCount', { n: hideableCount })
          : t('quickAdd.browseCarriedCount', { n: hideableCount })
      }}</span>
      <button
        class="hide-toggle"
        type="button"
        data-testid="browse-hide-toggle"
        :aria-pressed="hideCarried"
        :aria-label="t('quickAdd.browseHideCarriedLabel', { n: hideableCount })"
        @click="toggleHideCarried()"
      >
        <span class="switch" :class="{ on: hideCarried }" aria-hidden="true"></span>
        {{ t('quickAdd.browseHideCarried') }}
      </button>
    </div>

    <p v-if="noMatch" class="no-match" data-testid="browse-no-match">
      {{ t('quickAdd.browseNoMatch') }}
    </p>

    <!-- Its own sentence: an inventory gap and a finished list are different
         answers, and this one carries the way back out. -->
    <p v-else-if="allCarried" class="no-match" data-testid="browse-all-carried">
      {{ tagFilter === null ? t('quickAdd.browseAllCarried') : t('quickAdd.browseAllCarriedTag') }}
      <button
        class="show-anyway"
        type="button"
        data-testid="browse-show-anyway"
        @click="toggleHideCarried()"
      >
        {{ t('quickAdd.browseShowAnyway') }}
      </button>
    </p>

    <section v-for="[key, groupItems] in groups" :key="key" class="tag-group">
      <h2 class="group-head jp-eyebrow" data-testid="browse-group-head">
        {{ groupLabel(key) }}
      </h2>

      <ul class="rows">
        <li v-for="item in groupItems" :key="item.id">
          <!-- A carried row is a state: same place, no control (FR-25.13d). -->
          <div v-if="carried.has(item.id)" class="row is-carried" data-testid="browse-row-carried">
            <span class="row-name">{{ item.name }}</span>
            <span
              v-if="isAddedNow(item.id)"
              class="carried-state is-added"
              data-testid="browse-added-now"
            >
              <IonIcon :icon="checkmarkOutline" aria-hidden="true" />
              {{ t('quickAdd.browseAddedJustNow') }}
            </span>
            <span v-else class="carried-state" data-testid="browse-carried-state">
              {{ t('quickAdd.browseAlreadyIn') }}
            </span>
          </div>
          <button v-else class="row" data-testid="browse-row" @click="emit('add', item)">
            <span class="row-name" data-testid="browse-row-name">{{ item.name }}</span>
            <IonIcon :icon="addCircleOutline" class="row-add" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

    <!-- Free text, demoted to an explicit line: it hands back to the
         composer's field rather than growing a second input here. -->
    <button class="free-text" data-testid="browse-free-text" @click="emit('freeText')">
      <IonIcon :icon="createOutline" />
      <span>{{ t('quickAdd.browseFreeText') }}</span>
    </button>
  </section>
</template>

<style scoped>
.sheet-body {
  padding: 4px 18px 26px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-bottom: 10px;
}

.titles {
  flex: 1;
  min-width: 0;
}

.context {
  margin: 2px 0 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.x {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}

.tag-axis {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 10px;
  /* The axis scrolls as one line, like M9's — wrapping twenty tags would
     push the list it filters off the sheet. */
  white-space: nowrap;
}

.tag-chip {
  padding: 6px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
  flex-shrink: 0;
}

.tag-chip.sel {
  background: var(--ct-surface1);
  color: var(--ct-text);
  border-color: var(--ct-surface2);
}

.hide-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 2px 8px;
  border-bottom: 1px solid var(--ct-surface0);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.hide-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  padding: 4px 0;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

/* A switch is a shape, not an elevation: the pill and its knob are both
   circles by rule, so they stay outside the radius scale (invariant 9b). */
.switch {
  position: relative;
  width: 32px;
  height: 18px;
  flex-shrink: 0;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface1);
}

.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--ct-overlay0);
}

.switch.on {
  background: var(--ct-surface2);
}

.switch.on::after {
  left: 16px;
  background: var(--jp-action);
}

.show-anyway {
  border: none;
  background: none;
  padding: 0 0 0 4px;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.tag-group {
  margin: 0 0 12px;
}

.group-head {
  margin: 0 0 2px;
  color: var(--ct-subtext0);
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 2px;
  border: none;
  border-top: 1px solid var(--ct-surface0);
  background: none;
  text-align: left;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
}

button.row {
  cursor: pointer;
}

button.row:active {
  background: var(--ct-surface0);
}

.row-name {
  flex: 1;
  min-width: 0;
}

.row-add {
  color: var(--jp-action);
  font-size: var(--jp-icon-md);
  flex-shrink: 0;
}

.is-carried .row-name {
  color: var(--ct-subtext0);
}

.carried-state {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  flex-shrink: 0;
}

/* Two classes on purpose: `.carried-state` is declared here, so a single-class
   rule for the added state would lose the cascade and paint subtext grey — it
   did, and only the rendered pixel said so (invariant 9b). */
.carried-state.is-added {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--jp-done);
}

.carried-state.is-added ion-icon {
  font-size: var(--jp-icon-sm);
}

.no-match {
  margin: 0;
  padding: 14px 2px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.free-text {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 6px;
  padding: 12px 2px;
  border: none;
  border-top: 1px solid var(--ct-surface0);
  background: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.free-text ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
