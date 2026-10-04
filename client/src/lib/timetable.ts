/**
 * FR-29.18 — whether the connection search is offered (ADR-086).
 *
 * Two things decide it. The instance's switch, `JITPACK_TIMETABLE`, which an
 * operator turns off so no device asks transport.opendata.ch for anything;
 * Local Mode has no operator and keeps it on. And the device being online:
 * offline, the link and the hand fields are all there is.
 */
import { computed, ref, type ComputedRef } from 'vue'

/** Where the last known switch is kept, so an offline start keeps it. */
export const TIMETABLE_STORAGE_KEY = 'jitpack_timetable'
const OFF = 'off'

const offered = ref(true)
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
let listening = false

/** Applies the instance's switch for this session and persists it. */
export function setTimetable(on: boolean): void {
  offered.value = on
  try {
    if (on) localStorage.removeItem(TIMETABLE_STORAGE_KEY)
    else localStorage.setItem(TIMETABLE_STORAGE_KEY, OFF)
  } catch {
    // Storage unavailable (private mode) → still applied for this session.
  }
}

/** Reads the persisted switch and follows the connection; called before mount. */
export function initTimetable(): void {
  try {
    offered.value = localStorage.getItem(TIMETABLE_STORAGE_KEY) !== OFF
  } catch {
    // Storage unavailable → on until the server says otherwise.
  }
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))
}

const available = computed(() => offered.value && online.value)

/** Whether the search is offered right now. */
export function useTimetableOffered(): ComputedRef<boolean> {
  return available
}
