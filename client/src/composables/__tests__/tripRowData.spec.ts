/**
 * A trip's own rows, needed without opening the trip (M2's progress ring,
 * ADR-033).
 *
 * `trip_items` live in the trip partition, which is pulled when a trip is
 * opened — so a list of trips this device has never opened summed nothing and
 * said `0/0 gepackt`, which is the "not pulled yet is not empty" mistake the
 * orchestrator guards against in four other places and M2 committed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, watchEffect } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ changes: [], next_cursor: 0, has_more: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'WebSocket',
    class {
      readyState = 1
      send() {}
      close() {}
    },
  )
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

const newOrch = () => useSyncOrchestrator({ baseUrl: '', getToken: () => null })

/** Pull requests for one trip's partition, which is what the ring waits on. */
const tripPulls = (tripId: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).includes(`/trips/${tripId}/sync`) && (init?.method ?? 'GET') === 'GET',
  ).length

describe('a trip whose own rows are not on the device (ADR-033)', () => {
  it('says so, rather than letting a caller read it as an empty trip', () => {
    const orch = newOrch()

    expect(orch.tripDataLoaded('trip-1')).toBe(false)
  })

  it('is loaded on request, once, however many callers ask at the same time', async () => {
    const orch = newOrch()

    // Eight rows scrolling into view together is the ordinary case, not the
    // edge case: it must be one request, not eight.
    await Promise.all([
      orch.ensureTripData('trip-1'),
      orch.ensureTripData('trip-1'),
      orch.ensureTripData('trip-1'),
    ])

    expect(tripPulls('trip-1')).toBe(1)
    expect(orch.tripDataLoaded('trip-1')).toBe(true)
  })

  it('is not fetched again once it is here', async () => {
    const orch = newOrch()
    await orch.ensureTripData('trip-1')

    await orch.ensureTripData('trip-1')

    expect(tripPulls('trip-1')).toBe(1)
  })

  it('can be asked for again after a failure, rather than being stuck', async () => {
    const orch = newOrch()
    fetchMock.mockRejectedValueOnce(new Error('offline'))

    await orch.ensureTripData('trip-1')
    expect(orch.tripDataLoaded('trip-1')).toBe(false)

    // The in-flight promise must not outlive the failure, or the row would
    // stay blank until the app restarts.
    await orch.ensureTripData('trip-1')
    expect(orch.tripDataLoaded('trip-1')).toBe(true)
  })

  it('needs no request at all in Local Mode, where the rows are already here', async () => {
    setActivePinia(createPinia())
    const orch = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })

    await orch.ensureTripData('trip-1')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  /*
   * The property a screen depends on, and the one the first implementation
   * got wrong: `loadedTripPartitions` was a plain `Set`, so M2 rendered
   * "still loading" for ever while the rows sat in the store behind it. A
   * value Vue cannot see change is not a value a template can read.
   */
  it('is a change a screen can see, not only a value a function returns', async () => {
    const orch = newOrch()
    const seen: boolean[] = []
    watchEffect(() => seen.push(orch.tripDataLoaded('trip-1')))

    await orch.ensureTripData('trip-1')
    await nextTick()

    expect(seen).toEqual([false, true])
  })
})
