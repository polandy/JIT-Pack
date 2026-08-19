/**
 * G-9's left slot, and what happens when a screen has no title to put in it.
 *
 * M4 gave its app-bar title up (UI-Spec M4, 2026-08-19): beside six icons at
 * 390 px the trip name rendered as "S…", so the name moved down to the
 * screen's own header line. What is pinned here is that "no title" means *no
 * title element* rather than an empty one — an empty `ion-title` still claims
 * the slot and pushes the icon cluster around, which is a bar that lost its
 * label rather than a bar that never had one.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import AppHeader from '../AppHeader.vue'
import { setTitleFor, clearTitleFor } from '@/composables/useHeaderTitle'

const M4_PATH = '/trips/trip-1'
const M6_PATH = '/trips/trip-1/shopping'

const route = {
  path: M4_PATH,
  meta: { parent: '/tabs/trips' } as Record<string, unknown>,
  params: { tripId: 'trip-1' } as Record<string, string>,
}

vi.mock('vue-router', () => ({ useRoute: () => route }))

vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ionic/vue')
  return { ...actual, useIonRouter: () => ({ navigate: vi.fn() }) }
})

function mountHeader() {
  return mount(AppHeader, {
    props: { syncState: 'synced' as const, syncPendingCount: 0, syncLabel: 'Synced' },
  })
}

beforeEach(() => {
  route.path = M4_PATH
  route.meta = { parent: '/tabs/trips' }
  clearTitleFor(M4_PATH)
  clearTitleFor(M6_PATH)
})

describe('AppHeader — the left slot (G-9)', () => {
  it('renders no title element on a screen that registers none (M4)', () => {
    const wrapper = mountHeader()

    // The positive half: the bar did render its left slot, so an absent
    // title is a decision rather than a header that failed to mount.
    expect(wrapper.find('[data-testid="header-back"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="header-title"]').exists()).toBe(false)
  })

  it('renders the registered title on a screen that has one (M6)', () => {
    route.path = M6_PATH
    setTitleFor(M6_PATH, 'Shopping · Samedan 2026')

    const wrapper = mountHeader()

    expect(wrapper.get('[data-testid="header-title"]').text()).toBe('Shopping · Samedan 2026')
  })

  it('falls back to the route table title', () => {
    route.meta = { parent: '/tabs/trips', title: 'Luggage' }

    expect(mountHeader().get('[data-testid="header-title"]').text()).toBe('Luggage')
  })

  it('shows the logo instead of a title on a tab root', () => {
    route.path = '/tabs/trips'
    route.meta = {}

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="header-logo"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="header-back"]').exists()).toBe(false)
  })
})
