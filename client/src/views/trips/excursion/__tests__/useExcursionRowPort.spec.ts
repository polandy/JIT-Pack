/**
 * FR-31.6: an excursion's list counts with M4's row slices, through a port
 * that writes the line's own count. What the port decides for itself is
 * where a line's model differs from a trip row's: a skip is an amount of
 * zero, so a skipped line is neither filled nor counted back to life.
 */
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import type { PackAnnouncer } from '@/composables/usePackAnnouncer'
import { useRowUndo } from '@/composables/useRowUndo'
import { excursionLineAsRow } from '@/domain/excursionLines'
import { STATE_SKIPPED, type ExcursionItem } from '@/types/domain'

import { useExcursionRowPort, type ExcursionLineWrites } from '../useExcursionRowPort'

function line(over: Partial<ExcursionItem> = {}): ExcursionItem {
  return {
    id: 'l1',
    trip_id: 't1',
    excursion_id: 'e1',
    trip_item_id: null,
    source_item_id: 'm1',
    name: 'Trinkflasche',
    category_name: null,
    assigned_traveler_id: null,
    quantity: 2,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    bought_at: null,
    not_in_luggage: false,
    for_all_participants: false,
    ...over,
  }
}

function setup(initial: ExcursionItem[]) {
  const lines = ref(initial)
  const writes: ExcursionLineWrites = {
    setLineCount: vi.fn(),
    setLineQuantity: vi.fn(),
    toggleLine: vi.fn(),
    skipLine: vi.fn(),
    unskipLine: vi.fn(),
  }
  const announcer = {
    rowUndo: useRowUndo(),
    announceAct: vi.fn(),
    announcePacked: vi.fn(),
    announceSkipped: vi.fn(),
  } as unknown as PackAnnouncer
  const { port } = useExcursionRowPort({
    orchestrator: writes,
    excursion: computed(() => null),
    lines: computed(() => lines.value),
    participants: computed(() => []),
    announcer,
  })
  return { port, writes, lines }
}

describe('useExcursionRowPort (FR-31.6)', () => {
  it('reads every line as M4 row, and a line that is gone as no row', () => {
    const { port } = setup([line()])
    expect(port.rows.value.map((row) => row.id)).toEqual(['l1'])
    expect(port.liveRow('l1')?.quantity).toBe(2)
    expect(port.liveRow('gone')).toBeNull()
  })

  it('reports a skip as the line was before it, so the undo knows its amount', () => {
    const { port, writes } = setup([line({ packed_count: 1 })])
    const affected = port.skip(port.rows.value[0]!)
    expect(writes.skipLine).toHaveBeenCalledOnce()
    expect(affected).toEqual([excursionLineAsRow(line({ packed_count: 1 }))])
  })

  it('fills an open line, and leaves a skipped one alone — it has no amount to fill', () => {
    const { port, writes } = setup([line(), line({ id: 'l2', quantity: 0, state: STATE_SKIPPED })])
    const [open, skipped] = port.rows.value
    port.packComplete(open!)
    port.packComplete(skipped!)
    expect(writes.setLineCount).toHaveBeenCalledTimes(1)
    expect(writes.setLineCount).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }), 2)
  })

  it('counts a record back onto its line, the amount with it', () => {
    const { port, writes } = setup([line({ quantity: 5, packed_count: 5, state: 'packed' })])
    port.restoreSkip([{ itemId: 'l1', name: 'x', quantity: 2, packedCount: 1, state: 'open' }])
    expect(writes.setLineCount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'l1', quantity: 2 }),
      1,
    )
  })

  it('puts a skipped record back as a skip, and writes nothing where the line is still skipped', () => {
    const { port, writes, lines } = setup([line({ state: 'open' })])
    const skippedRecord = { itemId: 'l1', name: 'x', quantity: 0, packedCount: 0, state: 'skipped' }
    port.restorePacked([skippedRecord])
    expect(writes.skipLine).toHaveBeenCalledOnce()
    expect(writes.setLineCount).not.toHaveBeenCalled()

    lines.value = [line({ quantity: 0, state: STATE_SKIPPED })]
    port.restorePacked([skippedRecord])
    expect(writes.skipLine).toHaveBeenCalledOnce()
  })

  it('drops a write to a line that left the excursion meanwhile', () => {
    const { port, writes, lines } = setup([line()])
    const row = port.rows.value[0]!
    lines.value = []
    port.packIncrement(row)
    port.setQuantity(row, 3)
    port.restoreSkip([{ itemId: 'l1', name: 'x', quantity: 2, packedCount: 0, state: 'open' }])
    expect(writes.setLineCount).not.toHaveBeenCalled()
    expect(writes.setLineQuantity).not.toHaveBeenCalled()
  })
})
