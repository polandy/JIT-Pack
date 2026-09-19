/**
 * FR-5.8's second half (ADR-065): a row taken off a packing list takes its
 * inventory item along when nothing else uses it. The rule is the domain's
 * (`itemLeftUnused`); what is pinned here is how each mode carries it out —
 * Local Mode deletes on its own complete answer, a server device asks the
 * server, and only after the removal itself has reached it.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { installHarness } from '@/__tests__/harness'
import { TABLE } from '@/types/tables'
import type { Mutation, PushRequest } from '@/api/types'
import type { TripItem } from '@/types/domain'

const TRIP = 't1'
const ITEM = 'item-tent'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;({ fetch: fetchMock } = installHarness())
  globalThis.indexedDB = new IDBFactory()
})

function seed(rows: { id: string; source_item_id: string | null }[]): void {
  // The trip itself, or none of its rows count: the device's uses are walked
  // trip by trip (`knownTripItems`).
  useTripStore().applyChange({
    seq: 0,
    table: TABLE.trips,
    id: TRIP,
    deleted: false,
    row: { name: 'Engadin', status: 'planning' },
  })
  useMasterStore().applyChange({
    seq: 0,
    table: TABLE.items,
    id: ITEM,
    deleted: false,
    row: { name: 'Zelt' },
  })
  for (const row of rows) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.tripItems,
      id: row.id,
      deleted: false,
      row: {
        trip_id: TRIP,
        name: 'Zelt',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
        source_item_id: row.source_item_id,
      },
    })
  }
}

function row(id: string): TripItem {
  return useTripStore()
    .getItems(TRIP)
    .find((r) => r.id === id)!
}

type Orchestrator = ReturnType<typeof useSyncOrchestrator>

/** The M4 sequence: remove the row, then let its undo lapse. */
async function removeAndLapse(orch: Orchestrator, id: string): Promise<void> {
  const removed = row(id)
  const left = orch.itemLeftByRemoval(removed)
  orch.removeItem(TRIP, removed, [])
  if (left !== null) await orch.pruneItemLeftByRemoval(TRIP, left)
}

describe('Local Mode — the device holds every trip, so its answer is final', () => {
  function localOrch(): Orchestrator {
    return useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })
  }

  it('deletes the item the removed row was the only use of', async () => {
    const orch = localOrch()
    seed([{ id: 'ti-1', source_item_id: ITEM }])

    await removeAndLapse(orch, 'ti-1')

    expect(useMasterStore().getItem(ITEM)).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the item while another row still uses it', async () => {
    const orch = localOrch()
    seed([
      { id: 'ti-1', source_item_id: ITEM },
      { id: 'ti-2', source_item_id: ITEM },
    ])

    await removeAndLapse(orch, 'ti-1')

    expect(useMasterStore().getItem(ITEM)).toBeDefined()
  })

  it('keeps the item when the row came back before the lapse', async () => {
    const orch = localOrch()
    seed([{ id: 'ti-1', source_item_id: ITEM }])
    const removed = { ...row('ti-1') }
    orch.removeItem(TRIP, removed, [])
    orch.restoreRemovedItem(TRIP, removed)

    await orch.pruneItemLeftByRemoval(TRIP, ITEM)

    expect(useMasterStore().getItem(ITEM)).toBeDefined()
  })
})

describe('Server Mode — the server decides over every trip', () => {
  /** A server that applies every push and records what it was asked, in order. */
  function answering(pruned: boolean): string[] {
    const asked: string[] = []
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url.endsWith('/prune')) {
        asked.push(`prune ${url}`)
        return Promise.resolve(
          new Response(JSON.stringify({ pruned, pull_hint: { next_cursor: 9 } }), { status: 200 }),
        )
      }
      if (method === 'POST' && url.endsWith('/sync')) {
        const body = JSON.parse(String(init!.body)) as PushRequest
        asked.push(...body.mutations.map((m: Mutation) => `${m.op} ${m.table} ${m.id}`))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: body.mutations.map((m: Mutation) => ({
                mutation_id: m.mutation_id,
                outcome: 'applied',
              })),
              pull_hint: { next_cursor: 1 },
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ changes: [], next_cursor: 1, has_more: false }), {
          status: 200,
        }),
      )
    })
    return asked
  }

  function serverOrch(): Orchestrator {
    return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
  }

  it('asks the server to prune — after the removal has reached it', async () => {
    const asked = answering(true)
    const orch = serverOrch()
    seed([{ id: 'ti-1', source_item_id: ITEM }])

    await removeAndLapse(orch, 'ti-1')

    // The order is the point: asked first, the server would count the row
    // being removed as a use and keep the item.
    expect(asked).toEqual([
      `delete ${TABLE.tripItems} ti-1`,
      `prune http://localhost/api/v1/master/items/${ITEM}/prune`,
    ])
  })

  it('never deletes the item itself — the push’s delete would retire a used one', async () => {
    const asked = answering(false)
    const orch = serverOrch()
    seed([{ id: 'ti-1', source_item_id: ITEM }])

    await removeAndLapse(orch, 'ti-1')

    expect(asked.some((call) => call.includes(`${TABLE.items} ${ITEM}`))).toBe(false)
    expect(useMasterStore().getItem(ITEM)).toBeDefined()
  })

  it('does not ask while this device already sees another use', async () => {
    const asked = answering(true)
    const orch = serverOrch()
    seed([
      { id: 'ti-1', source_item_id: ITEM },
      { id: 'ti-2', source_item_id: ITEM },
    ])

    await removeAndLapse(orch, 'ti-1')
    await orch.pruneItemLeftByRemoval(TRIP, ITEM)
    // The positive signal for the absence below: the removal has reached the
    // server, so a prune that were coming would have been asked by now.
    await orch.drainTrip(TRIP)

    expect(asked).toEqual([`delete ${TABLE.tripItems} ti-1`])
  })

  it('keeps the item, quietly, when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const orch = serverOrch()
    seed([{ id: 'ti-1', source_item_id: ITEM }])

    await expect(removeAndLapse(orch, 'ti-1')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/prune'))).toBe(false)
  })
})
