/**
 * FR-29.19 on the device: the position is asked for only on a tap, shared on
 * the trips switched on — no more often than the rule allows — and the watch
 * ends once no map holds it and nothing is shared. Both choices survive a
 * restart.
 */
import { describe, expect, it, vi } from 'vitest'

import { SHARE_AT_MOST_MS, SHARE_EVERY_MS } from '@/lib/liveLocation'
import {
  SHARING_KEY,
  SHOW_OTHERS_KEY,
  createLiveLocation,
  type GeoSource,
} from '../useLiveLocation'

type Position = Parameters<Parameters<GeoSource['watchPosition']>[0]>[0]

function fakeGeo() {
  let onPosition: ((p: Position) => void) | null = null
  let onError: ((e: { code: number }) => void) | null = null
  const geo = {
    watchPosition: vi.fn((ok: (p: Position) => void, fail: (e: { code: number }) => void) => {
      onPosition = ok
      onError = fail
      return 7
    }),
    clearWatch: vi.fn(),
  }
  return {
    geo,
    at: (latitude: number, longitude = 9.8, accuracy = 10) =>
      onPosition!({ coords: { latitude, longitude, accuracy } }),
    fail: (code: number) => onError!({ code }),
  }
}

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  }
}

function setup(seed: Record<string, string> = {}) {
  const device = fakeGeo()
  const host = { shareLocation: vi.fn(), getLiveLocations: vi.fn(() => new Map()) }
  const storage = memoryStorage(seed)
  let clock = 0
  const live = createLiveLocation({ host, geo: device.geo, storage, now: () => clock })
  return { live, host, device, storage, tick: (ms: number) => (clock += ms) }
}

describe('createLiveLocation (FR-29.19)', () => {
  it('asks the device nothing until the 📍 is tapped', () => {
    const { live, device } = setup()
    live.hold()
    expect(device.geo.watchPosition).not.toHaveBeenCalled()

    live.locate()
    expect(live.state.value).toBe('asking')
    device.at(46.5)
    expect(live.state.value).toBe('on')
    expect(live.me.value).toMatchObject({ lat: 46.5, accuracyM: 10 })
  })

  it('shares nothing for being located — only a trip switched on is told', () => {
    const { live, host, device } = setup()
    live.locate()
    device.at(46.5)
    expect(host.shareLocation).not.toHaveBeenCalled()
  })

  it('shares on a trip switched on — at once, then by the rule — and stops it', () => {
    const { live, host, device, tick } = setup()
    live.setSharing('t1', true)
    expect(device.geo.watchPosition).toHaveBeenCalledTimes(1)
    device.at(46.5)
    expect(host.shareLocation).toHaveBeenLastCalledWith('t1', {
      lat: 46.5,
      lon: 9.8,
      accuracyM: 10,
    })

    tick(SHARE_AT_MOST_MS - 1)
    device.at(46.6)
    expect(host.shareLocation).toHaveBeenCalledTimes(1)
    tick(SHARE_EVERY_MS)
    device.at(46.6)
    expect(host.shareLocation).toHaveBeenCalledTimes(2)

    live.setSharing('t1', false)
    expect(host.shareLocation).toHaveBeenLastCalledWith('t1', null)
    expect(device.geo.clearWatch).toHaveBeenCalledWith(7)
    expect(live.state.value).toBe('off')
  })

  it('keeps watching while a map holds it, and ends with the last map', () => {
    const { live, device } = setup()
    live.hold()
    live.locate()
    device.at(46.5)
    live.hold()
    live.release()
    expect(device.geo.clearWatch).not.toHaveBeenCalled()
    live.release()
    expect(device.geo.clearWatch).toHaveBeenCalledWith(7)
  })

  it('says a refused permission, and asks no more', () => {
    const { live, device } = setup()
    live.locate()
    device.fail(1)
    expect(live.state.value).toBe('denied')
    live.locate()
    expect(device.geo.watchPosition).toHaveBeenCalledTimes(1)
  })

  it('is unavailable without a device position — or off HTTPS', () => {
    const live = createLiveLocation({
      host: { shareLocation: vi.fn(), getLiveLocations: () => new Map() },
      geo: null,
      storage: memoryStorage(),
      now: () => 0,
    })
    expect(live.state.value).toBe('unavailable')
  })

  it('remembers both choices across a restart and shares again on resume', () => {
    const first = setup()
    first.live.setSharing('t1', true)
    first.live.setShowOthers(false)

    const second = setup(Object.fromEntries(first.storage.map))
    expect(second.live.isSharing('t1')).toBe(true)
    expect(second.live.showOthers.value).toBe(false)
    second.live.resume()
    expect(second.device.geo.watchPosition).toHaveBeenCalledTimes(1)
    expect(Object.keys(Object.fromEntries(first.storage.map)).sort()).toEqual(
      [SHARING_KEY, SHOW_OTHERS_KEY].sort(),
    )
  })
})
