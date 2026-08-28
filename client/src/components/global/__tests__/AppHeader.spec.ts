// @vitest-environment jsdom
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
import { setActionsFor, clearActionsFor } from '@/composables/useHeaderActions'
import { setTitleFor, clearTitleFor } from '@/composables/useHeaderTitle'
import { setLocale } from '@/i18n'

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

function mountHeader(extra: { syncUpdateReady?: boolean } = {}) {
  return mount(AppHeader, {
    props: { syncState: 'synced' as const, syncPendingCount: 0, syncLabel: 'Synced', ...extra },
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
    route.meta = { parent: '/tabs/trips', titleKey: 'container.title' }

    expect(mountHeader().get('[data-testid="header-title"]').text()).toBe('Luggage')
  })

  /**
   * NFR-4.12: the route table stores a catalogue key, so the one bar every
   * screen shares speaks the chosen language. It used to store the English
   * text, which no language switch could reach.
   */
  it('renders the route table title in the active locale', () => {
    route.meta = { parent: '/tabs/trips', titleKey: 'container.title' }
    setLocale('de')
    try {
      expect(mountHeader().get('[data-testid="header-title"]').text()).toBe('Gepäck')
    } finally {
      setLocale('en')
    }
  })

  it('shows the logo instead of a title on a tab root', () => {
    route.path = '/tabs/trips'
    route.meta = {}

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="header-logo"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="header-back"]').exists()).toBe(false)
  })
})

/**
 * G-12's overflow (UX-13, 2026-08-27): the bar had grown to six glyphs plus
 * the gear on M4, so a page can now mark an action as belonging behind the
 * ⋮ rather than beside the others. What is pinned here is that the bar
 * decides *nothing* on its own — an unmarked action is always a glyph, and
 * the ⋮ exists only when something asked for it.
 */
describe('AppHeader — the G-12 overflow', () => {
  const action = (id: string, overflow?: boolean) => ({
    id,
    icon: 'x',
    label: id,
    onClick: vi.fn(),
    ...(overflow ? { overflow: true } : {}),
  })

  beforeEach(() => clearActionsFor(M4_PATH))

  it('renders a marked action behind one ⋮ instead of beside the others', () => {
    setActionsFor(M4_PATH, [action('m4-search'), action('m4-edit', true), action('m4-start', true)])

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="m4-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="m4-edit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m4-start"]').exists()).toBe(false)
    // One ⋮ for the two of them, not one each.
    expect(wrapper.findAll('[data-testid="header-overflow"]')).toHaveLength(1)
  })

  it('offers no ⋮ when no action asked for one', () => {
    setActionsFor(M4_PATH, [action('m4-search'), action('m4-filter')])

    const wrapper = mountHeader()

    // The positive half: the bar did render its cluster.
    expect(wrapper.find('[data-testid="m4-filter"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="header-overflow"]').exists()).toBe(false)
  })
})

describe('AppHeader — the G-2 waiting-update dot (NFR-4.13)', () => {
  it('marks the sync glyph while a new version waits', () => {
    const wrapper = mountHeader({ syncUpdateReady: true })

    expect(wrapper.find('[data-testid="sync-indicator-update"]').exists()).toBe(true)
  })

  it('shows no mark while nothing waits — the glyph itself is the positive signal', () => {
    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="sync-indicator"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sync-indicator-update"]').exists()).toBe(false)
  })
})
