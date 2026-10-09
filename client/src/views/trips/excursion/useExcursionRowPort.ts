/**
 * An excursion's lines as M4's row slices act on them (FR-31.6): the
 * {@link RowPort} over the line's own count, so the stepper, the check, the
 * skip, the amount and the browse verbs are M4's, written to the line.
 */
import { computed, type ComputedRef } from 'vue'

import type { PackAnnouncer } from '@/composables/usePackAnnouncer'
import type { RowUndoRecord } from '@/composables/useRowUndo'
import type { Orchestrator } from '@/composables/useSyncOrchestrator'
import { excursionLineAsRow } from '@/domain/excursionLines'
import {
  STATE_SKIPPED,
  type Excursion,
  type ExcursionItem,
  type Traveler,
  type TripItem,
} from '@/types/domain'

import type { RowPort } from '../packing/rowPort'

/** The writes on a line's count the port makes. */
export type ExcursionLineWrites = Pick<
  Orchestrator['excursions'],
  'setLineCount' | 'setLineQuantity' | 'toggleLine' | 'skipLine' | 'unskipLine'
>

/** What {@link useExcursionRowPort} reads and writes through. */
export interface ExcursionRowSource {
  orchestrator: ExcursionLineWrites
  excursion: ComputedRef<Excursion | null>
  lines: ComputedRef<ExcursionItem[]>
  /** The people going (FR-31.5) — whom the list, its amounts and its browse verbs are for. */
  participants: ComputedRef<Traveler[]>
  announcer: PackAnnouncer
}

/** Builds the excursion's port, and the way from one of its rows back to its line. */
export function useExcursionRowPort(source: ExcursionRowSource) {
  const { orchestrator, lines, announcer } = source

  /** The lines by id, to get from M4's row back to the line it reads. */
  const lineById = computed(() => new Map(lines.value.map((line) => [line.id, line])))

  function lineOf(row: TripItem): ExcursionItem {
    return lineById.value.get(row.id)!
  }

  /** Write to the line behind a row, unless it has left the excursion meanwhile. */
  function onLine(row: TripItem, write: (line: ExcursionItem) => void): void {
    const line = lineById.value.get(row.id)
    if (line) write(line)
  }

  /**
   * Put each line back the way the record found it. A skip is a state of its
   * own (an amount of zero), so a skipped record is re-skipped rather than
   * counted, and only where the line is not skipped already.
   */
  function restoreCounts(records: RowUndoRecord[]): void {
    for (const record of records) {
      const line = lineById.value.get(record.itemId)
      if (!line) continue
      if (record.state === STATE_SKIPPED) {
        if (line.state !== STATE_SKIPPED) orchestrator.skipLine(line)
      } else {
        orchestrator.setLineCount({ ...line, quantity: record.quantity }, record.packedCount)
      }
    }
  }

  const port: RowPort = {
    rows: computed(() => lines.value.map(excursionLineAsRow)),
    travelers: source.participants,
    span: computed(() => ({
      start: source.excursion.value?.starts_on ?? null,
      end: source.excursion.value?.ends_on ?? null,
    })),
    liveRow: (id) => {
      const line = lineById.value.get(id)
      return line ? excursionLineAsRow(line) : null
    },
    // Nobody claims a line, and an excursion has no closing pass.
    inert: () => false,
    setQuantity: (row, quantity) =>
      onLine(row, (line) => orchestrator.setLineQuantity(line, quantity)),
    packIncrement: (row) =>
      onLine(row, (line) => orchestrator.setLineCount(line, line.packed_count + 1)),
    packDecrement: (row) =>
      onLine(row, (line) => orchestrator.setLineCount(line, line.packed_count - 1)),
    // A skipped line has no amount to fill — FR-31.6's skip is an amount of zero.
    packComplete: (row) =>
      onLine(row, (line) => {
        if (line.state !== STATE_SKIPPED) orchestrator.setLineCount(line, line.quantity)
      }),
    packZero: (row) => onLine(row, (line) => orchestrator.setLineCount(line, 0)),
    packToggle: (row) => onLine(row, (line) => orchestrator.toggleLine(line)),
    skip: (row) => {
      const line = lineById.value.get(row.id)
      if (!line) return []
      orchestrator.skipLine(line)
      return [excursionLineAsRow(line)]
    },
    unskip: (row) => onLine(row, (line) => orchestrator.unskipLine(line)),
    restorePacked: restoreCounts,
    restoreSkip: restoreCounts,
    rowUndo: announcer.rowUndo,
    announceAct: announcer.announceAct,
    announcePacked: announcer.announcePacked,
    announceSkipped: announcer.announceSkipped,
  }

  return { port, lineById, lineOf }
}
