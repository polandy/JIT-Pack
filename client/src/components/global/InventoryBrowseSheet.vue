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
 *
 * **FR-25.13g** adds the third verb the wardrobe needs as often as the other
 * two: *für alle*. It is the only one that answers *who* rather than *whether*,
 * and it exists only where there are at least two travelers to answer it about
 * — on a free line it adds and distributes in one tap, on a carried one it
 * gives the people who have no row for the item one (ADR-036). Rule 1 holds
 * here too: what a spread may cost is the caller's question, not this sheet's.
 *
 * **FR-25.13h** answers the same *who* for one or more named travelers
 * instead of everybody, on a free line only (a carried line keeps exactly the
 * 👥/spread FR-25.13g gave it). Up to {@link INLINE_PERSON_BUTTONS_MAX}
 * travelers get an avatar button of their own beside 👥; above that the line
 * stays the shape it already had and a long press on 👥 opens a menu instead
 * — its plain tap keeps meaning *für alle* either way, which is the one thing
 * this FR must not cost. **Multi-select**: an avatar button toggles — tapping
 * a second one assigns the item to both, tapping a selected one again takes
 * that traveler back off, and the line stays open for more rather than
 * closing after the first tap the way the other four verbs do. Emptying the
 * set is the same as the line's own *„Rückgängig"*. A second, unrelated long
 * press on the name shows what its ellipsis hid, because the buttons take
 * room the name used to have.
 */
import { IonIcon, actionSheetController } from '@ionic/vue'
import {
  addCircleOutline,
  checkmarkOutline,
  closeOutline,
  createOutline,
  lockClosedOutline,
  peopleOutline,
  personOutline,
} from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import { browseHideCarried } from '@/composables/useBrowseHideCarried'
import { useLongPress } from '@/composables/useLongPress'
import { MIN_TRAVELERS_FOR_PER_PERSON } from '@/domain/membership'
import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import { UNTAGGED_KEY } from '@/domain/tags'
import type { BrowseRowSummary } from '@/domain/browseRows'
import type { MasterItem, Traveler } from '@/types/domain'
import SheetHead from '@/components/global/SheetHead.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'

const props = defineProps<{
  /** Item ids the scope already carries — rendered as "already in". */
  carriedItemIds: string[]
  /**
   * FR-25.13f: what the scope carries, per master item, as M4 sees it. Its
   * **presence** is what puts the two verbs on the rows; M6 and M8 leave it
   * out and the sheet stays the pure add surface it was.
   */
  rowStates?: ReadonlyMap<string, BrowseRowSummary>
  /**
   * FR-25.13g: how many travelers a „für alle" would reach. Below
   * {@link MIN_TRAVELERS_FOR_PER_PERSON} the verb is **absent** rather than
   * disabled (G-8) — M6 and M8 pass nothing and never see it, and neither
   * does a trip travelling alone, where there is no membership to distribute.
   */
  travelerCount?: number
  /**
   * FR-25.13h: the roster itself, trip order — what the per-traveler avatar
   * buttons and the long-press menu are built from. M6 and M8 pass nothing,
   * same as {@link travelerCount}, and see neither.
   */
  travelers?: Traveler[]
}>()

const emit = defineEmits<{
  /** One tap on a free row; the sheet stays open for the run. */
  add: [item: MasterItem]
  /** FR-25.13f: add and pack in one tap — "that is already in the bag". */
  addPacked: [item: MasterItem]
  /** FR-25.13f: add as FR-5.5 *skipped* — the decision, recorded. */
  addSkipped: [item: MasterItem]
  /** FR-25.13g: add it with a row for every traveler, in this one tap. */
  addForAll: [item: MasterItem]
  /** FR-25.13g: give the travelers who have no row for it one (ADR-036). */
  spreadToAll: [item: MasterItem]
  /** FR-25.13h: add or update it with exactly this set of travelers assigned. */
  assignToTravelers: [item: MasterItem, travelerIds: string[]]
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
type RunVerb = 'added' | 'forAll' | 'assigned' | 'packed' | 'skipped'

/** A verb, and how many trip rows it reached (FR-25.21's per-person set). */
interface RunRecord {
  verb: RunVerb
  rows: number
  /** FR-25.13h: who an `assigned` record went to — the other verbs leave it unset. */
  travelerName?: string
}

/**
 * FR-25.13h: which travelers a free line's avatar buttons currently have
 * toggled on, keyed by master item id. Kept beside `actedNow` rather than
 * folded into it — the ledger is "what happened", this is "what is still
 * open to change", and only the `assigned` verb has anything left to change
 * after its first tap.
 */
const assignedTravelers = ref<ReadonlyMap<string, ReadonlySet<string>>>(new Map())

/**
 * The testid a run state renders under. Named once rather than built from
 * the verb: a test selector assembled at runtime is one nothing can grep.
 */
const RUN_STATE_TESTID: Record<RunVerb, string> = {
  added: 'browse-added-now',
  forAll: 'browse-for-all-now',
  assigned: 'browse-assigned-now',
  packed: 'browse-packed-now',
  skipped: 'browse-skipped-now',
}

/** What each verb says of itself once it has landed on the row. */
const RUN_STATE_TEXT = {
  added: 'quickAdd.browseAddedJustNow',
  forAll: 'quickAdd.browseForAllNow',
  assigned: 'quickAdd.browseAssignedNow',
  packed: 'quickAdd.browsePackedNow',
  skipped: 'quickAdd.browseSkippedNow',
} as const

const actedNow = ref<ReadonlyMap<string, RunRecord>>(new Map())

function record(itemId: string, verb: RunVerb, rows: number, travelerName?: string): void {
  actedNow.value = new Map(actedNow.value).set(itemId, { verb, rows, travelerName })
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

/** How many people one tap on „für alle" would reach — 0 where nobody travels. */
const travelerCount = computed(() => props.travelerCount ?? 0)

/** FR-25.13g: whether „für alle" is on offer at all in this scope. */
const forAll = computed(() => travelerCount.value >= MIN_TRAVELERS_FOR_PER_PERSON)

/**
 * FR-25.13h: how many travelers may sit as their own button, in trip order,
 * before a row instead offers a long press on 👥. Past this many the buttons
 * would not fit beside ✓/✕ at a legible size without wrapping the line, which
 * FR-25.13h forbids on purpose (an ellipsis costs a name nothing; a second row
 * costs the sheet its one-line rhythm).
 */
const INLINE_PERSON_BUTTONS_MAX = 3

const travelerList = computed(() => props.travelers ?? [])

/** FR-25.13h: the buttons a free line renders — empty wherever „für alle" is. */
const inlineTravelers = computed(() =>
  forAll.value && travelerList.value.length <= INLINE_PERSON_BUTTONS_MAX ? travelerList.value : [],
)

/** FR-25.13h: whether 👥 answers a long press with the traveler menu instead. */
const usePersonMenu = computed(
  () => forAll.value && travelerList.value.length > INLINE_PERSON_BUTTONS_MAX,
)

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
  | { kind: 'assigning'; text: string; selected: ReadonlySet<string> }
  | { kind: 'locked'; text: string }
  | { kind: 'settled'; text: string }
  | { kind: 'carried'; text: string; verbs: boolean; spread: boolean }
  | { kind: 'free' }

function rowView(item: MasterItem): RowView {
  // The ledger speaks only where the verbs do. Without them M6 and M8 have
  // one add and no way back, so their tapped row keeps saying *„schon drin"*
  // exactly as FR-25.13d wrote it — the e2e case for M8 is what said so.
  const act = (verbs.value ? actedNow.value.get(item.id) : undefined) ?? derivedAdd(item)
  if (act) {
    // FR-25.13h's multi-select: an `assigned` line stays open for more taps
    // rather than closing the way the other four verbs do, so it renders its
    // own kind — the avatar buttons beside it need `.acts` to stay visible.
    if (act.verb === 'assigned') {
      return {
        kind: 'assigning',
        text: actedText(act),
        selected: assignedTravelers.value.get(item.id) ?? new Set(),
      }
    }
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
    return {
      kind: 'carried',
      text: t('quickAdd.browseAlreadyIn'),
      verbs: verbs.value,
      // A set that already reaches everybody has no spread left to offer, and
      // a verb that would do nothing is furniture (FR-25.13g).
      spread: forAll.value && (state?.travelersReached ?? 0) < travelerCount.value,
    }
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
  // FR-25.13h: this one names who, not how many — the other verbs already
  // count rows, and a count of one traveler would say the same thing twice.
  if (act.verb === 'assigned') return t(RUN_STATE_TEXT.assigned, { name: act.travelerName ?? '' })
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

function onAddForAll(item: MasterItem): void {
  emit('addForAll', item)
  record(item.id, 'forAll', travelerCount.value)
}

/**
 * The same verb on a line the trip already carries: the caller re-points what
 * is there (ADR-036) and may refuse to, in which case it takes the tap into
 * the membership editor and this sheet is on its way out with it.
 */
function onSpreadToAll(item: MasterItem): void {
  emit('spreadToAll', item)
  record(item.id, 'forAll', travelerCount.value)
}

/**
 * FR-25.13h: 👥's plain tap on a free line — untouched by whether the line
 * also offers the long-press menu. `forAllMenuItemId` is what stops the
 * release-click of a long press from slipping through as a second, unwanted
 * „für alle" the instant that *same row's* menu opens — scoped to the one
 * item, not a bare boolean, because a boolean here blocked *every* row's
 * „für alle" for as long as any single row's menu was open or dismissing
 * (found by E2E-M4-81: a plain tap on a second row went silently nowhere
 * while the first row's menu was still animating closed).
 */
let forAllMenuItemId: string | null = null

function onForAllTap(view: RowView, item: MasterItem): void {
  if (view.kind === 'free') {
    if (forAllMenuItemId === item.id) return
    onAddForAll(item)
    return
  }
  onSpreadToAll(item)
}

const personHold = useLongPress<MasterItem>(openTravelerMenu)

/**
 * A row keeps offering the long-press menu once it is already `assigning`
 * (>3 travelers, at least one already picked) — only `acted`, `locked`,
 * `settled` and `carried` are past taking any more of this run's taps.
 */
function offersPersonMenu(view: RowView): boolean {
  return (view.kind === 'free' || view.kind === 'assigning') && usePersonMenu.value
}

function onForAllPointerDown(view: RowView, item: MasterItem, e: PointerEvent): void {
  if (!offersPersonMenu(view)) return
  personHold.down(item, e.clientX, e.clientY)
}

function onForAllContextMenu(view: RowView, item: MasterItem): void {
  if (!offersPersonMenu(view)) return
  void openTravelerMenu(item)
}

/**
 * FR-25.13h: the menu a long press on 👥 opens above three travelers — *für
 * alle* first (the plain tap's own action, offered again for a thumb already
 * in the menu, routed through {@link onForAllTap} so it re-points an already
 * `assigning` row instead of adding a second one), then each traveler.
 * `forAllMenuItemId` brackets the whole async lifetime in `try`/`finally`, so
 * a `create()` that rejects never wedges the tap dead — the same shape
 * `TemplateListPage`'s row menu uses, keyed by item id rather than a bare
 * boolean so a second row's own „für alle" is never caught in a first row's
 * guard. The same field also guards re-entrancy: `sheet.dismiss()` fires an
 * animation, and Ionic keeps the outgoing `ion-action-sheet` in the DOM
 * (`overlay-hidden`, not removed) until it finishes — a second long press in
 * that window must wait rather than `create()` a second overlay on top of
 * the first (found by E2E-M4-81 hitting it every run, not intermittently).
 */
async function openTravelerMenu(item: MasterItem): Promise<void> {
  if (forAllMenuItemId !== null) return
  personHold.cancel()
  forAllMenuItemId = item.id
  try {
    const sheet = await actionSheetController.create({
      header: item.name,
      buttons: [
        {
          text: t('quickAdd.browseForAllNow'),
          icon: peopleOutline,
          handler: () => onForAllTap(rowView(item), item),
        },
        ...travelerList.value.map((traveler) => ({
          text: traveler.name,
          icon: personOutline,
          handler: () => onAssignFromMenu(item, traveler),
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
    await sheet.present()
    await sheet.onDidDismiss()
  } finally {
    forAllMenuItemId = null
  }
}

/**
 * FR-25.13h's write, shared by both pickers: hand the planner the *whole*
 * desired set, not the one traveler that was just tapped — a second tap has
 * to add a second traveler to the row this run already wrote, never a second,
 * unrelated row for the same item. Emptying the set is `undo` in disguise —
 * the ledger stops recording it, exactly as if „Rückgängig" had been tapped.
 */
function writeAssignment(item: MasterItem, next: ReadonlySet<string>): void {
  const map = new Map(assignedTravelers.value)
  if (next.size === 0) map.delete(item.id)
  else map.set(item.id, next)
  assignedTravelers.value = map

  emit('assignToTravelers', item, [...next])

  if (next.size === 0) {
    forget(item.id)
    return
  }
  const names = travelerList.value.filter((traveler) => next.has(traveler.id)).map((t) => t.name)
  record(item.id, 'assigned', next.size, names.join(', '))
}

/** The avatar button beside 👥 (≤3 travelers): toggles the tapped traveler. */
function onAssignToggle(item: MasterItem, traveler: Traveler): void {
  const current = assignedTravelers.value.get(item.id) ?? new Set<string>()
  const next = new Set(current)
  if (next.has(traveler.id)) next.delete(traveler.id)
  else next.add(traveler.id)
  writeAssignment(item, next)
}

/**
 * The long-press menu's own pick (>3 travelers): an action sheet has no way
 * to show a traveler as already selected, so a pick here only ever adds —
 * taking one back off stays the line's own „Rückgängig", which removes the
 * item outright rather than one traveler at a time.
 */
function onAssignFromMenu(item: MasterItem, traveler: Traveler): void {
  const next = new Set(assignedTravelers.value.get(item.id) ?? new Set<string>())
  next.add(traveler.id)
  writeAssignment(item, next)
}

// --- FR-25.13h's second, unrelated long press: the name's own tooltip ------

/** The item whose full name a long press is showing, truncated or not. */
const tooltipItemId = ref<string | null>(null)

/**
 * Guards the release-click the same way `forAllMenuItemId` does for 👥's,
 * except there is no overlay to bracket it with — the tooltip is local state,
 * so the flag lives only across the one tap it has to swallow. It needs no
 * item scope the way `forAllMenuItemId` does: a name's long press never
 * opens an overlay another row's tap could get trapped under.
 */
let nameHoldFired = false

const nameHold = useLongPress<MasterItem>((item) => {
  nameHold.cancel()
  nameHoldFired = true
  tooltipItemId.value = item.id
})

function onNameTap(item: MasterItem): void {
  if (nameHoldFired) {
    nameHoldFired = false
    return
  }
  onAdd(item)
}

/** A press starting anywhere else in the sheet closes an open tooltip. */
function onSheetPressStart(): void {
  tooltipItemId.value = null
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
  // FR-25.13h: „Rückgängig" on an `assigning` line takes back every traveler
  // it holds, not just the last one — the same set a full deselect reaches.
  if (assignedTravelers.value.has(item.id)) {
    const map = new Map(assignedTravelers.value)
    map.delete(item.id)
    assignedTravelers.value = map
  }
}

/** What the head says the taps do — three verbs where „für alle" is offered. */
const subtitle = computed(() => {
  if (!verbs.value) return t('quickAdd.browseSubtitle')
  return forAll.value ? t('quickAdd.browseSubtitleForAll') : t('quickAdd.browseSubtitleVerbs')
})

/** The heading a group renders — the untagged bucket is not a tag name. */
function groupLabel(key: string): string {
  return key === UNTAGGED_KEY ? t('items.untagged') : key
}
</script>

<template>
  <section
    class="sheet-body"
    data-testid="inventory-browse-sheet"
    @pointerdown.capture="onSheetPressStart"
  >
    <SheetHead
      :title="t('quickAdd.browseTitle')"
      :meta="subtitle"
      close-testid="browse-close"
      @close="emit('close')"
    />

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
            :class="{ dim: view.kind !== 'free' && view.kind !== 'assigning' }"
            :data-testid="
              view.kind === 'free' || view.kind === 'assigning'
                ? 'browse-row-free'
                : 'browse-row-carried'
            "
          >
            <button
              v-if="view.kind === 'free'"
              class="row-name row-add-target"
              type="button"
              data-testid="browse-row"
              :title="item.name"
              @click="onNameTap(item)"
              @pointerdown="(e: PointerEvent) => nameHold.down(item, e.clientX, e.clientY)"
              @pointermove="(e: PointerEvent) => nameHold.move(e.clientX, e.clientY)"
              @pointerup="nameHold.cancel()"
              @pointercancel="nameHold.cancel()"
              @contextmenu.prevent="tooltipItemId = item.id"
            >
              <span data-testid="browse-row-name">{{ item.name }}</span>
              <!-- The ⊕ steps aside for the two verbs: three glyphs beside a
                   name leave the name nothing on a phone, and the sheet's
                   subtitle carries what the plain tap does (FR-25.13f). -->
              <IonIcon v-if="!verbs" :icon="addCircleOutline" class="row-add" aria-hidden="true" />
            </button>
            <span v-else class="row-name" :title="item.name">{{ item.name }}</span>

            <!-- FR-25.13h: what the name's own long press hides behind its
                 ellipsis. A sibling of the button rather than its child — a
                 `<div>` positioned off a `<button>` is one more place a tap
                 could land somewhere unexpected. -->
            <div v-if="tooltipItemId === item.id" class="name-tip" data-testid="browse-name-tip">
              {{ item.name }}
            </div>

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

            <!-- FR-25.13h: an `assigning` line stays open for more avatar
                 taps rather than closing like the other four verbs — same
                 pill and Undo as `acted`, but `.acts` below keeps rendering. -->
            <template v-else-if="view.kind === 'assigning'">
              <span class="carried-state is-added" data-testid="browse-assigned-now">
                <IonIcon :icon="checkmarkOutline" aria-hidden="true" />
                {{ view.text }}
              </span>
              <button
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
            <span
              v-if="
                verbs &&
                (view.kind === 'free' || view.kind === 'carried' || view.kind === 'assigning')
              "
              class="acts"
            >
              <!-- FR-25.13g: „für alle". First of the three, because it is the
                   only one that answers *who*; ✓ and ✕ answer *whether*. -->
              <button
                v-if="view.kind === 'carried' ? view.spread : forAll"
                class="act for-all"
                type="button"
                data-testid="browse-for-all"
                :aria-label="t('quickAdd.browseForAllLabel', { name: item.name, n: travelerCount })"
                @click="onForAllTap(view, item)"
                @pointerdown="(e: PointerEvent) => onForAllPointerDown(view, item, e)"
                @pointermove="(e: PointerEvent) => personHold.move(e.clientX, e.clientY)"
                @pointerup="personHold.cancel()"
                @pointercancel="personHold.cancel()"
                @contextmenu.prevent="onForAllContextMenu(view, item)"
              >
                <IonIcon :icon="peopleOutline" aria-hidden="true" />
              </button>
              <!-- FR-25.13h: up to three travelers, a button of their own —
                   free and `assigning` lines only, right where 👥 already
                   answers *who*. Multi-select: each one toggles, and a
                   selected traveler carries a ring so a second glance can
                   tell who the item already has without reading the pill. -->
              <template v-if="view.kind === 'free' || view.kind === 'assigning'">
                <button
                  v-for="traveler in inlineTravelers"
                  :key="traveler.id"
                  class="act assign"
                  :class="{ selected: view.kind === 'assigning' && view.selected.has(traveler.id) }"
                  type="button"
                  :data-testid="`browse-assign-${traveler.name}`"
                  :aria-pressed="view.kind === 'assigning' && view.selected.has(traveler.id)"
                  :aria-label="
                    view.kind === 'assigning' && view.selected.has(traveler.id)
                      ? t('quickAdd.browseUnassignLabel', {
                          name: item.name,
                          traveler: traveler.name,
                        })
                      : t('quickAdd.browseAssignLabel', {
                          name: item.name,
                          traveler: traveler.name,
                        })
                  "
                  @click="onAssignToggle(item, traveler)"
                >
                  <UserAvatar :name="traveler.name" :seed="traveler.id" :size="24" />
                </button>
              </template>
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
  position: relative;
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

/* FR-25.13h: anchored to the row, not the name button — a fixed left edge
   reads better than one that would jump with however far the name truncated. */
.name-tip {
  position: absolute;
  left: 2px;
  bottom: calc(100% + 4px);
  z-index: 1;
  max-width: 260px;
  padding: 6px 10px;
  border-radius: var(--jp-r-sm);
  background: var(--ct-surface2);
  color: var(--ct-text);
  font-size: var(--jp-text-xs);
  box-shadow: var(--jp-shadow);
  white-space: normal;
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

/* The one verb that adds people rather than settling a state, so its glyph
   carries the brand role rather than the done one (G-11). The border stays
   the neutral one every verb wears: rendered, a brand-edged box on every free
   line read as a column of warnings down the sheet. */
.act.for-all {
  color: var(--jp-brand);
}

/* FR-25.13h: the same 34×34 touch target the other three verbs get (`.act`
   above) — only the frame is dropped, because an avatar is its own shape
   already and a square border would draw it a second time. Shrinking the
   *box* rather than just the glyph was the original mistake here: the
   tappable area was the visible 20px circle and nothing more, live-tested
   and found too small to hit reliably. */
.act.assign {
  border: none;
  background: none;
  padding: 0;
}

/* FR-25.13h's multi-select: a ring rather than a fill, so a selected avatar
   still reads as *that person's* colour — the ring is the one shadow
   invariant 9b carves out unconditionally, because it casts no light and is
   a selection mark rather than elevation. */
.act.assign.selected {
  box-shadow: 0 0 0 2px var(--jp-action);
  border-radius: 50%;
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
