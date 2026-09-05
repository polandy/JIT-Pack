// @vitest-environment jsdom
/**
 * Identity for the screens that name somebody (FR-25.19/25.20, FR-4.5).
 *
 * The four lines behind `load()` were written three times, identically, and
 * the one decision in them is easy to lose in a move: `?? null` makes "no
 * session" and "not fetched yet" the *same* value on purpose, because both
 * mean the same thing to every reader — nobody is me, so nothing is mine.
 *
 * The merge rule itself is table-driven in `domain/__tests__/members.spec.ts`;
 * what is asserted here is that the store read stays reactive, which is the
 * only reason this is a composable rather than a function.
 */
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useIdentity, useTripIdentity, type IdentitySource } from '../useTripIdentity'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

const DIRECTORY = [
  { user_id: 'user-a', display_name: 'Andy' },
  { user_id: 'user-b', display_name: 'Sarah' },
]

function source(over: Partial<IdentitySource> = {}): IdentitySource {
  return {
    fetchUsers: vi.fn(async () => DIRECTORY),
    fetchMe: vi.fn(async () => ({
      user_id: 'user-a',
      display_name: 'Andy',
      is_instance_admin: false,
    })),
    ...over,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useIdentity', () => {
  it('starts empty, so a first paint names nobody rather than guessing', () => {
    const identity = useIdentity(source())

    expect(identity.directory.value).toEqual([])
    expect(identity.myUserId.value).toBeNull()
  })

  it('fetches the directory and the viewer together', async () => {
    const src = source()
    const identity = useIdentity(src)

    await identity.load()

    expect(identity.directory.value).toEqual(DIRECTORY)
    expect(identity.myUserId.value).toBe('user-a')
    expect(src.fetchUsers).toHaveBeenCalledOnce()
    expect(src.fetchMe).toHaveBeenCalledOnce()
  })

  it('reads Local Mode’s two refusals as "nobody", not as an error', async () => {
    // Both calls answer that way there by design (G-8): no directory to
    // fetch, no account to be. A screen must render, naming no one.
    const identity = useIdentity(source({ fetchUsers: async () => [], fetchMe: async () => null }))

    await identity.load()

    expect(identity.directory.value).toEqual([])
    expect(identity.myUserId.value).toBeNull()
  })

  it('does not fetch until a screen asks — the ordering stays the screen’s', () => {
    // M4 loads identity between its drain and its scroll restore, the wizard
    // only for a collaborative session. A composable-owned `onMounted` would
    // take both of those decisions away.
    const src = source()

    useIdentity(src)

    expect(src.fetchUsers).not.toHaveBeenCalled()
    expect(src.fetchMe).not.toHaveBeenCalled()
  })
})

describe('useTripIdentity', () => {
  it('names a packer from the directory once identity has arrived', async () => {
    const identity = useTripIdentity('trip-1', source())

    expect(identity.nameOf('user-b')).toBeNull()
    await identity.load()

    expect(identity.nameOf('user-b')).toBe('Sarah')
  })

  it('picks up member rows that arrive after the screen was built', async () => {
    // The reason this is a composable: a trip's members land through the sync
    // drain, which finishes after the first paint. A snapshot taken at setup
    // would name that member by id for the rest of the screen's life.
    const identity = useTripIdentity('trip-1', source())
    await identity.load()
    expect(identity.participants.value).toHaveLength(2)

    useTripStore().applyChanges([
      {
        seq: 1,
        table: TABLE.tripMembers,
        id: 'mem-c',
        deleted: false,
        row: { trip_id: 'trip-1', user_id: 'user-c', role: 'admin' },
      },
    ])

    expect(identity.participants.value).toHaveLength(3)
    // Named by its own id, not dropped: the directory has no entry for it,
    // and a facepile that silently shrank would be the worse answer.
    expect(identity.nameOf('user-c')).toBe('user-c')
  })

  it('names nobody for a null id — a stamp then states the act without a who', async () => {
    const identity = useTripIdentity('trip-1', source())
    await identity.load()

    expect(identity.nameOf(null)).toBeNull()
  })
})
