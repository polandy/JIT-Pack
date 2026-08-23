// @vitest-environment jsdom
/**
 * FR-27.15: a dismissed fold suggestion stays dismissed on this device — and
 * comes back once the group it was about has changed.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { foldDismissals, itemSetSignature } from '../useFoldDismissals'

describe('foldDismissals (FR-27.15)', () => {
  const store = foldDismissals()

  beforeEach(() => {
    localStorage.clear()
    store.reset()
  })

  it('offers a pair nobody dismissed', () => {
    expect(store.isDismissed('tpl', 'g-a', ['i-1', 'i-2'])).toBe(false)
  })

  it('stops offering a dismissed pair', () => {
    store.dismiss('tpl', 'g-a', ['i-1', 'i-2'])
    expect(store.isDismissed('tpl', 'g-a', ['i-1', 'i-2'])).toBe(true)
  })

  it('dismisses one pair, not the group everywhere', () => {
    store.dismiss('tpl', 'g-a', ['i-1', 'i-2'])
    expect(store.isDismissed('other', 'g-a', ['i-1', 'i-2'])).toBe(false)
  })

  it('offers again once the group’s item set changed — a new question', () => {
    store.dismiss('tpl', 'g-a', ['i-1', 'i-2'])
    expect(store.isDismissed('tpl', 'g-a', ['i-1', 'i-2', 'i-3'])).toBe(false)
  })

  it('ignores the order the item ids arrive in', () => {
    store.dismiss('tpl', 'g-a', ['i-2', 'i-1'])
    expect(store.isDismissed('tpl', 'g-a', ['i-1', 'i-2'])).toBe(true)
    expect(itemSetSignature(['b', 'a'])).toBe(itemSetSignature(['a', 'b']))
  })

  it('survives a reload — the dismissal is what storage holds', () => {
    store.dismiss('tpl', 'g-a', ['i-1', 'i-2'])
    store.reload()
    expect(store.isDismissed('tpl', 'g-a', ['i-1', 'i-2'])).toBe(true)
  })

  it('drops a malformed entry rather than carrying it forward', () => {
    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify({ 'tpl:g-a': 42, 'tpl:g-b': itemSetSignature(['i-9']) }),
    )
    store.reload()
    store.dismiss('tpl', 'g-c', ['i-1'])
    // The positive signal: what got written back keeps the readable entries
    // and no longer carries the one nothing can match.
    expect(JSON.parse(localStorage.getItem(STORAGE_TEST_KEY)!)).toEqual({
      'tpl:g-b': itemSetSignature(['i-9']),
      'tpl:g-c': itemSetSignature(['i-1']),
    })
  })

  it('an unparseable store offers everything rather than nothing', () => {
    localStorage.setItem(STORAGE_TEST_KEY, 'not json')
    store.reload()
    expect(store.isDismissed('tpl', 'g-a', ['i-1', 'i-2'])).toBe(false)
  })
})

/** The key the composable owns; named here so a rename fails the test. */
const STORAGE_TEST_KEY = 'jitpack_fold_dismissals'
