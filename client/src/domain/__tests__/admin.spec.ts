/**
 * M20 action rules (FR-23.3/23.4): which admin actions a row offers —
 * no deactivate for admins or the own account, reactivate only on
 * deactivated rows, no delete anywhere (FR-23.5).
 */
import { describe, it, expect } from 'vitest'

import { adminActionsFor, type AdminUserRow } from '../admin'

function row(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    user_id: 'user-b',
    display_name: 'Sarah',
    email: 'sarah@example.com',
    created_at: '2026-07-01T00:00:00Z',
    is_instance_admin: false,
    deactivated_at: null,
    trip_count: 2,
    template_count: 1,
    ...overrides,
  }
}

describe('adminActionsFor', () => {
  it('offers deactivate and profile resets on an active member', () => {
    expect(adminActionsFor(row(), 'user-a')).toEqual(['deactivate', 'reset-avatar', 'reset-name'])
  })

  it('never offers deactivate on instance admins (FR-23.3)', () => {
    expect(adminActionsFor(row({ is_instance_admin: true }), 'user-a')).toEqual([
      'reset-avatar',
      'reset-name',
    ])
  })

  it('never offers deactivate on the own account', () => {
    expect(adminActionsFor(row({ user_id: 'user-a' }), 'user-a')).toEqual([
      'reset-avatar',
      'reset-name',
    ])
  })

  it('offers reactivate instead on a deactivated row', () => {
    expect(adminActionsFor(row({ deactivated_at: '2026-07-09T00:00:00Z' }), 'user-a')).toEqual([
      'reactivate',
      'reset-avatar',
      'reset-name',
    ])
  })
})
