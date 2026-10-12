/**
 * Sync-API §7: what each WebSocket frame starts, decided without a socket.
 * The frames are runtime data, so a frame missing the ids its route needs is
 * a case too — it starts nothing.
 */
import { describe, it, expect, vi, type Mock } from 'vitest'

import type { WSEvent } from '@/api/types'
import { routeWSEvent, type WSRoutes } from '../wsRouting'

function routes(): { [K in keyof WSRoutes]: Mock<WSRoutes[K]> } {
  return {
    drainTrip: vi.fn<WSRoutes['drainTrip']>(),
    drainMaster: vi.fn<WSRoutes['drainMaster']>(),
    setPresence: vi.fn<WSRoutes['setPresence']>(),
    setRoster: vi.fn<WSRoutes['setRoster']>(),
    applyLocation: vi.fn<WSRoutes['applyLocation']>(),
    lockItem: vi.fn<WSRoutes['lockItem']>(),
    unlockItem: vi.fn<WSRoutes['unlockItem']>(),
    surfaceNotifications: vi.fn<WSRoutes['surfaceNotifications']>(),
  }
}

/** Routes one frame and answers the routes that were called, with their arguments. */
function route(event: WSEvent): Record<string, unknown[]> {
  const to = routes()
  routeWSEvent(event, to)
  return Object.fromEntries(
    Object.entries(to as Record<string, Mock>)
      .filter(([, fn]) => fn.mock.calls.length > 0)
      .map(([name, fn]) => [name, fn.mock.calls[0]!]),
  )
}

const location = {
  trip_id: 't1',
  user_id: 'u2',
  lat: 46.5,
  lon: 9.8,
  accuracy_m: 12,
  at: '2026-07-09T12:00:00Z',
  gone: false,
}

describe('routeWSEvent (Sync-API §7)', () => {
  it.each<[string, WSEvent, Record<string, unknown[]>]>([
    [
      'trip.changed pulls the trip',
      { type: 'trip.changed', payload: { trip_id: 't1', head_seq: 7 } },
      { drainTrip: ['t1'] },
    ],
    [
      'master.changed pulls the master feed',
      { type: 'master.changed', payload: { seq: 3 } },
      { drainMaster: [] },
    ],
    [
      'presence replaces the trip’s facepile',
      {
        type: 'presence',
        payload: { trip_id: 't1', users: [{ user_id: 'u1', device_count: 2, in_sync: true }] },
      },
      { setPresence: ['t1', [{ user_id: 'u1', device_count: 2, in_sync: true }]] },
    ],
    [
      'roster replaces the roster (FR-4.9)',
      { type: 'roster', payload: { users: [{ user_id: 'u2', trip_ids: ['t1'] }] } },
      { setRoster: [[{ user_id: 'u2', trip_ids: ['t1'] }]] },
    ],
    [
      'location applies the fix (FR-29.19)',
      { type: 'location', payload: location },
      { applyLocation: [location] },
    ],
    [
      'item.locked claims the row (G-3)',
      {
        type: 'item.locked',
        payload: { trip_id: 't1', item_id: 'i1', by_user: 'u2', name: 'Zelt' },
      },
      { lockItem: ['t1', 'i1', 'u2'] },
    ],
    [
      'item.unlocked releases it',
      {
        type: 'item.unlocked',
        payload: { trip_id: 't1', item_id: 'i1', by_user: 'u2', name: 'Zelt' },
      },
      { unlockItem: ['t1', 'i1'] },
    ],
    [
      'notification.created surfaces the unread',
      { type: 'notification.created', payload: { notification_id: 'n1' } },
      { surfaceNotifications: [] },
    ],
    ['pong starts nothing', { type: 'pong', payload: null }, {}],
  ])('%s', (_name, event, want) => {
    expect(route(event)).toEqual(want)
  })

  it.each<[string, WSEvent]>([
    [
      'a trip.changed with no trip',
      { type: 'trip.changed', payload: { trip_id: '', head_seq: 7 } },
    ],
    ['a presence with no trip', { type: 'presence', payload: { trip_id: '', users: [] } }],
    ['a location with no person', { type: 'location', payload: { ...location, user_id: '' } }],
    [
      'a lock with no row',
      { type: 'item.locked', payload: { trip_id: 't1', item_id: '', by_user: 'u2', name: '' } },
    ],
    [
      'an unlock with no trip',
      { type: 'item.unlocked', payload: { trip_id: '', item_id: 'i1', by_user: 'u2', name: '' } },
    ],
  ])('%s starts nothing', (_name, event) => {
    expect(route(event)).toEqual({})
  })

  it('a null payload where one is due starts nothing rather than throwing', () => {
    const event = { type: 'trip.changed', payload: null } as unknown as WSEvent
    expect(route(event)).toEqual({})
  })

  it('a presence or roster with no users list empties it', () => {
    const presence = {
      type: 'presence',
      payload: { trip_id: 't1', users: null },
    } as unknown as WSEvent
    expect(route(presence)).toEqual({ setPresence: ['t1', []] })
    const roster = { type: 'roster', payload: { users: null } } as unknown as WSEvent
    expect(route(roster)).toEqual({ setRoster: [[]] })
  })

  it('a frame type this client does not know is ignored (Sync-API §7)', () => {
    const event = { type: 'something.new', payload: {} } as unknown as WSEvent
    expect(route(event)).toEqual({})
  })
})
