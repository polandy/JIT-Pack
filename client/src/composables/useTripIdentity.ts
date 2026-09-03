import { computed, ref, type ComputedRef, type Ref } from 'vue'

import type { DirectoryUser, MeResponse } from '@/api/types'
import { tripParticipants } from '@/domain/members'
import { nameFrom, type NameOf } from '@/lib/rowFacts'
import { useTripStore } from '@/stores/tripStore'
import type { TripParticipant } from '@/types/domain'

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
  /**
   * Fetch both, in one round trip.
   *
   * Deliberately *not* wired to `onMounted` here. The three screens that call
   * it differ in when: M4 runs it between its drain and its scroll restore,
   * the wizard only when the session is collaborative, and the member roster
   * on its own. Owning the *what* without the *when* keeps those orderings in
   * the screen that has a reason for them — the shared loader is U-10's
   * `useTripScreen`, not this.
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
 * The two orchestrator methods identity needs. Narrowed to what is actually
 * read — `fetchMe` answers with the whole `MeResponse`, and only the id of it
 * reaches a screen through here — so a test hands over two functions rather
 * than a sync stack.
 */
export interface IdentitySource {
  fetchUsers: () => Promise<DirectoryUser[]>
  fetchMe: () => Promise<Pick<MeResponse, 'user_id'> | null>
}

/**
 * The four lines every screen that names somebody had written for itself.
 *
 * They were identical in `PackingListPage`, `TripWizardPage` and
 * `TripMembersPage` — two refs, one `Promise.all`, and the `?? null` that
 * makes "not signed in" and "not fetched yet" the same value on purpose.
 */
export function useIdentity(source: IdentitySource): Identity {
  const directory = ref<DirectoryUser[]>([])
  const myUserId = ref<string | null>(null)

  async function load(): Promise<void> {
    const [users, me] = await Promise.all([source.fetchUsers(), source.fetchMe()])
    directory.value = users
    myUserId.value = me?.user_id ?? null
  }

  return { directory, myUserId, load }
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
