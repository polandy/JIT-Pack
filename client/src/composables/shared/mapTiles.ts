/**
 * FR-29.17 — whether a map draws its background tiles (ADR-085).
 *
 * Two things decide it. The instance's switch, `JITPACK_MAP_TILES`, which
 * an operator turns off so no device asks swisstopo or OpenStreetMap for
 * anything; Local Mode has no operator and keeps it on. And the device
 * being online: offline, a map is the line alone, said as such.
 *
 * Reactive, like the currency beside it: the switch arrives from the server
 * after the first paint, and the connection comes and goes while a map is
 * open.
 */
import { computed, ref, type ComputedRef } from 'vue'

/** Where the last known switch is kept, so an offline start keeps it. */
export const MAP_TILES_STORAGE_KEY = 'jitpack_map_tiles'
const OFF = 'off'

/** Whether a map draws tiles: yes, not on this instance, or not while offline. */
export type TileState = 'on' | 'off' | 'offline'

const offered = ref(true)
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
let listening = false

/** Applies the instance's switch for this session and persists it. */
export function setMapTiles(on: boolean): void {
  offered.value = on
  try {
    if (on) localStorage.removeItem(MAP_TILES_STORAGE_KEY)
    else localStorage.setItem(MAP_TILES_STORAGE_KEY, OFF)
  } catch {
    // Storage unavailable (private mode) → still applied for this session.
  }
}

/** Reads the persisted switch and follows the connection; called before mount. */
export function initMapTiles(): void {
  try {
    offered.value = localStorage.getItem(MAP_TILES_STORAGE_KEY) !== OFF
  } catch {
    // Storage unavailable → tiles on until the server says otherwise.
  }
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))
}

const state = computed<TileState>(() => (!offered.value ? 'off' : online.value ? 'on' : 'offline'))

/** Whether the maps on screen draw tiles right now. */
export function useTileState(): ComputedRef<TileState> {
  return state
}
