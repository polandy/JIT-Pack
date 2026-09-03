/**
 * Roster view logic for member management (FR-4.5/4.7) — pure, no I/O.
 *
 * Mirrors the server's authorization: Owner/Admin manage members,
 * Editors get a read-only roster, and the creator's Owner row is
 * immutable for everyone. The server enforces all of this again on
 * push; this module only decides what the UI offers.
 */

import type { DirectoryUser } from '@/api/types'
import type { TripMember, TripParticipant, TripRole } from '@/types/domain'

/**
 * Re-exported so a caller that only deals in rosters imports one module. The
 * declaration itself is the generated one (ADR-026): this file used to carry a
 * hand-written twin of the same two fields, which `make wire` could not reach.
 */
export type { DirectoryUser }

export interface RosterRow {
  member: TripMember
  displayName: string
  isOwner: boolean
  isSelf: boolean
  /** Whether the viewer may change this row (role change / removal). */
  mutable: boolean
}

export interface RosterView {
  /** The viewer's role on the trip, '' when unknown (e.g. pre-fetch). */
  myRole: TripRole | ''
  /** Owner/Admin manage members (FR-4.7); Editors see read-only. */
  canManage: boolean
  /** Owner first, then by display name. */
  rows: RosterRow[]
  /** Accounts not yet on the trip — the add picker (FR-4.5). */
  candidates: DirectoryUser[]
}

export function buildRosterView(
  members: TripMember[],
  directory: DirectoryUser[],
  myUserId: string | null,
): RosterView {
  const names = new Map(directory.map((u) => [u.user_id, u.display_name]))
  const myRole = (myUserId && members.find((m) => m.user_id === myUserId)?.role) || ''
  const canManage = myRole === 'owner' || myRole === 'admin'

  const rows: RosterRow[] = members
    .map((member) => ({
      member,
      displayName: names.get(member.user_id) ?? member.user_id,
      isOwner: member.role === 'owner',
      isSelf: member.user_id === myUserId,
      mutable: canManage && member.role !== 'owner',
    }))
    .sort((a, b) =>
      a.isOwner !== b.isOwner ? (a.isOwner ? -1 : 1) : a.displayName.localeCompare(b.displayName),
    )

  const memberIds = new Set(members.map((m) => m.user_id))
  const candidates = canManage ? directory.filter((u) => !memberIds.has(u.user_id)) : []

  return { myRole, canManage, rows, candidates }
}

/**
 * Everyone a trip row could name: the instance directory *and* the trip's own
 * member rows, merged.
 *
 * Deliberately both, rather than membership alone. Single-User Mode bypasses
 * membership entirely (invariant 5), so a trip there has no member rows at
 * all, and a screen that read only those would render every packing record as
 * a raw user id. The reverse case is just as real: a member the directory does
 * not carry — a removed account, or an offline first paint — stays countable,
 * and is named by its id rather than dropped.
 *
 * `editor` is the role assumed for a directory account with no member row: it
 * is the floor the server grants, and nothing here may invent a higher one
 * (invariant 3).
 */
export function tripParticipants(
  directory: readonly DirectoryUser[],
  members: readonly TripMember[],
): TripParticipant[] {
  const roles = new Map(members.map((member) => [member.user_id, member.role]))
  const known = new Map<string, TripParticipant>()
  for (const user of directory) {
    known.set(user.user_id, {
      user_id: user.user_id,
      display_name: user.display_name,
      avatar_url: null,
      role: roles.get(user.user_id) ?? 'editor',
    })
  }
  for (const [user_id, role] of roles) {
    if (!known.has(user_id)) {
      known.set(user_id, { user_id, display_name: user_id, avatar_url: null, role })
    }
  }
  return [...known.values()]
}
