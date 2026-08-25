import { describe, expect, it } from 'vitest'
import {
  DELETION_REMOVE,
  DELETION_RETIRE,
  activeOnly,
  countItemReferences,
  countTemplateReferences,
  deletionKind,
  isRetired,
} from '../masterDeletion'
import type { MasterItem, Template, TemplateItem, TripItem } from '../../types/domain'

const item = (id: string, retired_at: string | null = null): MasterItem => ({
  id,
  name: id,
  weight_grams: null,
  value_cents: null,
  retired_at,
})

const template = (id: string, retired_at: string | null = null): Template => ({
  id,
  owner_id: 'u',
  name: id,
  kind: 'group',
  retired_at,
})

const position = (id: string, item_id: string): TemplateItem =>
  ({ id, template_id: 'tpl', item_id, quantity: 1 }) as TemplateItem

const tripItem = (id: string, fields: Partial<TripItem>): TripItem =>
  ({ id, trip_id: 't', name: id, quantity: 1, ...fields }) as TripItem

describe('FR-24.3 — which deletion a row gets', () => {
  it('removes a row nothing references', () => {
    expect(deletionKind(0)).toBe(DELETION_REMOVE)
  })

  it('retires a row anything references, however little', () => {
    expect(deletionKind(1)).toBe(DELETION_RETIRE)
    expect(deletionKind(12)).toBe(DELETION_RETIRE)
  })

  it('counts an item both ways it can be referenced', () => {
    // A template position and a generated trip row are the two references
    // the server refuses a delete for; the client has to count the same two
    // or it states the wrong outcome before the user confirms.
    expect(
      countItemReferences('it-1', {
        positions: [position('p1', 'it-1'), position('p2', 'it-2')],
        tripItems: [
          tripItem('ti-1', { source_item_id: 'it-1' }),
          tripItem('ti-2', { source_item_id: 'it-9' }),
        ],
      }),
    ).toBe(2)
  })

  it('counts an unreferenced item as zero even with rows about other items', () => {
    expect(
      countItemReferences('it-lonely', {
        positions: [position('p1', 'it-1')],
        tripItems: [tripItem('ti-1', { source_item_id: 'it-1' })],
      }),
    ).toBe(0)
  })

  it('counts a Vorlage by the trip rows that name it as their source (FR-9.2)', () => {
    expect(
      countTemplateReferences('tpl-1', {
        tripItems: [
          tripItem('ti-1', { source_template_id: 'tpl-1' }),
          tripItem('ti-2', { source_template_id: 'tpl-2' }),
        ],
      }),
    ).toBe(1)
  })
})

describe('FR-24.3 — the marker as a display rule', () => {
  it('reads an absent marker as active', () => {
    expect(isRetired(item('a'))).toBe(false)
    expect(isRetired({})).toBe(false)
  })

  it('reads a stamped marker as retired', () => {
    expect(isRetired(item('a', '2026-08-25T10:00:00Z'))).toBe(true)
  })

  it('drops retired rows and keeps every active one, in order', () => {
    const rows = [item('a'), item('b', '2026-08-25T10:00:00Z'), item('c')]
    expect(activeOnly(rows).map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('filters templates by the same rule, so one entity cannot drift', () => {
    const rows = [template('g1'), template('g2', '2026-08-25T10:00:00Z')]
    expect(activeOnly(rows).map((r) => r.id)).toEqual(['g1'])
  })
})
