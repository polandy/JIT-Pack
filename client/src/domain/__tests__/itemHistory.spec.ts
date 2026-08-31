/**
 * FR-27.8 / FR-27.9 — M10's rear-view, the two pure aggregations.
 *
 * Both were specified in July, built in the concept prototype, and existed
 * nowhere in the app until 2026-08-31.
 */
import { describe, it, expect } from 'vitest'

import {
  containingTemplates,
  commentsOnItem,
  type PositionRef,
  type TemplateRef,
  type TripComments,
} from '../itemHistory'

const TEMPLATES: TemplateRef[] = [
  { id: 't-sommer', name: 'Sommerferien', kind: 'vacation' },
  { id: 't-foto', name: 'Makro Fotografie', kind: 'group' },
  { id: 't-velo', name: 'Velo', kind: 'group' },
]

describe('containingTemplates (FR-27.8)', () => {
  const positions: PositionRef[] = [
    { template_id: 't-foto', item_id: 'i-kamera' },
    { template_id: 't-velo', item_id: 'i-helm' },
    { template_id: 't-sommer', item_id: 'i-kamera' },
  ]

  it('names every template holding the item, with its scope', () => {
    expect(containingTemplates('i-kamera', TEMPLATES, positions)).toEqual([
      {
        templateId: 't-foto',
        templateName: 'Makro Fotografie',
        kind: 'group',
        positions: 1,
        retired: false,
      },
      {
        templateId: 't-sommer',
        templateName: 'Sommerferien',
        kind: 'vacation',
        positions: 1,
        retired: false,
      },
    ])
  })

  it('sorts by name rather than by the order templates arrived in', () => {
    const names = containingTemplates('i-kamera', TEMPLATES, positions).map((c) => c.templateName)
    expect(names).toEqual(['Makro Fotografie', 'Sommerferien'])
  })

  it('is empty for an item nothing holds', () => {
    expect(containingTemplates('i-lonely', TEMPLATES, positions)).toEqual([])
  })

  it('counts a template that names the item twice once, with the count', () => {
    const twice: PositionRef[] = [
      { template_id: 't-foto', item_id: 'i-kamera' },
      { template_id: 't-foto', item_id: 'i-kamera' },
    ]
    const result = containingTemplates('i-kamera', TEMPLATES, twice)
    expect(result).toHaveLength(1)
    expect(result[0]!.positions).toBe(2)
  })

  /**
   * FR-24.3: a retired Vorlage is why the *item* was retired rather than
   * removed, so dropping it here would leave a list shorter than the count on
   * the card below it.
   */
  it('keeps a retired template on the list and marks it', () => {
    const withRetired: TemplateRef[] = [
      { id: 't-foto', name: 'Makro Fotografie', kind: 'group', retired_at: '2026-08-01T00:00:00Z' },
    ]
    const result = containingTemplates('i-kamera', withRetired, [
      { template_id: 't-foto', item_id: 'i-kamera' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.retired).toBe(true)
  })

  it('marks an active template as not retired', () => {
    expect(containingTemplates('i-kamera', TEMPLATES, positions)[0]!.retired).toBe(false)
  })

  /**
   * The list answers the same question as the FR-2.4 usage count's template
   * half, so a Vorlage that only *includes* a group holding the item is not
   * on it — that Vorlage's own positions do not name the item.
   */
  it('does not walk includes: only a template’s own positions count', () => {
    const viaInclude: PositionRef[] = [{ template_id: 't-foto', item_id: 'i-kamera' }]
    expect(containingTemplates('i-kamera', TEMPLATES, viaInclude).map((c) => c.templateId)).toEqual(
      ['t-foto'],
    )
  })
})

describe('commentsOnItem (FR-27.9)', () => {
  const trips: TripComments[] = [
    {
      tripId: 'trip-2025',
      tripName: 'Laos 2025',
      items: [
        { id: 'ti-1', source_item_id: 'i-kamera' },
        { id: 'ti-2', source_item_id: 'i-helm' },
      ],
      comments: [
        {
          id: 'c-1',
          trip_item_id: 'ti-1',
          author_id: 'u-andy',
          body: 'Ersatzakku mitnehmen',
          created_at: '2025-08-02T10:00:00Z',
        },
        {
          id: 'c-2',
          trip_item_id: 'ti-2',
          author_id: 'u-mia',
          body: 'Helm ist zu klein',
          created_at: '2025-08-03T10:00:00Z',
        },
        // A trip-level comment (FR-7.1) belongs to no row and to no item.
        {
          id: 'c-3',
          trip_item_id: null,
          author_id: 'u-andy',
          body: 'Zug war pünktlich',
          created_at: '2025-08-04T10:00:00Z',
        },
      ],
    },
    {
      tripId: 'trip-2024',
      tripName: 'Moskau 2024',
      items: [{ id: 'ti-9', source_item_id: 'i-kamera' }],
      comments: [
        {
          id: 'c-9',
          trip_item_id: 'ti-9',
          author_id: 'u-mia',
          body: 'Objektivdeckel verloren',
          created_at: '2024-07-01T10:00:00Z',
        },
      ],
    },
  ]

  it('gathers the item’s comments across trips, newest first', () => {
    const result = commentsOnItem('i-kamera', trips)
    expect(result.map((c) => c.commentId)).toEqual(['c-1', 'c-9'])
    expect(result[0]).toMatchObject({
      tripId: 'trip-2025',
      tripName: 'Laos 2025',
      authorId: 'u-andy',
      body: 'Ersatzakku mitnehmen',
    })
  })

  it('leaves another item’s comment alone', () => {
    expect(commentsOnItem('i-helm', trips).map((c) => c.body)).toEqual(['Helm ist zu klein'])
  })

  it('never picks up a trip-level comment, which belongs to no item', () => {
    const bodies = trips.flatMap((t) => commentsOnItem('i-kamera', [t])).map((c) => c.body)
    expect(bodies).not.toContain('Zug war pünktlich')
  })

  it('is empty for an item no trip ever carried', () => {
    expect(commentsOnItem('i-unused', trips)).toEqual([])
  })

  /**
   * An ad-hoc row has no source item. Matching it by name would put one
   * item's remark on another — the same argument FR-27.5 makes against fuzzy
   * folding, and the reason this join is the foreign key and nothing else.
   */
  it('ignores an ad-hoc row, which has no source item', () => {
    const adhoc: TripComments[] = [
      {
        tripId: 'trip-x',
        tripName: 'X',
        items: [{ id: 'ti-x', source_item_id: null }],
        comments: [
          {
            id: 'c-x',
            trip_item_id: 'ti-x',
            author_id: 'u',
            body: 'nope',
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
      },
    ]
    expect(commentsOnItem('i-kamera', adhoc)).toEqual([])
  })

  it('sorts an undated comment last rather than first', () => {
    const undated: TripComments[] = [
      {
        tripId: 'trip-x',
        tripName: 'X',
        items: [{ id: 'ti-x', source_item_id: 'i-kamera' }],
        comments: [
          { id: 'c-old', trip_item_id: 'ti-x', author_id: 'u', body: 'a', created_at: null },
          {
            id: 'c-new',
            trip_item_id: 'ti-x',
            author_id: 'u',
            body: 'b',
            created_at: '2020-01-01T00:00:00Z',
          },
        ],
      },
    ]
    expect(commentsOnItem('i-kamera', undated).map((c) => c.commentId)).toEqual(['c-new', 'c-old'])
  })
})
