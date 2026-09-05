// @vitest-environment jsdom
/**
 * `identityStore` — who the instance knows about, fetched once per session
 * instead of once per screen (U-10, ADR-047).
 *
 * The three promises worth pinning are the three ways a cache goes wrong:
 * it fetches more than once, it goes stale, or a refresh loses a race with
 * the load it overtook.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useIdentityStore, type IdentitySource } from '../identityStore'

const ANDY = { user_id: 'u-andy', display_name: 'Andy', is_instance_admin: false }

function source(users = [{ user_id: 'u-andy', display_name: 'Andy' }]): IdentitySource {
  return {
    fetchUsers: vi.fn(async () => users),
    fetchMe: vi.fn(async () => ANDY),
  }
}

/** A source whose answers are handed over by the test, one release at a time. */
function heldSource() {
  const releases: Array<() => void> = []
  const held = <T>(value: T) => new Promise<T>((resolve) => releases.push(() => resolve(value)))
  return {
    releases,
    users: [] as Array<{ user_id: string; display_name: string }>,
    make(users: Array<{ user_id: string; display_name: string }>): IdentitySource {
      return {
        fetchUsers: () => held(users),
        fetchMe: async () => ANDY,
      }
    },
  }
}

beforeEach(() => setActivePinia(createPinia()))

describe('identityStore', () => {
  it('fetches once however many screens ask', async () => {
    const store = useIdentityStore()
    const src = source()

    await Promise.all([store.load(src), store.load(src), store.load(src)])
    await store.load(src)

    expect(src.fetchUsers).toHaveBeenCalledTimes(1)
    expect(src.fetchMe).toHaveBeenCalledTimes(1)
    expect(store.myUserId).toBe('u-andy')
  })

  /*
   * The distinction ADR-033 draws one partition down: Local Mode and
   * Single-User Mode both answer with nothing, legitimately, so "empty" and
   * "not asked yet" cannot be the same value.
   */
  it('says whether the emptiness is an answer', async () => {
    const store = useIdentityStore()
    expect(store.loaded).toBe(false)

    await store.load({ fetchUsers: async () => [], fetchMe: async () => null })

    expect(store.loaded).toBe(true)
    expect(store.directory).toEqual([])
    expect(store.myUserId).toBeNull()
  })

  it('re-reads on refresh, because a writer just changed the answer', async () => {
    const store = useIdentityStore()
    await store.load(source([{ user_id: 'u-andy', display_name: 'Andy' }]))

    await store.refresh(source([{ user_id: 'u-andy', display_name: 'Béatrice' }]))

    expect(store.directory[0]!.display_name).toBe('Béatrice')
  })

  /*
   * The clause the generation counter exists for, and the only one that
   * distinguishes it from a plain re-fetch: a refresh started while a load is
   * still in flight must win, or the older response lands last and reinstates
   * the name that was just changed. Deterministic — the test decides which
   * response resolves when, so nothing here is a race.
   */
  it('lets a refresh beat the load it overtook, whichever answer arrives last', async () => {
    const store = useIdentityStore()
    const held = heldSource()

    const first = store.load(held.make([{ user_id: 'u-andy', display_name: 'Andy' }]))
    const second = store.refresh(held.make([{ user_id: 'u-andy', display_name: 'Béatrice' }]))

    // The overtaken request answers *after* the one that overtook it.
    held.releases[1]!()
    await second
    held.releases[0]!()
    await first

    expect(store.directory[0]!.display_name).toBe('Béatrice')
  })

  it('forgets a session that ended, and does not serve it to the next one', async () => {
    const store = useIdentityStore()
    await store.load(source())
    expect(store.myUserId).toBe('u-andy')

    store.forget()

    expect(store.loaded).toBe(false)
    expect(store.myUserId).toBeNull()
    expect(store.directory).toEqual([])

    const next = source([{ user_id: 'u-sia', display_name: 'Sia' }])
    await store.load(next)
    expect(next.fetchUsers).toHaveBeenCalledTimes(1)
  })
})
