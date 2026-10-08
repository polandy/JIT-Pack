import { describe, expect, expectTypeOf, it } from 'vitest'
import { COLUMN_ENUMS, TABLE, type ColumnEnum } from '../tables'
import { TRACK_KIND, type TrackKind } from '../types'

/**
 * A vocabulary declared twice — once in `wire.go` for the upload endpoint,
 * once by the schema's CHECK for the row it lands in — is generated twice,
 * into `types.ts` and `tables.ts`, and nothing in either generator compares
 * the two. A kind added to one side only is a GPX upload the server stores
 * and the row then refuses, or the reverse.
 *
 * The values are held at run time; the types by `vue-tsc`, which checks
 * this file with the rest of the specs.
 */
describe('the track kinds of wire.go are the CHECK of both track tables (FR-29.17)', () => {
  const wire = Object.values(TRACK_KIND).sort()

  it.each([TABLE.ideaTracks, TABLE.excursionTracks] as const)('%s', (table) => {
    expect([...COLUMN_ENUMS[table].kind].sort()).toEqual(wire)
  })

  it('as types', () => {
    expectTypeOf<TrackKind>().toEqualTypeOf<ColumnEnum<'idea_tracks', 'kind'>>()
    expectTypeOf<TrackKind>().toEqualTypeOf<ColumnEnum<'excursion_tracks', 'kind'>>()
  })
})
