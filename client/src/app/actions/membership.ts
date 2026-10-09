/**
 * Trip membership (FR-4.5/4.7) — sharing a trip with an account, changing
 * its role, and taking it away. Who may do which is the server's to stamp
 * and refuse (invariant 3); this group only writes the rows.
 */
import type { TripMember } from '@/types/domain'
import type { SyncContext } from '../context'

/** createMembershipActions binds the membership group to one sync context. */
export function createMembershipActions(ctx: SyncContext) {
  const { mutations, write } = ctx

  /** addTripMember shares the trip with a user account; returns the row id. */
  function addTripMember(
    tripId: string,
    userId: string,
    role: 'admin' | 'editor' = 'editor',
  ): string {
    const { mutation, id } = mutations.addTripMember(tripId, userId, role)
    write(mutation)
    return id
  }

  function setTripMemberRole(member: TripMember, role: 'admin' | 'editor') {
    write(mutations.setTripMemberRole(member.id, role))
  }

  function removeTripMember(memberId: string) {
    write(mutations.removeTripMember(memberId))
  }

  return { addTripMember, setTripMemberRole, removeTripMember }
}
