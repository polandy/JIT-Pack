/**
 * Roster view logic for member management (FR-4.5/4.7) — pure, no I/O.
 *
 * Mirrors the server's authorization: Owner/Admin manage members,
 * Editors get a read-only roster, and the creator's Owner row is
 * immutable for everyone. The server enforces all of this again on
 * push; this module only decides what the UI offers.
 */

import type { TripMember, TripRole } from '@/types/domain'

export interface DirectoryUser {
  user_id: string
  display_name: string
}

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
