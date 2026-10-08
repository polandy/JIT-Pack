/**
 * G-14's ordering rule for a row menu: its entries fall into three bands —
 * what the row does now, the flags that stay on it, the entry that deletes —
 * listed in that order, a hairline where one band gives way to the next.
 *
 * Two of the three cost a call site nothing: an act is an ordinary button,
 * and the destructive band *is* Ionic's `destructive` role, whose hairline
 * and Ember surfaces.css and palette.css draw on every sheet. The flags band
 * is the one Ionic has no word for, so it travels as a class.
 */

/** The three bands, named by what their entries do to the row. */
export type SheetBand = 'act' | 'flag' | 'destructive'

/** G-14: the order the bands are listed in, top to bottom. */
export const SHEET_BAND_ORDER: readonly SheetBand[] = ['act', 'flag', 'destructive']

/** The class that marks a flag entry; surfaces.css draws the hairline above the first. */
export const SHEET_FLAG_CLASS = 'jp-sheet-flag'

/** What a band adds to an `ion-action-sheet` button. */
export interface SheetBandAttrs {
  role?: 'destructive'
  cssClass?: string
}

/** The role or class that puts an entry in its band; an act adds nothing. */
export function sheetBandAttrs(band: SheetBand = 'act'): SheetBandAttrs {
  if (band === 'destructive') return { role: 'destructive' }
  if (band === 'flag') return { cssClass: SHEET_FLAG_CLASS }
  return {}
}
