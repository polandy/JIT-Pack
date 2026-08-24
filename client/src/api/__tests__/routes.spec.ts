import { describe, expect, it } from 'vitest'
import { API } from '../routes'

/**
 * NFR-4.14's third point, as assertions: the path names the scope first, then
 * the resource; the master partition's scope segment is `master`; an export
 * names its format as the path's extension (ADR-027).
 *
 * This file is generated from `internal/api/wire.go`, so it can no longer
 * disagree with the server about a path — the gate regenerates it. What these
 * cases still hold is the *values*: a rename in the contract arrives here as a
 * red test rather than as a silently regenerated file, which is what makes it
 * a decision. `internal/api/routes_test.go` holds the same paths against the
 * mux.
 */
describe('API routes', () => {
  it('leads with the scope for a trip', () => {
    expect(API.tripSync('t1')).toBe('/api/v1/trips/t1/sync')
    expect(API.tripConflicts('t1')).toBe('/api/v1/trips/t1/conflicts')
    expect(API.tripConflictRevert('t1', 'c1')).toBe('/api/v1/trips/t1/conflicts/c1/revert')
    expect(API.tripItemTakeover('t1', 'ti1')).toBe('/api/v1/trips/t1/items/ti1/takeover')
    expect(API.tripLockEvents('t1')).toBe('/api/v1/trips/t1/lock-events')
    expect(API.tripExportCSV('t1')).toBe('/api/v1/trips/t1/export.csv')
  })

  it('gives the master partition a scope segment of its own', () => {
    expect(API.masterSync).toBe('/api/v1/master/sync')
    expect(API.masterConflicts).toBe('/api/v1/master/conflicts')
    expect(API.masterConflictRevert('c2')).toBe('/api/v1/master/conflicts/c2/revert')
  })

  it('scopes the full export to the caller and names its format', () => {
    expect(API.meExport).toBe('/api/v1/me/export.json')
  })

  it('spells no path twice', () => {
    const built = Object.values(API).map((r) => (typeof r === 'function' ? r('x', 'y') : r))
    expect(new Set(built).size).toBe(built.length)
  })

  /**
   * Every entry, pinned. The four routes that are only reached from a view
   * with no unit spec — `authConfig` from App.vue and LoginPage, `authToken`
   * from CallbackPage, `userAvatar` from AdminPage — have their value asserted
   * nowhere else, so a typo in this file would reach the running app with the
   * whole suite green. That is the failure this file exists to prevent, and it
   * would be silly to leave it open in the file itself.
   */
  it('pins every path it declares', () => {
    expect(
      Object.fromEntries(
        Object.entries(API).map(([k, r]) => [k, typeof r === 'function' ? r('ID1', 'ID2') : r]),
      ),
    ).toEqual({
      tripSync: '/api/v1/trips/ID1/sync',
      tripConflicts: '/api/v1/trips/ID1/conflicts',
      tripConflictRevert: '/api/v1/trips/ID1/conflicts/ID2/revert',
      tripItemTakeover: '/api/v1/trips/ID1/items/ID2/takeover',
      tripLockEvents: '/api/v1/trips/ID1/lock-events',
      tripExportCSV: '/api/v1/trips/ID1/export.csv',
      masterSync: '/api/v1/master/sync',
      masterConflicts: '/api/v1/master/conflicts',
      masterConflictRevert: '/api/v1/master/conflicts/ID1/revert',
      me: '/api/v1/me',
      meNotificationPrefs: '/api/v1/me/notification-prefs',
      meExport: '/api/v1/me/export.json',
      users: '/api/v1/users',
      userAvatar: '/api/v1/users/ID1/avatar',
      userDisplayName: '/api/v1/users/ID1/display-name',
      itemImage: '/api/v1/items/ID1/image',
      notifications: '/api/v1/notifications',
      notificationRead: '/api/v1/notifications/ID1/read',
      pushVAPIDKey: '/api/v1/push/vapid-key',
      pushSubscriptions: '/api/v1/push/subscriptions',
      adminUsers: '/api/v1/admin/users',
      adminDeactivateUser: '/api/v1/admin/users/ID1/deactivate',
      adminReactivateUser: '/api/v1/admin/users/ID1/reactivate',
      adminResetAvatar: '/api/v1/admin/users/ID1/avatar',
      adminResetDisplayName: '/api/v1/admin/users/ID1/display-name',
      authToken: '/api/v1/auth/token',
      authRefresh: '/api/v1/auth/refresh',
      authConfig: '/api/v1/auth/config',
      ws: '/ws',
      health: '/health',
    })
  })
})
