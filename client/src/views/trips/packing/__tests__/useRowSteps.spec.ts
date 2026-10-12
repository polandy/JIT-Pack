/**
 * FR-25.2, FR-25.31, FR-31.6: the row's count and its skip, announced and
 * behind the snackbar's one undo — over a port, so M4 and an excursion's list
 * say the same thing for the same step.
 */
import { describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

import { useRowUndo } from '@/composables/useRowUndo'
import { t } from '@/i18n'
import type { TripItem } from '@/types/domain'

import type { RowPort } from '../rowPort'
import { useRowSteps } from '../useRowSteps'

function row(over: Partial<TripItem> = {}): TripItem {
  return {
    id: 'r1',
    name: 'Trinkflasche',
    quantity: 2,
    packed_count: 1,
    state: 'open',
    ...over,
  } as TripItem
}

/** A hand-written port: every write is a spy, `skip` reports what it is given. */
function fakePort(skipped: TripItem[] = []) {
  const port = {
    rows: computed(() => []),
    travelers: computed(() => []),
    span: computed(() => ({ start: null, end: null })),
    liveRow: () => null,
    inert: () => false,
    setQuantity: vi.fn(),
    packIncrement: vi.fn(),
    packDecrement: vi.fn(),
    packComplete: vi.fn(),
    packZero: vi.fn(),
    packToggle: vi.fn(),
    skip: vi.fn(() => skipped),
    unskip: vi.fn(),
    restorePacked: vi.fn(),
    restoreSkip: vi.fn(),
    rowUndo: useRowUndo(),
    announceAct: vi.fn(),
    announcePacked: vi.fn(),
    announceSkipped: vi.fn(),
  } satisfies RowPort
  return port
}

describe('useRowSteps (FR-25.2, FR-25.31, FR-31.6)', () => {
  it('announces a step down to nothing as a count, the way the stepper reads', () => {
    const port = fakePort()
    useRowSteps(port).onDecrement(row())
    expect(port.packDecrement).toHaveBeenCalledOnce()
    expect(port.announceAct).toHaveBeenCalledWith(
      t('packing.countToast', { name: 'Trinkflasche', packed: 0, quantity: 2 }),
    )
    expect(port.announcePacked).not.toHaveBeenCalled()
  })

  it('announces the step that completes the row as a pack', () => {
    const port = fakePort()
    useRowSteps(port).onIncrement(row())
    expect(port.packIncrement).toHaveBeenCalledOnce()
    expect(port.announcePacked).toHaveBeenCalledWith('Trinkflasche')
    expect(port.announceAct).not.toHaveBeenCalled()
  })

  it('takes a step back to the count it found', () => {
    const port = fakePort()
    useRowSteps(port).onIncrement(row())
    port.rowUndo.undo()
    expect(port.restorePacked).toHaveBeenCalledWith([
      { itemId: 'r1', name: 'Trinkflasche', quantity: 2, packedCount: 1, state: 'open' },
    ])
  })

  it('announces a tick on a packed row as unpacking it', () => {
    const port = fakePort()
    useRowSteps(port).onToggle(row({ packed_count: 2, state: 'packed' }))
    expect(port.packToggle).toHaveBeenCalledOnce()
    expect(port.announceAct).toHaveBeenCalledWith(
      t('packing.unpackedToast', { name: 'Trinkflasche' }),
    )
  })

  it('arms the skip’s undo from what the skip reports, and names the companions', () => {
    const companion = row({ id: 'r2', name: 'Becher', packed_count: 0 })
    const port = fakePort([row(), companion])
    useRowSteps(port).onSkipItem(row())
    expect(port.announceSkipped).toHaveBeenCalledWith('Trinkflasche', ['Becher'])
    port.rowUndo.undo()
    expect(port.restoreSkip).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 'r1', packedCount: 1 }),
      expect.objectContaining({ itemId: 'r2', packedCount: 0 }),
    ])
  })
})
