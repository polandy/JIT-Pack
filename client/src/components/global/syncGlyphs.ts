/**
 * The glyph each sync state shows.
 *
 * Two surfaces render it — the app-bar indicator and the detail sheet behind
 * it — and a second copy of the mapping is how a glyph and its own detail come
 * to show different things. Its labels live beside `SyncState` itself.
 */
import {
  cloudDoneOutline,
  cloudOfflineOutline,
  phonePortraitOutline,
  syncOutline,
} from 'ionicons/icons'

import type { SyncState } from '@/composables/useSyncStatus'

/** The icon each state shows. `local` is a device, not a cloud (FR-19.6). */
export const SYNC_GLYPHS: Record<SyncState, string> = {
  synced: cloudDoneOutline,
  syncing: syncOutline,
  offline: cloudOfflineOutline,
  local: phonePortraitOutline,
}
