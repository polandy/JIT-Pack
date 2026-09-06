// @vitest-environment jsdom
/**
 * G-9's left slot, and the budget its right-hand cluster is held to.
 *
 * The bar no longer names the page at all (ADR-050): M4 had given its title
 * up in 2026-08 because beside six icons at 390 px the trip name rendered as
 * "S…", and the answer for every other screen is the same one M4 got — the
 * name belongs in the page, at a size a bar cannot give it. What is left
 * here is the left slot's *other* job, the way back, and the cap that keeps
 * the cluster from growing back to what made the title unreadable.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import AppHeader from '../AppHeader.vue'
import { setActionsFor, clearActionsFor } from '@/composables/useHeaderActions'

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
})

describe('AppHeader — the left slot (G-9)', () => {
  it('names no page: the way back is the whole left slot on a drill-down', () => {
    route.path = M6_PATH

    const wrapper = mountHeader()

    // The positive half: the bar did render its left slot, so the absent
    // title is a decision rather than a header that failed to mount.
    expect(wrapper.find('[data-testid="header-back"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="header-title"]').exists()).toBe(false)
  })

  it('shows the logo instead on a tab root', () => {
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

  /**
   * ADR-050's budget. M4 stood at seven glyphs, each of which had arrived
   * one at a time because nothing said what full looked like. The fourth
   * glyph is not dropped — it becomes a word in the menu, which is the one
   * outcome a page cannot get wrong by forgetting.
   */
  it('gives the fourth glyph to the ⋮ rather than to the bar', () => {
    setActionsFor(M4_PATH, [
      action('m4-search'),
      action('m4-filter'),
      action('m4-fold-all'),
      action('m4-nav-shopping'),
    ])

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="m4-fold-all"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="m4-nav-shopping"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="header-overflow"]').exists()).toBe(true)
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
