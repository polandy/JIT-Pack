import { describe, expect, it } from 'vitest'

import { trackSettingsColumns } from '../rows'

describe('trackSettingsColumns (FR-29.17)', () => {
  it('writes the flag as the integer column SQLite keeps', () => {
    expect(trackSettingsColumns({ name: 'Seeweg', with_kid: true })).toEqual({
      name: 'Seeweg',
      with_kid: 1,
    })
    expect(trackSettingsColumns({ with_kid: false })).toEqual({ with_kid: 0 })
  })

  it('writes no column a change did not name', () => {
    expect(trackSettingsColumns({ kind: 'bike', pause_min: 0 })).toEqual({
      kind: 'bike',
      pause_min: 0,
    })
    expect(trackSettingsColumns({})).toEqual({})
  })
})
