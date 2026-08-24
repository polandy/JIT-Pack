/**
 * M20 row logic (Addendum 3.23) — pure, no I/O.
 *
 * Mirrors the server's rules for what the per-account ActionSheet may
 * offer: admins and the own account are never deactivatable (FR-23.3),
 * deactivated rows reactivate instead, profile intervention (FR-23.4)
 * is always available, and there is no delete anywhere (FR-23.5).
 */

import type { AdminUser } from '@/api/types'

/** One row of the admin user overview. Generated from internal/api/wire.go. */
export type AdminUserRow = AdminUser

export type AdminAction = 'deactivate' | 'reactivate' | 'reset-avatar' | 'reset-name'

export function adminActionsFor(user: AdminUserRow, myUserId: string | null): AdminAction[] {
  const actions: AdminAction[] = []
  if (user.deactivated_at) {
    actions.push('reactivate')
  } else if (!user.is_instance_admin && user.user_id !== myUserId) {
    actions.push('deactivate')
  }
  actions.push('reset-avatar', 'reset-name')
  return actions
}
