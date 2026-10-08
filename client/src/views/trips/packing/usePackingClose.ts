/**
 * The end of packing and of the trip, as M4 asks them: FR-5.10's close (from
 * the ⋮, from the bar the last pack raises, and from M2's *Reise starten*,
 * FR-7.16) and FR-9.3's closing pass that archives the trip into M14.
 */
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { packingIsFinished, planPackingClose, type ClosePackingPlan } from '@/domain/closePacking'
import { nextLifecycleStep } from '@/domain/trips'
import { t } from '@/i18n'
import { PACKING_CLOSE_CROSSINGS } from '@/kernel/packingClose'
import { presentToast } from '@/composables/shared/toast'
import { CLOSING_QUERY_PARAM, STARTING_QUERY_PARAM, tripPath, tripSubPath } from '@/router/paths'
import { STATE_SKIPPED, type TripItem } from '@/types/domain'

import type { PackingCore } from './usePackingCore'

/** Builds the close's state and answers over the page's core. */
export function usePackingClose(core: PackingCore) {
  const { tripId, tripStore, orchestrator, closingPass, packingClosed, rowUndo, announceAct } = core
  const route = useRoute()
  const router = useRouter()

  /** What the closed card counts: the rows the list currently carries as decided. */
  const skippedCount = computed(
    () => core.allItems.value.filter((row) => row.state === STATE_SKIPPED).length,
  )

  /**
   * FR-9.3: *Reise abschliessen* does not archive straight away — it opens
   * the closing pass, the one point in the lifecycle where the user is
   * thinking about the whole trip at once. The pass never gates archiving:
   * *Fertig* finishes it whether or not anything was marked.
   */
  function onArchive() {
    closingPass.value = true
  }

  /**
   * The pass's one door is M2's *Reise abschliessen*, which
   * arrives here as `?closing=1`. Taken only while archiving is the trip's next
   * step — a stale link to an archived or planning trip opens the list — and
   * the flag is dropped from the URL at once, so a reload or a back does not
   * reopen a pass the user has left.
   */
  watch(
    [() => route.query[CLOSING_QUERY_PARAM], () => nextLifecycleStep(core.trip.value)],
    ([asked, step]) => {
      if (asked === undefined) return
      if (step === 'archive') onArchive()
      // Waits for the trip: before it has loaded there is no step to read.
      if (step === null && !core.trip.value) return
      void router.replace(tripPath(tripId))
    },
    { immediate: true },
  )

  /** Leaves the pass without archiving — the door asks, so it can be closed. */
  function onCancelClosingPass() {
    closingPass.value = false
  }

  /** FR-9.3's ending: the pass archives the trip and continues into M14. */
  async function onFinishClosingPass() {
    closingPass.value = false
    await archiveAndReview()
  }

  /**
   * Archiving completes the trip and opens the M14 review (FR-9.2).
   * With no FR-9.1 flags there is nothing to judge, so the assistant is
   * skipped with a toast instead of an empty screen (UI-Spec M14 states);
   * the archived M4 leads with the closing card either way.
   */
  async function archiveAndReview() {
    orchestrator.archiveTrip(tripId)
    const flagged = tripStore.getItems(tripId).some((item) => item.flag_unused || item.flag_missing)
    if (!flagged) {
      await presentToast({ message: t('review.nothingToast') })
      return
    }
    router.push(tripSubPath(tripId, 'review'))
  }

  /**
   * FR-5.10's question, live: what closing *now* would decide. The sheet reads
   * it, and so does the write, so the sentence confirmed and the rows changed
   * come from one rule — and on a shared trip the sheet follows a list that
   * changes while it is open.
   */
  const plan = computed<ClosePackingPlan>(() =>
    planPackingClose(core.allItems.value, {
      isClaimed: (row: TripItem) => core.locked(row),
      // FR-7.7: the tasks that would cross with the close. Read into the plan
      // rather than counted beside it, so the sentence the reader confirms and
      // the write that follows cannot disagree about how many move.
      tasks: [...tripStore.getTripTodos(tripId), ...tripStore.getTodos(tripId)],
    }),
  )

  /**
   * FR-7.12: what the modules move with the close (the shopping list's own
   * entries), provided by the composition root; none in a spec that provides
   * none.
   */
  const crossings = inject(PACKING_CLOSE_CROSSINGS, [])
  /** The sheet's shopping number: the packing rows plus every module's own. */
  const shoppingCount = computed(
    () =>
      plan.value.buyRows.length +
      crossings.reduce((n, crossing) => n + crossing.pending(tripId), 0),
  )

  /** Whether the question is on screen, and whether it came asked or invited. */
  const sheetOpen = ref(false)
  const prompted = ref(false)
  /** FR-7.16: the sheet was opened by *Reise starten*, and its confirm starts the trip too. */
  const starting = ref(false)

  /** FR-7.16: *Nur starten* — the trip starts, the packing stays open and nothing moves. */
  function onStartOnly() {
    sheetOpen.value = false
    starting.value = false
    orchestrator.activateTrip(tripId)
    void announceAct(t('packing.startedToast'))
  }

  /**
   * FR-7.16: M2's *Reise starten* on a trip whose packing is open arrives as
   * `?starting=1`, and the list asks FR-5.10's question put for the start.
   * Taken only while starting is the trip's next step; a packing finished in
   * the meantime starts the trip without asking. The flag is dropped from the
   * URL at once, like the closing pass's. Below the sheet's own state, since it
   * runs as soon as it is set up.
   */
  watch(
    [() => route.query[STARTING_QUERY_PARAM], () => nextLifecycleStep(core.trip.value)],
    ([asked, step]) => {
      if (asked === undefined) return
      // Waits for the trip: before it has loaded there is no step to read.
      if (step === null && !core.trip.value) return
      if (step === 'start' && !packingClosed.value) {
        prompted.value = false
        starting.value = true
        sheetOpen.value = true
      } else if (step === 'start') {
        // Finished on another device between M2's tap and this arrival: there
        // is nothing left to ask, and the start was asked for.
        orchestrator.activateTrip(tripId)
        void announceAct(t('packing.startedToast'))
      }
      void router.replace(tripPath(tripId))
    },
    { immediate: true },
  )

  /**
   * FR-5.10's second door: the step is offered where the
   * moment is. Packing the last open row *is* the moment — finding the ⋮
   * afterwards is the part nobody does.
   *
   * Three guards, each paid for by a way this becomes a nuisance:
   *
   *  - it asks on the **transition**, never on arrival at a list that was
   *    already complete — `settled` drops the first reading, which is the one
   *    that describes a moment that passed before the screen opened;
   *  - a reader who says *später* is not asked again for this trip while the
   *    screen lives, or the box would raise it on every tick;
   *  - a list that has not arrived is not an empty one (ADR-033), and a trip
   *    with no rows at all has nothing to finish.
   */
  const packingComplete = computed(() => packingIsFinished(core.allItems.value))
  const declined = ref(false)
  /**
   * Whether this screen has read the list *once*. Counted from the partition
   * arriving rather than from the mount: on a cold start M4 renders before its
   * rows land, so the mount's reading says „nothing is open" about a list
   * nobody has read (ADR-033), and the reading after it — the real first one —
   * would otherwise look like the transition this watches for.
   */
  let listRead = false
  /** Whether the offer has been raised for this list, as a bar above it. */
  const promptUp = ref(false)
  watch(
    [core.rowsLoaded, packingComplete] as const,
    ([loaded, complete]) => {
      if (!loaded) return
      const firstReading = !listRead
      listRead = true
      // The offer stands down by itself when the list reopens — a row added or
      // un-packed — so it never outlives the moment it reports.
      if (!complete) promptUp.value = false
      if (firstReading || !complete || packingClosed.value || declined.value) return
      promptUp.value = true
    },
    { immediate: true },
  )

  /** The bar's own button: the same question, now asked for. */
  function onOpenFromPrompt() {
    prompted.value = true
    sheetOpen.value = true
  }

  /** *Später* on the sheet: this trip stops volunteering it while M4 lives. */
  function onDismissPrompt() {
    promptUp.value = false
    declined.value = true
  }

  /** The ⋮ asks the same question, and says so by not being a prompt. */
  function onClosePacking() {
    prompted.value = false
    sheetOpen.value = true
  }

  /** Dismissed: nothing is written, and an offered close stops being offered. */
  function onSheetDismissed() {
    sheetOpen.value = false
    starting.value = false
    if (prompted.value) onDismissPrompt()
  }

  /**
   * FR-5.10: everything still open becomes a decision, and the trip records
   * that the packing is finished.
   *
   * The plan is read twice on purpose — once by the sheet, once inside the
   * action for the write. In between the user reads a question, and on a
   * shared trip the list can change while they do; the write must act on what
   * is there when it runs, not on what the question counted.
   */
  function onConfirm() {
    const startsToo = starting.value
    sheetOpen.value = false
    starting.value = false
    promptUp.value = false
    const { rows, tasks, buyRows } = orchestrator.closePacking(tripId, {
      isClaimed: (row: TripItem) => core.locked(row),
      // FR-7.16: the tag the crossing trip tasks are filed under, in the
      // reader's words.
      carriedTagName: t('tasks.carriedTag'),
    })
    // FR-7.12: a module's own *before* list crosses in the same act, and is
    // taken back by the same undo.
    const crossed = crossings.map((crossing) => crossing.cross(tripId))
    // FR-7.16: asked for by *Reise starten* — the start is part of the act,
    // after the close, so the trip is under way with *before* already closed.
    if (startsToo) orchestrator.activateTrip(tripId)
    const shopping = buyRows.length + crossed.reduce((n, effect) => n + effect.count, 0)
    // One undo for the whole act (FR-25.31), and deliberately one *call*: the
    // rows travel as the records the snackbar snapshots, the moved tasks in the
    // closure beside them. Arming a second undo for the tasks would replace the
    // first — the record holds one action at a time, by design — and the rows
    // would quietly lose their way back.
    rowUndo.armUndo(rows, (records) => {
      orchestrator.restorePackingClose(tripId, records, tasks, buyRows)
      for (const effect of crossed) effect.undo()
      if (startsToo) orchestrator.unstartTrip(tripId)
    })
    const said = [
      rows.length > 0 ? t('packing.closedToast', { n: rows.length }) : t('packing.closedToastNone'),
    ]
    // FR-7.7: the sheet said it would happen; the snackbar says it did, because
    // the tasks left a screen the reader is still looking at.
    if (tasks.length > 0) said.push(t('packing.closedToastTasks', { n: tasks.length }))
    if (shopping > 0) said.push(t('packing.closedToastShopping', { n: shopping }))
    if (startsToo) said.push(t('packing.startedToastShort'))
    void announceAct(said.join(' · '))
  }

  /**
   * FR-5.10's way back. No snackbar and no undo: the card that offered it is
   * gone from the top of the list, which is the whole feedback — and reopening
   * is itself the way back out of closing.
   */
  function onReopen() {
    orchestrator.reopenPacking(tripId)
  }

  return {
    skippedCount,
    plan,
    shoppingCount,
    sheetOpen,
    prompted,
    starting,
    promptUp,
    onCancelClosingPass,
    onFinishClosingPass,
    onStartOnly,
    onOpenFromPrompt,
    onClosePacking,
    onSheetDismissed,
    onConfirm,
    onReopen,
  }
}
