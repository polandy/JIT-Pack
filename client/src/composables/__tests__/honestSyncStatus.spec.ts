/**
 * G-2 tells the truth about a drain: a pass in which a partition failed never
 * ends in *synced* (review 2026-11-20, C-1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { fixedClock } from '@/__tests__/fixedClock'
import type { Mutation } from '@/api/types'
import type { OutboxStore, ParkedMutation, PendingMutation } from '@/sync/outboxStore'
import { installHarness } from '@/__tests__/harness'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = installHarness().fetch
})

class FakeStore implements OutboxStore {
  pending: PendingMutation[] = []
  parked: ParkedMutation[] = []
  loadPending() {
    return Promise.resolve([...this.pending])
  }
  append(partition: string, mutation: Mutation) {
    this.pending.push({ partition, mutation })
    return Promise.resolve()
  }
  remove(ids: string[]) {
    this.pending = this.pending.filter((p) => !ids.includes(p.mutation.mutation_id))
    return Promise.resolve()
  }
  park() {
    return Promise.resolve()
  }
  loadParked() {
    return Promise.resolve([...this.parked])
  }
  whenSettled() {
    return Promise.resolve()
  }
}

/** A fresh Response per call: a body can be read once. */
function answerEmpty() {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          results: [],
          pull_hint: { next_cursor: 1 },
          changes: [],
          next_cursor: 1,
          has_more: false,
        }),
        { status: 200 },
      ),
    ),
  )
}

function orchestrator() {
  return useSyncOrchestrator({
    baseUrl: 'http://localhost',
    getToken: () => null,
    outboxStore: new FakeStore(),
    now: fixedClock,
  })
}

describe('drainAll and the G-2 status (C-1)', () => {
  it('ends offline, not synced, when the master pull fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Load failed'))
    const orch = orchestrator()

    await orch.drainAll(['trip-1'])

    expect(orch.syncStatus.state.value).toBe('offline')
  })

  it('ends offline, not synced, when only a trip fails', async () => {
    const orch = orchestrator()
    answerEmpty()
    await orch.drainMaster()
    fetchMock.mockRejectedValue(new TypeError('Load failed'))

    await orch.drainAll(['trip-1'])

    expect(orch.syncStatus.state.value).toBe('offline')
  })

  it('ends synced when every partition drained', async () => {
    const orch = orchestrator()
    answerEmpty()

    await orch.drainAll(['trip-1'])

    expect(orch.syncStatus.state.value).toBe('synced')
  })
})
