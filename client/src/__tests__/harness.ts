/**
 * The setup every sync spec repeats.
 *
 * Forty-one specs stood up the same four globals by hand — pinia, `fetch`,
 * `WebSocket` and `localStorage` — in twenty-eight slightly different
 * spellings, none of the differences meaning anything. This is that block,
 * once, plus the response builders that came with it.
 *
 * The one rule worth reading: **`localStorage` is stubbed only where there is
 * no DOM.** Under `jsdom` the real implementation is already there, and
 * replacing it with a Map is what hid the Node 26 breakage — the spec then
 * asserts against the stub instead of against the environment it claims to
 * run in. Here the environment decides, so a spec cannot mask its own DOM by
 * copying a setup block that predates its docblock.
 */
import { vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { Mutation, PullResponse, PushResponse } from '@/api/types'

/** What a spec gets back, so it can answer and inspect the network. */
export interface Harness {
  /** The stubbed global `fetch`. */
  fetch: Mock
  /** The stubbed global `WebSocket` constructor. */
  webSocket: Mock
  /** Answer every request with an empty, successful push *and* pull. */
  mockDrain(): void
  /** Answer the next push with these per-mutation results. */
  mockPush(results?: PushResponse['results']): void
  /** Answer the next pull with these changes. */
  mockPull(changes?: PullResponse['changes']): void
  /** Every mutation that actually reached a push body, in order. */
  pushedMutations(): Mutation[]
}

/** A `Storage` backed by a Map — enough for the keys the client reads. */
function mapStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => void values.set(k, v),
    removeItem: (k: string) => void values.delete(k),
    clear: () => values.clear(),
  }
}

/**
 * The WebSocket a spec has to survive whether or not it connects.
 *
 * A **class**, never `vi.fn(() => ({…}))`: a spec that runs `connect()` does
 * `new WebSocket(...)`, and an arrow function cannot be constructed. That
 * surfaces as an unhandled TypeError beside a *passing* suite rather than as
 * a red test, which is worse than a failure — `durableOutbox.spec.ts` paid
 * for this once already.
 */
class SocketStub {
  readyState = 1
  onopen: unknown = null
  onmessage: unknown = null
  onclose: unknown = null
  send = vi.fn()
  close = vi.fn()
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

const EMPTY_PUSH: PushResponse = { results: [], pull_hint: { next_cursor: 1 } }
const EMPTY_PULL: PullResponse = { changes: [], next_cursor: 1, has_more: false }

/**
 * installHarness resets pinia and the browser globals for one test. Call it
 * from `beforeEach`: each call replaces the previous stubs, and Vitest gives
 * every spec file its own environment, so nothing installed here reaches
 * another file. (`restoreMocks`/`unstubGlobals` are deliberately not set in
 * `vitest.config.ts`, so a stub does outlive the test that installed it
 * within one file — the same as the hand-written blocks this replaces.)
 */
export function installHarness(): Harness {
  setActivePinia(createPinia())

  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  const wsMock = vi.fn(function (this: SocketStub) {
    Object.assign(this, new SocketStub())
  }) as unknown as Mock
  vi.stubGlobal('WebSocket', wsMock)

  // See the header: the environment decides, never the spec.
  if (typeof window === 'undefined') {
    vi.stubGlobal('localStorage', mapStorage())
  } else {
    window.localStorage.clear()
  }

  return {
    fetch: fetchMock,
    webSocket: wsMock,
    mockDrain() {
      fetchMock.mockResolvedValue(jsonResponse({ ...EMPTY_PUSH, ...EMPTY_PULL }))
    },
    mockPush(results: PushResponse['results'] = []) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ...EMPTY_PUSH, results }))
    },
    mockPull(changes: PullResponse['changes'] = []) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ...EMPTY_PULL, changes }))
    },
    pushedMutations() {
      return fetchMock.mock.calls
        .filter((call) => call[1]?.body)
        .flatMap((call) => JSON.parse(String(call[1].body)).mutations ?? [])
    },
  }
}
