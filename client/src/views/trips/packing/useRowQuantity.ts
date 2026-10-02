/**
 * FR-25.24: how many of this are coming along.
 *
 * The editor hangs off the row's own count rather than living a screen
 * away: correcting an amount is something a person does to five rows in a
 * row while looking at the list, and a sheet per row would cost the list
 * five times. M5 carries the same control in a block of its own, for the
 * other posture — one row, read properly.
 */
import { computed, ref } from 'vue'

import { durationDays } from '@/domain/instantiate'
import { quantityChoices } from '@/domain/quantityChoices'
import { t } from '@/i18n'
import type { TripItem } from '@/types/domain'

import type { PackingCore } from './usePackingCore'

/** The popover's state and its two openers. */
export type RowQuantity = ReturnType<typeof useRowQuantity>

/** Builds {@link RowQuantity} over the page's core. */
export function useRowQuantity(core: PackingCore) {
  const { tripId, orchestrator, rowUndo } = core

  /**
   * The rows the editor writes: one when a row opened it, every instance the
   * head's *Menge* reaches when a cluster head did (FR-25.26) — the amount is
   * per person, so the same number is written to each of them.
   */
  const rowIds = ref<string[]>([])

  /**
   * What the popover names when it stands for several rows — the item and how
   * many people it writes for. Null for a single row, which names itself.
   */
  const clusterLabel = ref<string | null>(null)

  /**
   * The tap that opened the editor, which is what Ionic anchors the popover
   * to. Undefined when it was opened from a menu, where there is no row on
   * screen to point at any more — Ionic then centres it.
   */
  const event = ref<MouseEvent | undefined>(undefined)

  const rows = computed(() => core.rowsOf(rowIds.value))

  /**
   * The row whose amount the editor shows. For a cluster that is the first
   * instance: the instances may disagree, and the first tap writes one number
   * to every one of them, after which the display is true of all.
   */
  const item = computed(() => rows.value[0] ?? null)

  /** The floor the editor warns about: the most any written row has packed. */
  const packed = computed(() => Math.max(0, ...rows.value.map((row) => row.packed_count)))

  const choices = computed(() =>
    quantityChoices({
      durationDays: durationDays(
        core.trip.value?.start_date ?? null,
        core.trip.value?.end_date ?? null,
      ),
      travelerCount: core.travelers.value.length,
      perPerson: Boolean(item.value?.assigned_traveler_id),
    }),
  )

  const isOpen = computed(() => rowIds.value.length > 0)

  /**
   * G-3 and FR-9.3 keep the editor shut for the same reasons the stepper is
   * inert: somebody else holds the row, or the screen is asking a different
   * question and this is not an answer to it.
   */
  function open(row: TripItem, opener?: MouseEvent): void {
    if (core.closingPass.value || core.locked(row)) return
    event.value = opener
    clusterLabel.value = null
    rowIds.value = [row.id]
  }

  /** A cluster head's *Menge*: centred, like the row menu's — the head may have moved. */
  function openForRows(ids: string[], label: string): void {
    event.value = undefined
    clusterLabel.value = label
    rowIds.value = ids
  }

  /**
   * The row as the editor found it (FR-25.31). One editing session is one act:
   * three taps on ＋ are one change of amount, and the undo goes back to where
   * the popover opened rather than one step. Announced on close, not per tap —
   * a snackbar raised over the open popover would also be the overlay Escape
   * dismisses first, leaving the popover standing and the undo gone.
   */
  let before: TripItem[] | null = null

  function set(quantity: number): void {
    // Snapshotted at the first write rather than at opening, so both openers —
    // a row and a cluster head (FR-25.26) — share one capture of every row.
    before ??= rows.value.map((row) => ({ ...row }))
    for (const row of rows.value) orchestrator.setQuantity(tripId, row, quantity)
  }

  function closed(): void {
    rowIds.value = []
    clusterLabel.value = null
    const was = before
    before = null
    const first = was?.[0]
    if (!was || !first) return
    const now = core.liveRow(first.id)
    if (!now || now.quantity === first.quantity) return
    // Three fields, as the write has them: an amount cut below the packed count
    // clamps the count, and the undo has to give both back (FR-25.24).
    rowUndo.armUndo(was, (records) => orchestrator.restoreSkip(tripId, records))
    void core.announceAct(t('packing.quantityToast', { name: now.name, n: now.quantity }))
  }

  return { isOpen, event, clusterLabel, item, packed, choices, open, openForRows, set, closed }
}
