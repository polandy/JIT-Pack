import { describe, expect, it } from 'vitest'
import { API } from '../routes'

/**
 * NFR-4.14's third point, as assertions: the path names the scope first, then
 * the resource; the master partition's scope segment is `master`; an export
 * names its format as the path's extension (ADR-027).
 *
 * These cases are the client half of `TestRouteShapes_ScopeFirst` in
 * `internal/api/route_shapes_test.go`. Neither half can catch a rename the
 * other side did not follow — that is the wire gate's job for the envelopes
 * and, for the paths, the reason both tables spell the same strings.
 */
describe('API routes', () => {
  it('leads with the scope for a trip', () => {
    expect(API.tripSync('t1')).toBe('/api/v1/trips/t1/sync')
    expect(API.tripConflicts('t1')).toBe('/api/v1/trips/t1/conflicts')
    expect(API.tripConflictRevert('t1', 'c1')).toBe('/api/v1/trips/t1/conflicts/c1/revert')
    expect(API.tripExportCsv('t1')).toBe('/api/v1/trips/t1/export.csv')
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
})
