// @vitest-environment jsdom
/**
 * FR-27.2: what M8's collapsed position row says without being opened. The
 * derivation lived in the template editor, which has no component test, so
 * every clause below was previously carried only by an e2e assertion on the
 * joined string.
 */
import { describe, expect, it, afterAll } from 'vitest'

import { setLocale } from '@/i18n'
import type { TemplateItem } from '@/types/domain'
import { positionChips } from '../positionChips'

afterAll(() => setLocale('en'))

function position(over: Partial<TemplateItem> = {}): TemplateItem {
  return {
    id: 'ti1',
    template_id: 'tpl1',
    item_id: 'it1',
    quantity: 1,
    assignment: 'trip_global',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
    ...over,
  }
}

describe('positionChips', () => {
  it('says nothing about a position that deviates in nothing', () => {
    expect(positionChips(position(), 0)).toEqual([])
  })

  it('names a per-person position', () => {
    expect(positionChips(position({ assignment: 'per_person' }), 0)).toEqual(['Per person'])
  })

  it('stays silent about packing, which is what most rows do', () => {
    expect(positionChips(position({ default_mode: 'pack' }), 0)).toEqual([])
  })

  it('names a shopping mode, which is the deviation', () => {
    expect(positionChips(position({ default_mode: 'buy_before' }), 0)).toEqual(['Buy before'])
  })

  it('names FR-5.6’s late packer', () => {
    expect(positionChips(position({ late_packer: true }), 0)).toEqual(['Late packer'])
  })

  it('counts FR-27.7’s open tasks into one chip, and says two of them in the plural', () => {
    expect(positionChips(position(), 1)).toEqual(['📋 1 preparation'])
    expect(positionChips(position(), 2)).toEqual(['📋 2 preparations'])
  })

  it('words a condition through the attribute catalogue, not by its stored value', () => {
    expect(positionChips(position({ conditions: { season: 'winter' } }), 0)).toEqual(['Winter'])
  })

  it('leaves out a condition that is not a single value — a list is not a chip', () => {
    expect(positionChips(position({ conditions: { season: ['winter', 'summer'] } }), 0)).toEqual([])
  })

  it('keeps the reading order when everything deviates at once', () => {
    const chips = positionChips(
      position({
        assignment: 'per_person',
        default_mode: 'buy_local',
        late_packer: true,
        conditions: { transport: 'bike' },
      }),
      1,
    )
    expect(chips).toEqual(['Per person', 'Buy there', 'Late packer', '📋 1 preparation', 'Bike'])
  })

  it('follows the locale', () => {
    setLocale('de')
    expect(positionChips(position({ assignment: 'per_person' }), 0)).not.toEqual(['Per person'])
    setLocale('en')
  })
})
