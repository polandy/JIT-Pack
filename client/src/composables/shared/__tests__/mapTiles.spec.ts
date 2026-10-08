// @vitest-environment jsdom
/**
 * FR-29.17 — whether a map draws its tiles: the instance's switch, kept
 * for an offline start, and the device's connection as it comes and goes.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { MAP_TILES_STORAGE_KEY, initMapTiles, setMapTiles, useTileState } from '../mapTiles'

function goOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

describe('the map tiles (FR-29.17)', () => {
  beforeEach(() => {
    localStorage.clear()
    initMapTiles()
    setMapTiles(true)
    goOnline(true)
  })

  it('draws tiles until the instance says otherwise', () => {
    expect(useTileState().value).toBe('on')
    setMapTiles(false)
    expect(useTileState().value).toBe('off')
  })

  it('keeps the instance’s „off" for the next start, and forgets it once on again', () => {
    setMapTiles(false)
    expect(localStorage.getItem(MAP_TILES_STORAGE_KEY)).toBe('off')
    setMapTiles(true)
    expect(localStorage.getItem(MAP_TILES_STORAGE_KEY)).toBeNull()

    localStorage.setItem(MAP_TILES_STORAGE_KEY, 'off')
    initMapTiles()
    expect(useTileState().value).toBe('off')
  })

  it('follows the connection: offline is the lines alone, back online the tiles again', () => {
    goOnline(false)
    expect(useTileState().value).toBe('offline')
    goOnline(true)
    expect(useTileState().value).toBe('on')
  })

  it('says off rather than offline where the instance draws no tiles anyway', () => {
    setMapTiles(false)
    goOnline(false)
    expect(useTileState().value).toBe('off')
  })
})
