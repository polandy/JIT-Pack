// @vitest-environment jsdom
/**
 * U-1.4 (design review 2026-09-02). These seven derivations were computeds
 * inside `PackingListPage.vue`, so every one of them could only be reached
 * by rendering M4 and opening a sheet — and the absence buckets, which are
 * the whole reason the sheet is worded here rather than in `FilterSheet`,
 * had no test at all.
 *
 * jsdom because the catalogue reads `localStorage` for the locale.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { setLocale } from '@/i18n'
import {
  activeChips,
  emptyReason,
  FACET_ICONS,
  FACET_LABELS,
  filterFacets,
  filterSwitches,
  groupingAxis,
  onlyOthersHidden,
  optionLabel,
} from '@/lib/packingFilterPanel'
import { FACET_KEYS, FLAG_VALUES, NO_VALUE, noFacets } from '@/domain/packingView'
import type { FacetValue, PackingView } from '@/domain/packingView'
import { ITEM_MODES, type FacetKey, type Facets } from '@/types/domain'

function emptyFacetValues(): Record<FacetKey, FacetValue[]> {
  return { person: [], category: [], mode: [], container: [], flag: [] }
}

function view(overrides: Partial<PackingView> = {}): PackingView {
  return {
    groups: [],
    doneCount: 0,
    hiddenOtherCount: 0,
    hiddenOtherNames: [],
    facetValues: emptyFacetValues(),
    activeFacetCount: 0,
    matchCount: 0,
    narrowed: false,
    ...overrides,
  }
}

function option(overrides: Partial<FacetValue> = {}): FacetValue {
  return { value: 'x', label: 'x', count: 1, selected: false, ...overrides }
}

function withFacets(picked: Partial<Facets>): Facets {
  return { ...noFacets(), ...picked }
}

beforeEach(() => {
  setLocale('de')
})

describe('the panel names every axis and every flag it can be given', () => {
  it.each(FACET_KEYS)('has a label and a glyph for the %s facet (FR-25.11b)', (key) => {
    expect(FACET_LABELS[key]).toBeTruthy()
    expect(FACET_ICONS[key]).toBeTruthy()
  })

  it.each(ITEM_MODES)('words the %s procurement mode (FR-25.4a)', (mode) => {
    const label = optionLabel('mode', mode, null)
    expect(label).toBeTruthy()
    expect(label).not.toContain(mode)
  })

  it.each(FLAG_VALUES)('words the %s flag the view model can emit', (flag) => {
    const label = optionLabel('flag', flag, null)
    expect(label).toBeTruthy()
    expect(label).not.toContain(flag)
  })
})

describe('optionLabel (FR-25.11f)', () => {
  const cases: Array<{
    name: string
    key: FacetKey
    value: string
    label: string | null
    want: string
  }> = [
    {
      name: 'passes a data label straight through',
      key: 'category',
      value: 'Kleidung',
      label: 'Kleidung',
      want: 'Kleidung',
    },
    {
      name: 'calls the absent person "Gemeinsam", never "Alle"',
      key: 'person',
      value: NO_VALUE,
      label: null,
      want: 'Gemeinsam',
    },
    {
      name: 'calls the absent container "Ohne Gepäck"',
      key: 'container',
      value: NO_VALUE,
      label: null,
      want: 'Ohne Gepäck',
    },
    {
      name: 'falls back to "Ohne Kategorie" for every other absence',
      key: 'category',
      value: NO_VALUE,
      label: null,
      want: 'Ohne Kategorie',
    },
    {
      name: 'words a procurement mode',
      key: 'mode',
      value: 'buy_before',
      label: null,
      want: 'Vorher kaufen',
    },
    {
      name: 'words a flag',
      key: 'flag',
      value: 'missing',
      label: null,
      want: 'fehlt',
    },
    {
      name: 'shows the raw value where nothing else applies',
      key: 'person',
      value: 'Nina',
      label: null,
      want: 'Nina',
    },
  ]

  it.each(cases)('$name', ({ key, value, label, want }) => {
    expect(optionLabel(key, value, label)).toBe(want)
  })

  it('prefers the data label over the absence wording', () => {
    expect(optionLabel('person', NO_VALUE, 'Andy')).toBe('Andy')
  })
})

describe('filterFacets (FR-25.11d)', () => {
  it('drops an axis with nothing to offer rather than showing it empty', () => {
    const facets = filterFacets(
      view({
        facetValues: {
          ...emptyFacetValues(),
          category: [option({ value: 'Kleidung', label: 'Kleidung' })],
        },
      }),
    )
    expect(facets.map((facet) => facet.key)).toEqual(['category'])
  })

  it('keeps the axes in the view model order, not the object order', () => {
    const populated = Object.fromEntries(FACET_KEYS.map((key) => [key, [option()]])) as Record<
      FacetKey,
      FacetValue[]
    >
    expect(filterFacets(view({ facetValues: populated })).map((facet) => facet.key)).toEqual([
      ...FACET_KEYS,
    ])
  })

  it('carries the count and the selection through, and words the absence bucket', () => {
    const facets = filterFacets(
      view({
        facetValues: {
          ...emptyFacetValues(),
          person: [option({ value: NO_VALUE, label: null, count: 4, selected: true })],
        },
      }),
    )
    expect(facets[0]!.label).toBe('Person')
    expect(facets[0]!.options).toEqual([
      { value: NO_VALUE, label: 'Gemeinsam', count: 4, selected: true },
    ])
  })
})

describe('filterSwitches (FR-25.11i, FR-25.20)', () => {
  it('reports both switches with their own counts', () => {
    const switches = filterSwitches({
      showDone: true,
      showOthers: false,
      packedCount: 7,
      hiddenOtherCount: 3,
    })
    expect(switches.map((s) => [s.key, s.on, s.count])).toEqual([
      ['done', true, 7],
      ['others', false, 3],
    ])
    expect(switches.every((s) => s.label !== '' && s.hint !== '')).toBe(true)
  })
})

describe('groupingAxis (FR-25.16)', () => {
  it('offers the four groupings and marks the current one', () => {
    const axis = groupingAxis('person')
    expect(axis.value).toBe('person')
    expect(axis.options.map((o) => o.value)).toEqual(['category', 'person', 'container', 'status'])
    expect(axis.options.every((o) => o.label !== '' && o.icon !== '')).toBe(true)
  })
})

describe('activeChips (FR-25.11a)', () => {
  it('names a picked value by its axis and its own wording', () => {
    const chips = activeChips(
      view({
        facetValues: {
          ...emptyFacetValues(),
          person: [option({ value: NO_VALUE, label: null, selected: true })],
        },
      }),
      withFacets({ person: [NO_VALUE] }),
    )
    expect(chips).toEqual([
      { key: 'person', value: NO_VALUE, facetLabel: 'Person', label: 'Gemeinsam' },
    ])
  })

  it('still names a value the view model no longer offers', () => {
    const chips = activeChips(view(), withFacets({ category: ['Kleidung'] }))
    expect(chips.map((chip) => chip.label)).toEqual(['Kleidung'])
  })

  it('is empty when nothing is picked', () => {
    expect(activeChips(view(), noFacets())).toEqual([])
  })
})

describe('onlyOthersHidden (FR-25.20)', () => {
  const cases: Array<{
    name: string
    search: string
    active: number
    hidden: number
    want: boolean
  }> = [
    { name: 'nothing but other people’s rows', search: '', active: 0, hidden: 2, want: true },
    {
      name: 'a search is a filter the reader set',
      search: 'zelt',
      active: 0,
      hidden: 2,
      want: false,
    },
    { name: 'whitespace is not a search', search: '   ', active: 0, hidden: 2, want: true },
    { name: 'a facet is a filter the reader set', search: '', active: 1, hidden: 2, want: false },
    { name: 'nobody else is holding anything', search: '', active: 0, hidden: 0, want: false },
  ]

  it.each(cases)('$name', ({ search, active, hidden, want }) => {
    expect(
      onlyOthersHidden(view({ activeFacetCount: active, hiddenOtherCount: hidden }), search),
    ).toBe(want)
  })
})

describe('emptyReason (FR-25.11e)', () => {
  it('names the term and the filter when both are narrowing', () => {
    expect(emptyReason(view({ activeFacetCount: 1 }), 'zelt', 0)).toContain('zelt')
    expect(emptyReason(view({ activeFacetCount: 1 }), 'zelt', 0)).toContain('Filter')
  })

  it('names only the term when only a search is narrowing', () => {
    const reason = emptyReason(view(), 'zelt', 5)
    expect(reason).toContain('zelt')
    expect(reason).not.toContain('5')
  })

  it('names the people rather than the filter when FR-25.20 is what hid the rows', () => {
    const reason = emptyReason(
      view({ hiddenOtherCount: 2, hiddenOtherNames: ['Nina', 'Timo'] }),
      '',
      2,
    )
    expect(reason).toContain('Nina · Timo')
    expect(reason).not.toContain('Filter')
  })

  it('counts what the filter is holding back when a facet is set', () => {
    expect(emptyReason(view({ activeFacetCount: 1 }), '', 3)).toContain('3')
  })
})
