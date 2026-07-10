/**
 * FR-4.5/4.7 roster view logic: who may manage members, which rows are
 * mutable (the creator's Owner row never is), and which accounts are
 * still addable.
 */
import { describe, it, expect } from 'vitest'

import { buildRosterView } from '../members'
import type { TripMember } from '@/types/domain'

const directory = [
  { user_id: 'user-a', display_name: 'Andy' },
  { user_id: 'user-b', display_name: 'Sarah' },
  { user_id: 'user-c', display_name: 'Carla' },
]

function member(id: string, userId: string, role: TripMember['role']): TripMember {
  return { id, trip_id: 'trip-1', user_id: userId, role }
}

const roster = [
  member('mem-b', 'user-b', 'editor'),
  member('mem-a', 'user-a', 'owner'),
]

describe('buildRosterView', () => {
  it('lets the owner manage everyone but the owner row', () => {
    const view = buildRosterView(roster, directory, 'user-a')

    expect(view.myRole).toBe('owner')
    expect(view.canManage).toBe(true)
    expect(view.rows.map((r) => r.member.id)).toEqual(['mem-a', 'mem-b']) // owner first
    expect(view.rows[0]).toMatchObject({ isOwner: true, isSelf: true, mutable: false })
    expect(view.rows[1]).toMatchObject({ isOwner: false, isSelf: false, mutable: true })
  })

  it('admins manage non-owner rows too (FR-4.7)', () => {
    const withAdmin = [...roster, member('mem-c', 'user-c', 'admin')]
    const view = buildRosterView(withAdmin, directory, 'user-c')

    expect(view.canManage).toBe(true)
    expect(view.rows.find((r) => r.member.id === 'mem-a')?.mutable).toBe(false)
    expect(view.rows.find((r) => r.member.id === 'mem-b')?.mutable).toBe(true)
    // Admins may demote themselves — their own row is a normal row.
    expect(view.rows.find((r) => r.member.id === 'mem-c')?.mutable).toBe(true)
  })

  it('editors see a read-only roster', () => {
    const view = buildRosterView(roster, directory, 'user-b')

    expect(view.myRole).toBe('editor')
    expect(view.canManage).toBe(false)
    expect(view.rows.every((r) => !r.mutable)).toBe(true)
    expect(view.candidates).toEqual([])
  })

  it('offers only accounts not yet on the trip', () => {
    const view = buildRosterView(roster, directory, 'user-a')

    expect(view.candidates).toEqual([{ user_id: 'user-c', display_name: 'Carla' }])
  })

  it('resolves display names, falling back to the raw id', () => {
    const withUnknown = [...roster, member('mem-x', 'user-gone', 'editor')]
    const view = buildRosterView(withUnknown, directory, 'user-a')

    expect(view.rows.find((r) => r.member.id === 'mem-b')?.displayName).toBe('Sarah')
    expect(view.rows.find((r) => r.member.id === 'mem-x')?.displayName).toBe('user-gone')
  })

  it('sorts owner first, then by display name', () => {
    const many = [
      member('mem-c', 'user-c', 'admin'),
      member('mem-b', 'user-b', 'editor'),
      member('mem-a', 'user-a', 'owner'),
    ]
    const view = buildRosterView(many, directory, 'user-b')

    expect(view.rows.map((r) => r.displayName)).toEqual(['Andy', 'Carla', 'Sarah'])
  })

  it('an unknown own id (pre-fetch) yields a read-only view', () => {
    const view = buildRosterView(roster, directory, null)

    expect(view.myRole).toBe('')
    expect(view.canManage).toBe(false)
    expect(view.rows.every((r) => !r.mutable)).toBe(true)
  })
})
