/**
 * trip_members sync + M3 sharing (FR-4.5/4.7): membership rows travel
 * the master partition, route into the trip store, and the wizard's
 * sharing step enqueues member grants right after the trips insert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import type { PullResponse, PushResponse } from '@/api/types'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', vi.fn(() => ({
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    onopen: null,
    onmessage: null,
    onclose: null,
  })))
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function mockPush() {
  fetchMock.mockResolvedValueOnce(new Response(
    JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } } satisfies PushResponse),
    { status: 200 },
  ))
}

function mockPull() {
  fetchMock.mockResolvedValueOnce(new Response(
    JSON.stringify({ changes: [], next_cursor: 1, has_more: false } satisfies PullResponse),
    { status: 200 },
  ))
}

function newOrchestrator() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

function pushedMutations(callIndex: number): { table: string; op: string; fields?: Record<string, unknown> }[] {
  const body = JSON.parse(fetchMock.mock.calls[callIndex]![1].body as string)
  return body.mutations
}

describe('membership actions', () => {
  it('addTripMember enqueues a master insert and applies optimistically', async () => {
    const orch = newOrchestrator()
    const tripStore = useTripStore()
    mockPush()
    mockPull()

    const memberId = orch.addTripMember('trip-1', 'user-b', 'editor')

    const members = tripStore.getMembers('trip-1')
    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({ id: memberId, trip_id: 'trip-1', user_id: 'user-b', role: 'editor' })

    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(2))
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/sync/master')
    const muts = pushedMutations(0)
    expect(muts).toHaveLength(1)
    expect(muts[0]).toMatchObject({
      table: 'trip_members', op: 'insert',
      fields: { trip_id: 'trip-1', user_id: 'user-b', role: 'editor' },
    })
  })

  it('setTripMemberRole upserts the role', async () => {
    const orch = newOrchestrator()
    const tripStore = useTripStore()
    tripStore.applyChanges([{
      seq: 1, table: 'trip_members', id: 'mem-1', deleted: false,
      row: { trip_id: 'trip-1', user_id: 'user-b', role: 'editor' },
    }])
    mockPush()
    mockPull()

    orch.setTripMemberRole(tripStore.getMembers('trip-1')[0]!, 'admin')

    expect(tripStore.getMembers('trip-1')[0]!.role).toBe('admin')
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(2))
    const muts = pushedMutations(0)
    expect(muts[0]).toMatchObject({
      table: 'trip_members', op: 'upsert', id: 'mem-1', fields: { role: 'admin' },
    })
  })

  it('removeTripMember deletes the membership row', async () => {
    const orch = newOrchestrator()
    const tripStore = useTripStore()
    tripStore.applyChanges([{
      seq: 1, table: 'trip_members', id: 'mem-1', deleted: false,
      row: { trip_id: 'trip-1', user_id: 'user-b', role: 'editor' },
    }])
    mockPush()
    mockPull()

    orch.removeTripMember('mem-1')

    expect(tripStore.getMembers('trip-1')).toHaveLength(0)
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(2))
    const muts = pushedMutations(0)
    expect(muts[0]).toMatchObject({ table: 'trip_members', op: 'delete', id: 'mem-1' })
  })
})

describe('trip_members pull routing', () => {
  it('roster rows and tombstones land in the trip store', () => {
    const tripStore = useTripStore()

    tripStore.applyChanges([{
      seq: 1, table: 'trip_members', id: 'mem-1', deleted: false,
      row: { trip_id: 'trip-1', user_id: 'user-b', role: 'editor' },
    }])
    expect(tripStore.getMembers('trip-1')).toHaveLength(1)

    tripStore.applyChanges([{ seq: 2, table: 'trip_members', id: 'mem-1', deleted: true, row: null }])
    expect(tripStore.getMembers('trip-1')).toHaveLength(0)
  })
})

describe('wizard sharing step (M3 step 2, FR-4.5)', () => {
  it('createTripFromWizard enqueues member grants after the trips insert', async () => {
    const orch = newOrchestrator()
    const tripStore = useTripStore()
    mockPush()
    mockPull()
    mockPush()
    mockPull()

    const tripId = orch.createTripFromWizard({
      name: 'Geteilt',
      startDate: null,
      endDate: '2026-08-10',
      attributes: null,
      travelers: [{ name: 'Andy', profile: 'adult' }],
      items: [],
      members: [
        { userId: 'user-b', role: 'editor' },
        { userId: 'user-c', role: 'admin' },
      ],
    })

    const members = tripStore.getMembers(tripId)
    expect(members.map((m) => m.user_id).sort()).toEqual(['user-b', 'user-c'])

    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(4))
    const masterMuts = pushedMutations(0)
    const tables = masterMuts.map((m) => m.table)
    // The trip must precede its memberships in the same batch — the
    // server authorizes the grant against the freshly created trip.
    expect(tables).toEqual(['trips', 'trip_members', 'trip_members'])
    expect(masterMuts[2]!.fields).toMatchObject({ trip_id: tripId, user_id: 'user-c', role: 'admin' })
  })
})

describe('user directory (GET /users)', () => {
  it('fetchUsers returns the instance directory', async () => {
    const orch = newOrchestrator()
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ users: [
        { user_id: 'user-a', display_name: 'Andy' },
        { user_id: 'user-b', display_name: 'Sarah' },
      ] }),
      { status: 200 },
    ))

    const users = await orch.fetchUsers()

    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/users')
    expect(users.map((u) => u.display_name)).toEqual(['Andy', 'Sarah'])
  })

  it('fetchUsers is empty offline instead of throwing', async () => {
    const orch = newOrchestrator()
    fetchMock.mockRejectedValueOnce(new TypeError('network down'))

    expect(await orch.fetchUsers()).toEqual([])
  })
})
