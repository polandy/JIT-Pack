// @vitest-environment jsdom
/**
 * U-2 (design review 2026-09-02). M4's list and M5's sheet had each
 * transcribed these five sentences from the same fields, and had drifted:
 * the cases below are the rule both now read, including the two places
 * they used to disagree — a row with no readable timestamp, and where the
 * responsible person is appended.
 *
 * jsdom because the catalogue reads `localStorage` for the locale.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { setLocale } from '@/i18n'
import {
  lockNoteText,
  nameFrom,
  packedStampText,
  responsibleNote,
  skippedNote,
  stampText,
} from '@/lib/rowFacts'
import { relativeStamp } from '@/domain/stamp'
import type { ItemDependency, TripItem } from '@/types/domain'

const NOW = new Date('2026-03-01T18:00:00')

const directory = [
  { user_id: 'u-andy', display_name: 'Andy' },
  { user_id: 'u-nina', display_name: 'Nina' },
]
const nameOf = (userId: string | null) => nameFrom(directory, userId)

function row(overrides: Partial<TripItem> = {}): TripItem {
  return {
    id: 'ti-1',
    name: 'Zahnbürste',
    state: 'packed',
    packed_at: null,
    packed_by_user_id: null,
    packer_user_id: null,
    source_item_id: null,
    ...overrides,
  } as TripItem
}

beforeEach(() => setLocale('en'))

describe('nameFrom', () => {
  it('names a known user', () => {
    expect(nameFrom(directory, 'u-nina')).toBe('Nina')
  })

  it('returns null for nobody, so a line says less rather than something untrue', () => {
    expect(nameFrom(directory, null)).toBeNull()
    expect(nameFrom(directory, 'u-stranger')).toBeNull()
  })
})

describe('stampText', () => {
  it('words today as a word, and keeps the time absolute', () => {
    const stamp = relativeStamp('2026-03-01T14:32:00', NOW, 'en')
    expect(stampText(stamp)).toBe(`today ${stamp!.time}`)
  })

  it('words yesterday as a word', () => {
    expect(stampText(relativeStamp('2026-02-28T23:50:00', NOW, 'en'))).toMatch(/^yesterday /)
  })

  it('falls back to the date once the day cannot be named', () => {
    expect(stampText(relativeStamp('2026-02-20T09:00:00', NOW, 'en'))).toMatch(/Feb/)
  })

  it('is empty where there is no stamp, so a caller can still name the person', () => {
    expect(stampText(null)).toBe('')
  })
})

describe('packedStampText (FR-25.17)', () => {
  it('names who packed it and when', () => {
    const text = packedStampText(
      row({ packed_at: '2026-03-01T14:32:00', packed_by_user_id: 'u-andy' }),
      nameOf,
      NOW,
    )
    const time = relativeStamp('2026-03-01T14:32:00', NOW, 'en')!.time
    expect(text).toBe(`packed by Andy · today ${time}`)
  })

  it('states the act without a who where the packer cannot be named', () => {
    const text = packedStampText(row({ packed_at: '2026-03-01T14:32:00' }), nameOf, NOW)
    const time = relativeStamp('2026-03-01T14:32:00', NOW, 'en')!.time
    expect(text).toBe(`packed · today ${time}`)
  })

  it('names the packer even when the timestamp is missing', () => {
    expect(packedStampText(row({ packed_by_user_id: 'u-nina' }), nameOf, NOW)).toBe(
      'packed by Nina · ',
    )
  })

  it('says nothing where the row knows neither who nor when', () => {
    // The state badge has already said the row is packed; an empty
    // "packed · " under it is noise. M5 used to render exactly that.
    expect(packedStampText(row(), nameOf, NOW)).toBeNull()
    expect(packedStampText(row({ packed_at: 'not-a-date' }), nameOf, NOW)).toBeNull()
  })
})

describe('responsibleNote (FR-25.19)', () => {
  it('names the assignee where it is somebody other than the packer', () => {
    const text = responsibleNote(
      row({ packer_user_id: 'u-nina', packed_by_user_id: 'u-andy' }),
      nameOf,
    )
    expect(text).toBe('assigned to Nina')
  })

  it('says nothing where the assignee packed it themselves', () => {
    expect(
      responsibleNote(row({ packer_user_id: 'u-andy', packed_by_user_id: 'u-andy' }), nameOf),
    ).toBeNull()
  })

  it('says nothing where the row was never assigned', () => {
    expect(responsibleNote(row({ packed_by_user_id: 'u-andy' }), nameOf)).toBeNull()
  })

  it('says nothing where the assignee cannot be named', () => {
    expect(responsibleNote(row({ packer_user_id: 'u-gone' }), nameOf)).toBeNull()
  })
})

describe('lockNoteText (G-3)', () => {
  it('names the holder rather than only wearing a padlock', () => {
    expect(lockNoteText('u-nina', nameOf)).toBe('Nina is packing this right now')
  })

  it('still says the row is held when the holder cannot be named', () => {
    expect(lockNoteText('u-gone', nameOf)).toBe('Somebody is packing this right now')
  })

  it('says nothing where nobody holds the row', () => {
    expect(lockNoteText(null, nameOf)).toBeNull()
  })
})

describe('skippedNote (FR-5.5/20.2)', () => {
  const dependencies: ItemDependency[] = [
    { id: 'dep-1', item_id: 'mi-drone', depends_on_item_id: 'mi-battery' } as ItemDependency,
  ]
  const drone = row({
    id: 'ti-drone',
    name: 'Drohne',
    state: 'skipped',
    source_item_id: 'mi-drone',
  })
  const battery = row({
    id: 'ti-battery',
    name: 'Akku',
    state: 'skipped',
    source_item_id: 'mi-battery',
  })

  it('names the decision a co-skipped row came along with', () => {
    // The drone depends on the battery, so leaving the battery behind is
    // what took the drone along — the drone is the row that owes a reason.
    expect(skippedNote(drone, [drone, battery], dependencies)).toBe(
      'skipped: “Akku” is not on this trip',
    )
  })

  it('says only that a row was skipped on its own account', () => {
    expect(skippedNote(battery, [drone, battery], dependencies)).toBe('Deliberately skipped')
  })

  it('says nothing about a row that is not skipped', () => {
    expect(skippedNote(row({ state: 'packed' }), [], dependencies)).toBeNull()
  })
})
