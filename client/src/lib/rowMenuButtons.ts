/**
 * The wording and glyph of each entry M4's row menu can offer (FR-5.5) —
 * `domain/rowMenu` decides which, this names them. Shared with every list
 * built like M4 (M27, FR-31.6), so one act reads the same wherever it is held.
 */
import {
  bagHandleOutline,
  closeCircleOutline,
  contrastOutline,
  layersOutline,
  locationOutline,
  lockOpenOutline,
  peopleOutline,
  refreshOutline,
  removeCircleOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons'

import type { RowMenuAction } from '@/domain/rowMenu'
import type { MessageKey } from '@/i18n'
import type { SheetBand } from '@/lib/sheetBands'

/** How one menu entry reads: its catalogue key, its glyph, and its G-14 band (an act unless named). */
export interface RowMenuButton {
  labelKey: MessageKey
  icon: string
  band?: SheetBand
}

export const ROW_MENU_BUTTONS: Record<RowMenuAction, RowMenuButton> = {
  takeover: { labelKey: 'packing.takeoverAction', icon: lockOpenOutline },
  release: { labelKey: 'packing.releaseAction', icon: lockOpenOutline },
  unskip: { labelKey: 'packing.unskipAction', icon: refreshOutline },
  quantity: { labelKey: 'quantity.edit', icon: layersOutline },
  // FR-25.28: the people an item is for.
  forWhom: { labelKey: 'packing.forWhomAction', icon: peopleOutline },
  packingNow: { labelKey: 'mode.pack', icon: contrastOutline },
  skip: { labelKey: 'packing.skipAction', icon: closeCircleOutline },
  // FR-5.9: the glyphs the row's own mode badge shows, so the entry names the
  // state it leaves the row in.
  buyLocal: { labelKey: 'mode.buyLocal', icon: locationOutline },
  packInstead: { labelKey: 'packing.packInsteadAction', icon: bagHandleOutline },
  // G-14: the two statements that stay on the row and speak about later —
  // set apart from what the row does now.
  latePackerOn: { labelKey: 'packing.latePackerOn', icon: timeOutline, band: 'flag' },
  latePackerOff: { labelKey: 'packing.latePackerOff', icon: timeOutline, band: 'flag' },
  flagUnused: { labelKey: 'packing.flagUnusedAction', icon: removeCircleOutline, band: 'flag' },
  unflagUnused: { labelKey: 'packing.unflagUnusedAction', icon: removeCircleOutline, band: 'flag' },
  // FR-5.8: the one entry that deletes.
  remove: { labelKey: 'packing.removeAction', icon: trashOutline, band: 'destructive' },
}
