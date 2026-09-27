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
  refreshOutline,
  removeCircleOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons'

import type { RowMenuAction } from '@/domain/rowMenu'
import type { MessageKey } from '@/i18n'

/** How one menu entry reads: its catalogue key, its glyph, and a destructive role. */
export interface RowMenuButton {
  labelKey: MessageKey
  icon: string
  role?: 'destructive'
}

export const ROW_MENU_BUTTONS: Record<RowMenuAction, RowMenuButton> = {
  takeover: { labelKey: 'packing.takeoverAction', icon: lockOpenOutline },
  release: { labelKey: 'packing.releaseAction', icon: lockOpenOutline },
  unskip: { labelKey: 'packing.unskipAction', icon: refreshOutline },
  quantity: { labelKey: 'quantity.edit', icon: layersOutline },
  packingNow: { labelKey: 'mode.pack', icon: contrastOutline },
  skip: { labelKey: 'packing.skipAction', icon: closeCircleOutline },
  // FR-5.9: the glyphs the row's own mode badge shows, so the entry names the
  // state it leaves the row in.
  buyLocal: { labelKey: 'mode.buyLocal', icon: locationOutline },
  packInstead: { labelKey: 'packing.packInsteadAction', icon: bagHandleOutline },
  latePackerOn: { labelKey: 'packing.latePackerOn', icon: timeOutline },
  latePackerOff: { labelKey: 'packing.latePackerOff', icon: timeOutline },
  flagUnused: { labelKey: 'packing.flagUnusedAction', icon: removeCircleOutline },
  unflagUnused: { labelKey: 'packing.unflagUnusedAction', icon: removeCircleOutline },
  // FR-5.8: the one entry that deletes — iOS paints it red, the way
  // `confirmDestructive` marks its button.
  remove: { labelKey: 'packing.removeAction', icon: trashOutline, role: 'destructive' },
}
