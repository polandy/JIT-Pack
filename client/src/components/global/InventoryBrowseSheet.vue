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
 * carry the add control. After a tap the caller's carried set grows and the
 * row flips right here, which is the feedback a run needs. Free text is
 * demoted to an explicit footer line that hands back to the composer's
 * field; the sheet itself never raises a keyboard.
 *
 * **FR-25.13e** lets that stance be put away for a run: one opt-in switch
 * hides the carried rows, and what it hides is the set carried **when the
 * switch was flipped** — never what this run adds. A row vanishing under the
 * finger would reflow the list into the next tap and would delete the flip
 * above, which is the only feedback the sheet has; so a row acted on while
 * the sheet is open stays where it is and says what happened to it. The
 * hidden rows stay present as a count, and every state this can empty offers
 * a way back.
 *
 * **FR-25.13f** gives the row the two verbs the decision in front of the
 * wardrobe actually needs, each one tap: *gepackt* and *nicht einpacken*,
 * on a free row (add and decide in one breath) and on a carried one alike.
 * Three rules hold it together:
 *
 * 1. **The sheet decides nothing.** It emits the verb and renders what the
 *    caller reports back through `rowStates`; who may be packed, and what
 *    packing writes, stays M4's.
 * 2. **`rowStates` being absent is what turns the verbs off** — M6 and M8
 *    pass no states and get exactly the sheet they had (G-8: a screen with
 *    no packing states offers no packing verbs rather than dead ones).
 * 3. **This run's own actions outrank the props.** Between the tap and the
 *    caller's write landing, and after it, the row says what *this run* did
 *    to it and offers the way back — which is why the ledger below is local
 *    and lives exactly as long as the sheet does.
 */
import { IonIcon } from '@ionic/vue'
import {
  addCircleOutline,
  checkmarkOutline,
  closeOutline,
  createOutline,
  lockClosedOutline,
} from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import { browseHideCarried } from '@/composables/useBrowseHideCarried'
import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import { UNTAGGED_KEY } from '@/domain/tags'
import type { BrowseRowSummary } from '@/domain/browseRows'
import type { MasterItem } from '@/types/domain'

const props = defineProps<{
  /** Item ids the scope already carries — rendered as "already in". */
  carriedItemIds: string[]
  /**
   * FR-25.13f: what the scope carries, per master item, as M4 sees it. Its
   * **presence** is what puts the two verbs on the rows; M6 and M8 leave it
   * out and the sheet stays the pure add surface it was.
   */
  rowStates?: ReadonlyMap<string, BrowseRowSummary>
}>()

const emit = defineEmits<{
  /** One tap on a free row; the sheet stays open for the run. */
  add: [item: MasterItem]
  /** FR-25.13f: add and pack in one tap — "that is already in the bag". */
  addPacked: [item: MasterItem]
  /** FR-25.13f: add as FR-5.5 *skipped* — the decision, recorded. */
  addSkipped: [item: MasterItem]
  /** FR-25.13f: pack what the scope already carries, all of its rows. */
  pack: [item: MasterItem]
  /** FR-25.13f: skip what the scope already carries, all of its rows. */
  skip: [item: MasterItem]
  /** Take back what this run last did to that item. */
  undo: [item: MasterItem]
  /** The footer line: back to the composer's field for a new name. */
  freeText: []
  close: []
}>()

const masterStore = useMasterStore()

/** `null` = the "Alle" chip: no tag filter (the M9 idiom). */
const tagFilter = ref<string | null>(null)

const { hideCarried, toggle: toggleHideCarried } = browseHideCarried()

/** What one tap in this run did to a row — FR-25.13f's local ledger. */
type RunVerb = 'added' | 'packed' | 'skipped'

/** A verb, and how many trip rows it reached (FR-25.21's per-person set). */
interface RunRecord {
  verb: RunVerb
  rows: number
}

/**
 * The testid a run state renders under. Named once rather than built from
 * the verb: a test selector assembled at runtime is one nothing can grep.
 */
const RUN_STATE_TESTID: Record<RunVerb, string> = {
  added: 'browse-added-now',
  packed: 'browse-packed-now',
  skipped: 'browse-skipped-now',
}

/** What each verb says of itself once it has landed on the row. */
const RUN_STATE_TEXT = {
  added: 'quickAdd.browseAddedJustNow',
  packed: 'quickAdd.browsePackedNow',
  skipped: 'quickAdd.browseSkippedNow',
} as const

const actedNow = ref<ReadonlyMap<string, RunRecord>>(new Map())

function record(itemId: string, verb: RunVerb, rows: number): void {
  actedNow.value = new Map(actedNow.value).set(itemId, { verb, rows })
}

function forget(itemId: string): void {
  const next = new Map(actedNow.value)
  next.delete(itemId)
  actedNow.value = next
}

/**
 * The FR-25.13e snapshot: item ids the scope carried when this posture began.
 * Taken on exactly three events — the sheet being created (which is what
 * re-opening it is: Ionic destroys the modal's content on dismiss, so no key
 * is needed on the caller's side), the switch going on, and the tag filter
 * changing.
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

/**
 * The rendered list: M9's grouping, each line already paired with the state
 * it renders. Paired here rather than asked per branch in the template — a
 * template that calls `rowView(item)` in every `v-if` recomputes the answer
 * five times and can, halfway down the chain, act on a different one.
 */
const groups = computed(() =>
  [...masterStore.itemsByPrimaryTag(shown.value)].map(
    ([key, items]) => [key, items.map((item) => ({ item, view: rowView(item) }))] as const,
  ),
)

const carried = computed(() => new Set(props.carriedItemIds))

/** FR-25.13f: the verbs exist only where the caller reports packing states. */
const verbs = computed(() => props.rowStates !== undefined)

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
 * What one line renders. The five kinds are exclusive and asked in this
 * order: what this run did wins over everything, then G-3's lock, then a
 * settled state, then the plain carried state, and a free row last.
 */
type RowView =
  | { kind: 'acted'; text: string; testid: string; done: boolean; undoable: boolean }
  | { kind: 'locked'; text: string }
  | { kind: 'settled'; text: string }
  | { kind: 'carried'; text: string; verbs: boolean }
  | { kind: 'free' }

function rowView(item: MasterItem): RowView {
  const act = actedNow.value.get(item.id) ?? derivedAdd(item)
  if (act) {
    return {
      kind: 'acted',
      text: actedText(act),
      testid: RUN_STATE_TESTID[act.verb],
      done: act.verb !== 'skipped',
      // Only what this sheet did can be taken back by it: a row the caller
      // reports as newly carried may have been added from anywhere.
      undoable: actedNow.value.has(item.id),
    }
  }
  const state = props.rowStates?.get(item.id)
  if (state?.state === 'locked' && state.lockNote !== null) {
    return { kind: 'locked', text: state.lockNote }
  }
  if (state?.state === 'packed') return { kind: 'settled', text: t('quickAdd.browseIsPacked') }
  if (state?.state === 'skipped') return { kind: 'settled', text: t('quickAdd.browseIsSkipped') }
  if (carried.value.has(item.id)) {
    return { kind: 'carried', text: t('quickAdd.browseAlreadyIn'), verbs: verbs.value }
  }
  return { kind: 'free' }
}

/**
 * FR-25.13e's own signal, kept beside the ledger: while the switch is on, a
 * row the caller reports as carried but which the snapshot does not hold was
 * added since the switch was flipped, and says so wherever it came from.
 */
function derivedAdd(item: MasterItem): RunRecord | undefined {
  const addedSinceSnapshot =
    hideCarried.value && carried.value.has(item.id) && !hidden.value.has(item.id)
  return addedSinceSnapshot ? { verb: 'added', rows: 1 } : undefined
}

/**
 * A verb that reached a per-person set says how many rows it reached: a
 * single ✓ that quietly packed three people's rows claims less than it did.
 */
function actedText(act: RunRecord): string {
  const text = t(RUN_STATE_TEXT[act.verb])
  return act.rows > 1 ? `${text} · ${t('quickAdd.browseRowCount', { n: act.rows })}` : text
}

/** How many trip rows a verb on this line would reach (FR-25.21). */
function rowsOf(itemId: string): number {
  return props.rowStates?.get(itemId)?.itemIds.length ?? 1
}

function onAdd(item: MasterItem): void {
  emit('add', item)
  record(item.id, 'added', 1)
}

function onAddPacked(item: MasterItem): void {
  emit('addPacked', item)
  record(item.id, 'packed', 1)
}

function onAddSkipped(item: MasterItem): void {
  emit('addSkipped', item)
  record(item.id, 'skipped', 1)
}

function onPack(item: MasterItem): void {
  emit('pack', item)
  record(item.id, 'packed', rowsOf(item.id))
}

function onSkip(item: MasterItem): void {
  emit('skip', item)
  record(item.id, 'skipped', rowsOf(item.id))
}

function onUndo(item: MasterItem): void {
  emit('undo', item)
  forget(item.id)
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
        <p class="context">
          {{ verbs ? t('quickAdd.browseSubtitleVerbs') : t('quickAdd.browseSubtitle') }}
        </p>
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
        <li v-for="{ item, view } in groupItems" :key="item.id">
          <!-- One line, five states (FR-25.13d/f). The name is a button only
               where tapping it adds; everywhere else it is text, because a
               control that does nothing is worse than none. -->
          <div
            class="row"
            :class="{ dim: view.kind !== 'free' }"
            :data-testid="view.kind === 'free' ? 'browse-row-free' : 'browse-row-carried'"
          >
            <button
              v-if="view.kind === 'free'"
              class="row-name row-add-target"
              type="button"
              data-testid="browse-row"
              @click="onAdd(item)"
            >
              <span data-testid="browse-row-name">{{ item.name }}</span>
              <!-- The ⊕ steps aside for the two verbs: three glyphs beside a
                   name leave the name nothing on a phone, and the sheet's
                   subtitle carries what the plain tap does (FR-25.13f). -->
              <IonIcon v-if="!verbs" :icon="addCircleOutline" class="row-add" aria-hidden="true" />
            </button>
            <span v-else class="row-name">{{ item.name }}</span>

            <!-- What this run did, and the way back out of it. -->
            <template v-if="view.kind === 'acted'">
              <span
                class="carried-state"
                :class="{ 'is-added': view.done }"
                :data-testid="view.testid"
              >
                <IonIcon v-if="view.done" :icon="checkmarkOutline" aria-hidden="true" />
                {{ view.text }}
              </span>
              <button
                v-if="view.undoable"
                class="undo"
                type="button"
                data-testid="browse-undo"
                :aria-label="t('quickAdd.browseUndoLabel', { name: item.name })"
                @click="onUndo(item)"
              >
                {{ t('packing.undo') }}
              </button>
            </template>

            <!-- G-3: somebody else is packing it, so the row is theirs. -->
            <span
              v-else-if="view.kind === 'locked'"
              class="carried-state"
              data-testid="browse-locked"
            >
              <IonIcon :icon="lockClosedOutline" aria-hidden="true" />
              {{ view.text }}
            </span>

            <span
              v-else-if="view.kind === 'settled'"
              class="carried-state"
              data-testid="browse-settled"
            >
              {{ view.text }}
            </span>

            <span
              v-else-if="view.kind === 'carried'"
              class="carried-state"
              data-testid="browse-carried-state"
            >
              {{ view.text }}
            </span>

            <!-- FR-25.13f: the two verbs, one tap each. On a free line they
                 add and decide together; on a carried one they act on every
                 row that item has (FR-25.21). -->
            <span v-if="verbs && (view.kind === 'free' || view.kind === 'carried')" class="acts">
              <button
                class="act pack"
                type="button"
                data-testid="browse-pack"
                :aria-label="t('quickAdd.browsePackLabel', { name: item.name })"
                @click="view.kind === 'free' ? onAddPacked(item) : onPack(item)"
              >
                <IonIcon :icon="checkmarkOutline" aria-hidden="true" />
              </button>
              <button
                class="act skip"
                type="button"
                data-testid="browse-skip"
                :aria-label="t('quickAdd.browseSkipLabel', { name: item.name })"
                @click="view.kind === 'free' ? onAddSkipped(item) : onSkip(item)"
              >
                <IonIcon :icon="closeOutline" aria-hidden="true" />
              </button>
            </span>
          </div>
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
  gap: 10px;
  width: 100%;
  padding: 7px 2px;
  border-top: 1px solid var(--ct-surface0);
  text-align: left;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
}

.row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The name carries the add, so it is the target — full height, so the row
   still reads as one tappable line rather than as a label beside buttons. */
.row-add-target {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: none;
  padding: 8px 0;
  color: inherit;
  font-size: var(--jp-text-md);
  text-align: left;
  cursor: pointer;
}

.row-add-target > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-add-target:active {
  color: var(--jp-action);
}

.row-add {
  color: var(--jp-action);
  font-size: var(--jp-icon-md);
  flex-shrink: 0;
}

.dim .row-name {
  color: var(--ct-subtext0);
}

.carried-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  flex-shrink: 0;
}

/* Two classes on purpose: `.carried-state` is declared here, so a single-class
   rule for the added state would lose the cascade and paint subtext grey — it
   did, and only the rendered pixel said so (invariant 9b). */
.carried-state.is-added {
  color: var(--jp-done);
}

.carried-state ion-icon {
  font-size: var(--jp-icon-sm);
}

.undo {
  border: none;
  background: none;
  padding: 4px 0 4px 4px;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  flex-shrink: 0;
  cursor: pointer;
}

/* FR-25.13f's two verbs. Square targets rather than text, because three
   labelled controls on one row leave the name nothing on a phone. */
.acts {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.act {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-sm);
  background: none;
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.act.pack {
  color: var(--jp-done);
  border-color: var(--ct-surface2);
}

.act.skip {
  color: var(--ct-subtext0);
}

.act:active {
  background: var(--ct-surface0);
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
