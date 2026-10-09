/**
 * FR-18.3: one trip as portable YAML — the file M2's ⋮ and M17's Local-Mode
 * download both write, with or without the trip's progress.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useTripExport } from '../useTripExport'
import { useTripStore } from '@/stores/tripStore'
import { installHarness } from '@/__tests__/harness'
import { saveText } from '@/lib/download'

vi.mock('@/lib/download', () => ({ saveText: vi.fn(), safeFilename: (s: string) => s }))

beforeEach(() => {
  installHarness().mockDrain()
  vi.mocked(saveText).mockClear()
  const tripStore = useTripStore()
  tripStore.applyChange({
    seq: 0,
    table: 'trips',
    id: 't1',
    deleted: false,
    row: { name: 'Engadin', status: 'active', year: 2026 },
  })
  tripStore.applyChange({
    seq: 0,
    table: 'trip_items',
    id: 'a',
    deleted: false,
    row: {
      trip_id: 't1',
      name: 'Zelt',
      quantity: 1,
      packed_count: 1,
      state: 'packed',
      mode: 'pack',
    },
  })
})

describe('exportTripYaml', () => {
  it('writes the trip under its name, with its progress when asked', () => {
    useTripExport().exportTripYaml('t1', { includeProgress: true })
    expect(saveText).toHaveBeenCalledOnce()
    const [yaml, filename] = vi.mocked(saveText).mock.calls[0]!
    expect(filename).toBe('Engadin.yaml')
    expect(yaml).toContain('Zelt')
    expect(yaml).toContain('packed_count: 1')
  })

  it('leaves the progress out of a clean export', () => {
    useTripExport().exportTripYaml('t1', { includeProgress: false })
    const [yaml] = vi.mocked(saveText).mock.calls[0]!
    expect(yaml).toContain('Zelt')
    expect(yaml).not.toContain('packed_count')
  })

  it('writes nothing for a trip the device does not hold', () => {
    useTripExport().exportTripYaml('missing', { includeProgress: true })
    expect(saveText).not.toHaveBeenCalled()
  })
})
