import { describe, it, expect } from 'vitest'
import { dbBool, jsonColumn, parseJsonColumn, rowFrom } from '@/sync/columns'

describe('rowFrom', () => {
  it('writes only the keys the patch actually carries (NFR-4.2a)', () => {
    // The point of a field-level upsert: a column the caller did not name is
    // not restated, so it cannot overwrite what another device wrote there.
    expect(rowFrom({ name: 'Kulturbeutel' })).toEqual({ name: 'Kulturbeutel' })
  })

  it('drops a key whose value is undefined, so it cannot blank a column', () => {
    // `{ name: undefined }` is a key as far as Object.entries is concerned,
    // and a spread would have carried it into the row. Asserted as an absent
    // key, not with toEqual, which reads an undefined value as no key at all.
    expect(Object.keys(rowFrom({ name: undefined, quantity: 2 }))).toEqual(['quantity'])
  })

  it('passes a null through, because null is a value a column can hold', () => {
    expect(rowFrom({ carrier_traveler_id: null })).toEqual({ carrier_traveler_id: null })
  })

  it('renders a named key through its codec and leaves the rest alone', () => {
    const row = rowFrom(
      { conditions: { season: 'winter' }, late_packer: true, quantity: 3 },
      { conditions: jsonColumn, late_packer: dbBool },
    )
    expect(row).toEqual({
      conditions: JSON.stringify({ season: 'winter' }),
      late_packer: 1,
      quantity: 3,
    })
  })

  it('runs the codec for a null too — absent is a value the column encodes', () => {
    // The FR-15.2 chips clear every condition by sending null; that must
    // reach the column as SQL NULL rather than the string "null".
    expect(rowFrom({ conditions: null }, { conditions: jsonColumn })).toEqual({ conditions: null })
    expect(
      parseJsonColumn(rowFrom({ conditions: null }, { conditions: jsonColumn }).conditions, 42),
    ).toBe(42)
  })
})
