/**
 * Live location on this device (FR-29.19, ADR-087): its own position, which
 * trips it shares that position on, and whether the others' are drawn.
 *
 * One per app, made by the composition root (`App.vue`) and injected where a
 * map wants it, because the device has one position and one watch on it.
 * The device is asked for its position only on a person's tap — the 📍 on a
 * map or the share switch — never on its own; and the watch runs only while
 * a map is open or a trip is shared, since it costs battery.
 *
 * The rules — when a position is sent, when another is stale — are
 * `lib/liveLocation.ts`'s. Nothing here is stored but the two choices,
 * per device, in `localStorage`.
 */
import { ref, type InjectionKey, type Ref } from 'vue'

import type { LocationFrame } from '@/sync/webSocket'
import { shouldShare, type Fix, type PeopleFixes } from '@/lib/liveLocation'

/** What the composable needs of the orchestrator. */
export interface LiveLocationHost {
  shareLocation(tripId: string, fix: LocationFrame | null): void
  getLiveLocations(tripId: string): PeopleFixes
}

/** The slice of `navigator.geolocation` used — a seam for the specs. */
export interface GeoSource {
  watchPosition(
    onPosition: (position: {
      coords: { latitude: number; longitude: number; accuracy: number }
    }) => void,
    onError: (error: { code: number }) => void,
    options?: { enableHighAccuracy?: boolean; maximumAge?: number },
  ): number
  clearWatch(id: number): void
}

/** What the device's position is doing. */
export type LocateState = 'off' | 'asking' | 'on' | 'denied' | 'unavailable'

/** The Geolocation API's code for a refused permission. */
const PERMISSION_DENIED = 1

/** Where the two choices are kept on the device. */
export const SHARING_KEY = 'jitpack_location_sharing'
export const SHOW_OTHERS_KEY = 'jitpack_location_show_others'

export interface LiveLocationDeps {
  host: LiveLocationHost
  /** Null where the device has none — or the page is not served over HTTPS. */
  geo: GeoSource | null
  storage: Pick<Storage, 'getItem' | 'setItem'>
  now: () => number
}

export function createLiveLocation(deps: LiveLocationDeps) {
  const { host, geo, storage, now } = deps

  const me = ref<Fix | null>(null)
  const state = ref<LocateState>(geo ? 'off' : 'unavailable')
  const sharing = ref<Set<string>>(new Set(readSharing()))
  const showOthers = ref(storage.getItem(SHOW_OTHERS_KEY) !== 'false')

  /** The last position sent per trip, which `shouldShare` weighs the next against. */
  const lastSent = new Map<string, Fix>()
  /** Maps open that want the position; the watch ends when none is and nothing is shared. */
  let holders = 0
  let watchId: number | null = null

  function readSharing(): string[] {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(SHARING_KEY) ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }

  function writeSharing() {
    storage.setItem(SHARING_KEY, JSON.stringify([...sharing.value]))
  }

  function frameOf(fix: Fix): LocationFrame {
    return { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM }
  }

  function onPosition(position: {
    coords: { latitude: number; longitude: number; accuracy: number }
  }) {
    const fix: Fix = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracyM: position.coords.accuracy,
      at: now(),
    }
    me.value = fix
    state.value = 'on'
    for (const tripId of sharing.value) send(tripId, fix)
  }

  function send(tripId: string, fix: Fix) {
    if (!shouldShare(lastSent.get(tripId) ?? null, fix)) return
    lastSent.set(tripId, fix)
    host.shareLocation(tripId, frameOf(fix))
  }

  function startWatch() {
    if (!geo || watchId !== null) return
    if (state.value !== 'on') state.value = 'asking'
    watchId = geo.watchPosition(
      onPosition,
      (error) => {
        state.value = error.code === PERMISSION_DENIED ? 'denied' : 'unavailable'
        stopWatch()
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
  }

  function stopWatch() {
    if (watchId !== null) geo?.clearWatch(watchId)
    watchId = null
  }

  function settle() {
    if (holders === 0 && sharing.value.size === 0) {
      stopWatch()
      if (state.value === 'on' || state.value === 'asking') state.value = 'off'
    }
  }

  /** A map opened: it is told the position once it is asked for. */
  function hold() {
    holders += 1
  }

  /** A map closed. */
  function release() {
    holders = Math.max(0, holders - 1)
    settle()
  }

  /** The 📍: asks the device where it is, and keeps asking while held. */
  function locate() {
    if (state.value === 'denied' || state.value === 'unavailable') return
    startWatch()
  }

  /** Shares this device's position on a trip, or stops. */
  function setSharing(tripId: string, on: boolean) {
    const next = new Set(sharing.value)
    if (on) next.add(tripId)
    else next.delete(tripId)
    sharing.value = next
    writeSharing()
    if (on) {
      startWatch()
      if (me.value) send(tripId, me.value)
    } else {
      lastSent.delete(tripId)
      host.shareLocation(tripId, null)
      settle()
    }
  }

  function setShowOthers(on: boolean) {
    showOthers.value = on
    storage.setItem(SHOW_OTHERS_KEY, String(on))
  }

  /** On start: a trip shared when the app was last open is shared again. */
  function resume() {
    if (sharing.value.size > 0) startWatch()
  }

  return {
    me: me as Readonly<Ref<Fix | null>>,
    state: state as Readonly<Ref<LocateState>>,
    showOthers: showOthers as Readonly<Ref<boolean>>,
    /** Whether this device shares its position on the trip — reactive where it is read. */
    isSharing: (tripId: string) => sharing.value.has(tripId),
    others: (tripId: string) => host.getLiveLocations(tripId),
    hold,
    release,
    locate,
    setSharing,
    setShowOthers,
    resume,
  }
}

export type LiveLocationService = ReturnType<typeof createLiveLocation>

/** The injection key the maps read the device's live location from. */
export const LIVE_LOCATION = Symbol('liveLocation') as InjectionKey<LiveLocationService>

/** The browser's geolocation, where the page may have it. */
export function browserGeo(): GeoSource | null {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext
    ? navigator.geolocation
    : null
}
