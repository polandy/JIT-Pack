import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { DirectoryUser, MeResponse } from '@/api/types'

/**
 * The two identity calls, narrowed to what is actually read. Passed per call
 * rather than held, so the store never owns a reference to the sync stack —
 * a test hands over two functions.
 */
export interface IdentitySource {
  fetchUsers: () => Promise<DirectoryUser[]>
  fetchMe: () => Promise<MeResponse | null>
}

/**
 * Who the instance knows about, fetched once per session instead of once per
 * screen (U-10, ADR-047).
 *
 * Nine views used to issue `fetchUsers()`/`fetchMe()` on their own mount, each
 * into a `ref` of its own, so the same two answers were fetched nine times and
 * every screen spent its first frames not knowing who the viewer was. The
 * answers are session-stable — the id for the whole session, the names until
 * somebody is renamed or deactivated — so the four writers that *can* change
 * them refresh this store instead (see `refresh`), which is what keeps the
 * cache from being a staleness bug.
 *
 * A pinia store rather than a module singleton: the per-test reset is
 * `createPinia()`, and a module-level cache would carry one spec's identity
 * into the next.
 */
export const useIdentityStore = defineStore('identity', () => {
  const me = ref<MeResponse | null>(null)
  const directory = ref<DirectoryUser[]>([])
  /**
   * Whether the two above are an *answer*. Distinct from "empty", exactly as
   * ADR-033 distinguishes an unpulled partition from an empty trip: Local Mode
   * and Single-User Mode both answer with nothing, legitimately.
   */
  const loaded = ref(false)

  /** The viewer's own id; `null` until fetched, and in Local Mode. */
  const myUserId = computed(() => me.value?.user_id ?? null)

  // Closure state, so it is per pinia instance and not reactive. `generation`
  // is what makes a refresh beat a load it overtook: without it the older
  // request's response lands last and reinstates the name that was just
  // changed.
  let inFlight: Promise<void> | null = null
  let generation = 0

  async function fetchInto(source: IdentitySource): Promise<void> {
    const mine = ++generation
    const [users, whoami] = await Promise.all([source.fetchUsers(), source.fetchMe()])
    if (mine !== generation) return
    directory.value = users
    me.value = whoami
    loaded.value = true
  }

  /**
   * Fetch both, once. A second caller during the flight joins it; a caller
   * after it has landed gets the answer already here.
   */
  function load(source: IdentitySource): Promise<void> {
    if (loaded.value) return Promise.resolve()
    if (!inFlight) {
      inFlight = fetchInto(source).finally(() => {
        inFlight = null
      })
    }
    return inFlight
  }

  /**
   * Fetch both again, because something just changed the answer — a rename, an
   * admin reset, a deactivation. Every screen bound to this store follows,
   * which is more than the per-screen refs did: they only ever refreshed by
   * being remounted.
   */
  function refresh(source: IdentitySource): Promise<void> {
    loaded.value = false
    inFlight = null
    return load(source)
  }

  /** A session ended: the next viewer is not this one. */
  function forget(): void {
    generation++
    inFlight = null
    loaded.value = false
    me.value = null
    directory.value = []
  }

  return { me, myUserId, directory, loaded, load, refresh, forget }
})
