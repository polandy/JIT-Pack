import { beforeEach, describe, expect, it } from 'vitest'
import { clearTitleFor, setTitleFor, titleFor } from '@/composables/useHeaderTitle'

/**
 * ADR-011. The ordering these tests pin down is not hypothetical: Ionic
 * keeps the outgoing page mounted through the route transition, so its
 * unmount hook runs *after* the incoming page has registered its title.
 * A single shared slot loses the new title to the page that just left —
 * which is exactly how M4 rendered with an empty header.
 */
describe('header titles are keyed by route path', () => {
  beforeEach(() => {
    clearTitleFor('/trips/t1')
    clearTitleFor('/trips/new')
  })

  it('returns null for a path nobody registered', () => {
    expect(titleFor('/trips/t1')).toBeNull()
  })

  it('keeps each path independent', () => {
    setTitleFor('/trips/new', 'New trip · step 1/4')
    setTitleFor('/trips/t1', 'Samedan 2026')

    expect(titleFor('/trips/new')).toBe('New trip · step 1/4')
    expect(titleFor('/trips/t1')).toBe('Samedan 2026')
  })

  it('a late unmount of the previous page does not wipe the current title', () => {
    setTitleFor('/trips/new', 'New trip · step 4/4')
    setTitleFor('/trips/t1', 'Samedan 2026') // the incoming page

    clearTitleFor('/trips/new') // the outgoing page unmounts, afterwards

    expect(titleFor('/trips/t1')).toBe('Samedan 2026')
  })

  it('clears its own path so a stale title cannot outlive its page', () => {
    setTitleFor('/trips/t1', 'Samedan 2026')

    clearTitleFor('/trips/t1')

    expect(titleFor('/trips/t1')).toBeNull()
  })

  it('treats an empty title as no title rather than storing a blank', () => {
    setTitleFor('/trips/t1', '')

    expect(titleFor('/trips/t1')).toBeNull()
  })
})
