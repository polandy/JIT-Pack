import { computed, toRef, type ComputedRef, type Ref } from 'vue'

import type { DirectoryUser, MeResponse } from '@/api/types'
import { tripParticipants } from '@/domain/members'
import { nameFrom, type NameOf } from '@/lib/rowFacts'
import { useIdentityStore, type IdentitySource } from '@/stores/identityStore'
import { useTripStore } from '@/stores/tripStore'
import type { TripParticipant } from '@/types/domain'

export type { IdentitySource }

/** What the instance knows about accounts, and which of them is the viewer. */
export interface Identity {
  /**
   * Every account the instance carries. Empty in Local Mode, which is the
   * correct answer there: nothing is assignable, so nothing is hidden and no
   * row can name anybody (G-8).
   */
  directory: Ref<DirectoryUser[]>
  /** The viewer's own id, `null` until fetched and in Local Mode. */
  myUserId: Ref<string | null>
  /** The whole `me` payload, for the one screen that renders more than the id. */
  me: Ref<MeResponse | null>
  /** Whether the two above are an answer rather than a question not yet asked. */
  loaded: Ref<boolean>
  /**
   * Fetch both, once per session (ADR-047). A caller that arrives during the
   * flight joins it; one that arrives after it landed gets the answer.
   *
   * Deliberately *not* wired to `onMounted` here. The screens that call it
   * differ in when: M4 runs it after its drain, the wizard only when the
   * session is collaborative, and the member roster on its own. Owning the
   * *what* without the *when* keeps those orderings in the screen that has a
   * reason for them.
   */
  load: () => Promise<void>
}

/** Identity, plus the people one trip's rows can name. */
export interface TripIdentity extends Identity {
  /** Directory and member rows merged — see `tripParticipants`. */
  participants: ComputedRef<TripParticipant[]>
  /** `null` where nobody is named; a stamp then states the act without a who. */
  nameOf: NameOf
}

/**
 * The screen-side view of `identityStore`: the same four values every screen
 * that names somebody used to keep for itself, now one answer for all of them
 * (ADR-047). The `?? null` that makes "not signed in" and "not fetched yet"
 * the same value is deliberate and lives in the store, beside `loaded`, which
 * is what tells the two apart where it matters.
 */
export function useIdentity(source: IdentitySource): Identity {
  const store = useIdentityStore()
  return {
    directory: toRef(store, 'directory'),
    myUserId: toRef(store, 'myUserId'),
    me: toRef(store, 'me'),
    loaded: toRef(store, 'loaded'),
    load: () => store.load(source),
  }
}

/**
 * Identity for a screen that shows one trip: who exists, who I am, and who
 * this trip's rows may name (FR-25.19/25.20).
 *
 * The merge rule itself is `domain/members.tripParticipants` — pure, and
 * table-driven from there. What this adds is the store read that keeps it
 * reactive as the trip's member rows arrive.
 */
export function useTripIdentity(tripId: string, source: IdentitySource): TripIdentity {
  const identity = useIdentity(source)
  const store = useTripStore()

  const participants = computed(() =>
    tripParticipants(identity.directory.value, store.getMembers(tripId)),
  )

  return {
    ...identity,
    participants,
    nameOf: (userId) => nameFrom(participants.value, userId),
  }
}
