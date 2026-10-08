/**
 * G-14's one ordering rule for a row menu: acts, then flags, then the entry
 * that deletes. The bands are what each entry is *declared* as; the order is
 * what every menu builder lists them in — both held here over M4's row menu,
 * the one menu with all three bands, across every row it can be opened on.
 */
import { describe, it, expect } from 'vitest'

import { clusterMenuEntries, type ClusterInstance } from '@/domain/clusterActions'
import { rowMenuEntries, type RowMenuContext, type RowMenuItem } from '@/domain/rowMenu'
import { ROW_MENU_BUTTONS } from '@/lib/rowMenuButtons'
import {
  SHEET_BAND_ORDER,
  SHEET_FLAG_CLASS,
  sheetBandAttrs,
  type SheetBand,
} from '@/lib/sheetBands'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK } from '@/types/domain'
import { CLUSTER_MENU_BUTTONS } from '@/views/trips/packing/usePackingMenus'

function bandRank(band: SheetBand | undefined): number {
  return SHEET_BAND_ORDER.indexOf(band ?? 'act')
}

/** Every row and context a hold can meet, as the cross product of its switches. */
function everyMenu(): { item: RowMenuItem; ctx: RowMenuContext }[] {
  const flags = [false, true]
  const out: { item: RowMenuItem; ctx: RowMenuContext }[] = []
  for (const state of ['open', 'packed', 'skipped'] as const)
    for (const mode of [ITEM_MODE_PACK, ITEM_MODE_BUY_LOCAL])
      for (const late_packer of flags)
        for (const flag_unused of flags)
          for (const locked of flags)
            for (const mine of flags)
              for (const judgeable of flags)
                for (const forWhom of flags)
                  out.push({
                    item: { state, mode, late_packer, flag_unused },
                    ctx: {
                      closingPass: false,
                      locked,
                      canTakeOver: true,
                      mine,
                      judgeable,
                      forWhom,
                    },
                  })
  return out
}

describe('sheetBandAttrs (G-14)', () => {
  it('puts the deleting entry in Ionic’s destructive role', () => {
    expect(sheetBandAttrs('destructive')).toEqual({ role: 'destructive' })
  })

  it('marks a flag with the class the hairline is drawn from', () => {
    expect(sheetBandAttrs('flag')).toEqual({ cssClass: SHEET_FLAG_CLASS })
  })

  it('adds nothing to an act, named or not', () => {
    expect(sheetBandAttrs('act')).toEqual({})
    expect(sheetBandAttrs()).toEqual({})
  })
})

describe('M4’s row menu in G-14’s bands (FR-5.5, FR-25.25, FR-9.3, FR-5.8)', () => {
  it('declares the two statements about later as flags, and removal alone as destructive', () => {
    const inBand = (band: SheetBand) =>
      Object.entries(ROW_MENU_BUTTONS)
        .filter(([, button]) => (button.band ?? 'act') === band)
        .map(([action]) => action)
        .sort()

    expect(inBand('flag')).toEqual(['flagUnused', 'latePackerOff', 'latePackerOn', 'unflagUnused'])
    expect(inBand('destructive')).toEqual(['remove'])
  })

  it('lists acts, then flags, then removal — on every row a hold can open it on', () => {
    const menus = everyMenu()
    // The positive half: the cross product does reach a menu with all three
    // bands, so the order below is held over the case that can break it.
    const full = menus.some(({ item, ctx }) => {
      const bands = new Set(rowMenuEntries(item, ctx).map((a) => ROW_MENU_BUTTONS[a].band ?? 'act'))
      return bands.size === SHEET_BAND_ORDER.length
    })
    expect(full).toBe(true)

    for (const { item, ctx } of menus) {
      const ranks = rowMenuEntries(item, ctx).map((a) => bandRank(ROW_MENU_BUTTONS[a].band))
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    }
  })
})

describe('M4’s cluster head menu in G-14’s bands (FR-25.19, FR-25.25)', () => {
  it('stands the assignment with the two flags, and lists acts, flags, then removal', () => {
    const inBand = (band: SheetBand) =>
      Object.entries(CLUSTER_MENU_BUTTONS)
        .filter(([, button]) => (button.band ?? 'act') === band)
        .map(([action]) => action)
        .sort()
    expect(inBand('flag')).toEqual([
      'assignAll',
      'flagUnused',
      'latePackerOff',
      'latePackerOn',
      'unflagUnused',
    ])
    expect(inBand('destructive')).toEqual(['remove'])

    const open = (id: string, late_packer: boolean): ClusterInstance => ({
      id,
      row: { state: 'open', mode: ITEM_MODE_PACK, late_packer, flag_unused: false },
      lockedBy: null,
      mine: false,
    })
    for (const late_packer of [false, true]) {
      const entries = clusterMenuEntries([open('a', late_packer), open('b', late_packer)], {
        closingPass: false,
        canAssign: true,
        judgeable: true,
        forWhom: true,
      })
      const ranks = entries.map((a) => bandRank(CLUSTER_MENU_BUTTONS[a].band))
      expect(new Set(ranks).size).toBe(SHEET_BAND_ORDER.length)
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    }
  })
})
