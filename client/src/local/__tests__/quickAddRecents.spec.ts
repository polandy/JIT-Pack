import { describe, it, expect, beforeEach } from 'vitest'
import { recentItemIds, recordRecentItem, RECENTS_MAX, RECENTS_STORAGE_KEY } from '../quickAddRecents'

// FR-25.13c: the "Zuletzt verwendet" chip row is fed by a device-local
// trail — a convenience, not domain data, so localStorage is its home
// (the reviewDismissals stance).

beforeEach(() => {
  localStorage.removeItem(RECENTS_STORAGE_KEY)
})

describe('quickAddRecents', () => {
  it('starts empty and records newest first', () => {
    expect(recentItemIds()).toEqual([])
    recordRecentItem('a')
    recordRecentItem('b')
    expect(recentItemIds()).toEqual(['b', 'a'])
  })

  it('re-recording an id moves it to the front instead of duplicating it', () => {
    recordRecentItem('a')
    recordRecentItem('b')
    recordRecentItem('a')
    expect(recentItemIds()).toEqual(['a', 'b'])
  })

  it('caps the trail at RECENTS_MAX, dropping the oldest', () => {
    for (let n = 0; n < RECENTS_MAX + 2; n++) recordRecentItem(`id-${n}`)
    const ids = recentItemIds()
    expect(ids).toHaveLength(RECENTS_MAX)
    expect(ids[0]).toBe(`id-${RECENTS_MAX + 1}`)
    expect(ids).not.toContain('id-0')
    expect(ids).not.toContain('id-1')
  })

  it('treats unreadable storage as empty rather than failing', () => {
    localStorage.setItem(RECENTS_STORAGE_KEY, 'not json')
    expect(recentItemIds()).toEqual([])
    // …and a record afterwards repairs the trail.
    recordRecentItem('a')
    expect(recentItemIds()).toEqual(['a'])
  })

  it('ignores non-string entries smuggled into the stored array', () => {
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(['a', 7, null, 'b']))
    expect(recentItemIds()).toEqual(['a', 'b'])
  })
})
