/**
 * The trips this device has hidden the forgotten radar on (FR-9.5).
 *
 * Device-local for the reason M14's „Nie mehr fragen" is: hiding a card is a
 * muting, not domain data, and the worst case is another device showing it
 * once more.
 */

const STORAGE_KEY = 'jitpack_radar_hidden'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

/** Whether the radar was hidden on this trip, on this device. */
export function isRadarHidden(tripId: string): boolean {
  return load().has(tripId)
}

/** Hide the radar on this trip, on this device. */
export function hideRadar(tripId: string): void {
  const hidden = load()
  hidden.add(tripId)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]))
  } catch {
    // A device that refuses storage shows the card again on the next visit,
    // which is noisier than asked for and never wrong.
  }
}
