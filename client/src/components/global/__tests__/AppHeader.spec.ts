// @vitest-environment jsdom
/**
 * G-9's left slot, and the budget its right-hand cluster is held to.
 *
 * The bar does not name the page at all (ADR-050): beside six icons at
 * 390 px a trip name renders as "S…", so the name belongs in the page, at a
 * size a bar cannot give it. What is left here is the left slot's *other*
 * job, the way back, and the cap that keeps the cluster from growing to
 * what makes a title unreadable.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import AppHeader from '../AppHeader.vue'
import { setActionsFor, clearActionsFor } from '@/composables/useHeaderActions'
import { setSelectionFor } from '@/composables/useHeaderSelection'
import { enteredFrom } from '@/router/backTarget'
import { PATH } from '@/router/paths'

const M4_PATH = '/trips/trip-1'
const M6_PATH = '/trips/trip-1/shopping'

const route = {
  path: M4_PATH,
  fullPath: M4_PATH,
  meta: { parent: '/tabs/trips' } as Record<string, unknown>,
  params: { tripId: 'trip-1' } as Record<string, string>,
  matched: [{}] as unknown[],
}

/**
 * The gear resolves its own target, so the fake records what it was asked
 * for. Serializing the query is vue-router's job and is not restated here;
 * what this bar owes is *asking* with the origin in hand.
 */
const resolved: { path?: string; query?: Record<string, string> }[] = []
const resolve = (to: { path: string; query: Record<string, string> }) => {
  resolved.push(to)
  return { fullPath: `${to.path}?from=${to.query.from}` }
}

const pushed: string[] = []

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ resolve, push: (path: string) => pushed.push(path) }),
}))

/**
 * What the ⋮ was asked to render, and a seam to close it with. The sheet
 * itself is an Ionic overlay and jsdom is not where its DOM is worth
 * asserting; what the bar owes is the *list* — which entries, in which order,
 * under which ids — and that a chosen entry runs only once the sheet is gone.
 * `dismiss` is that moment, in the test's hand rather than on a clock.
 */
interface SheetButton {
  text: string
  htmlAttributes?: Record<string, string>
  role?: string
  handler?: () => void
}

const { sheets } = vi.hoisted(() => ({
  sheets: [] as { buttons: { text: string; handler?: () => void }[]; dismiss: () => void }[],
}))

vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ionic/vue')
  return {
    ...actual,
    useIonRouter: () => ({ navigate: vi.fn() }),
    actionSheetController: {
      create: async (opts: { buttons: { text: string; handler?: () => void }[] }) => {
        let dismiss = () => {}
        const gone = new Promise<void>((resolve) => (dismiss = resolve))
        sheets.push({ buttons: opts.buttons, dismiss })
        return { present: async () => {}, onDidDismiss: () => gone }
      },
    },
  }
})

function mountHeader(extra: { syncUpdateReady?: boolean } = {}) {
  return mount(AppHeader, {
    props: { syncState: 'synced' as const, syncPendingCount: 0, syncLabel: 'Synced', ...extra },
  })
}

beforeEach(() => {
  route.path = M4_PATH
  route.fullPath = M4_PATH
  route.meta = { parent: '/tabs/trips' }
  route.params = { tripId: 'trip-1' }
  route.matched = [{}]
  resolved.length = 0
  sheets.length = 0
  pushed.length = 0
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

  it('names the running build beside the wordmark, from the vite define', () => {
    route.path = '/tabs/trips'
    route.meta = {}

    const wrapper = mountHeader()

    // __APP_VERSION__ is vite.config.ts's `define`; vitest.config.ts merges
    // the same config, so this is the value a real build would carry too —
    // and it is rendered **verbatim**. Restating the component's own
    // `v${…}` template would pass against any prefix at all and let
    // `vv0.10.0-1-g500b5e54` through: both
    // sources of the string already carry the tag's own `v`, `git describe`
    // and the release workflow's `APP_VERSION=${{ github.ref_name }}` alike.
    expect(wrapper.find('[data-testid="header-app-version"]').text()).toBe(__APP_VERSION__)
  })
})

/**
 * G-12's overflow (UX-13): six glyphs plus the gear on M4 are more than the
 * bar holds, so a page can mark an action as belonging behind the
 * ⋮ rather than beside the others. What is pinned here is that the bar
 * decides *nothing* on its own — an unmarked action is always a glyph, and
 * the ⋮ exists only when something asked for it.
 */
describe('AppHeader — the gear (G-1, ADR-012)', () => {
  /*
   * The gear carries the origin itself so the router's stamping guard finds
   * nothing to rewrite. A guard that redirects aborts the navigation Ionic's
   * `router-link` has already staged as a forward push and issues a second
   * one; Ionic keeps the staged params, and from two pages deep the outlet
   * then hides the wrong page — M17 over a still-live packing list.
   */
  it('points at settings with the screen it was pressed on already recorded', () => {
    route.fullPath = `${M4_PATH}?item=item-1`

    const wrapper = mountHeader()

    expect(resolved).toContainEqual({
      path: PATH.settings,
      query: enteredFrom(`${M4_PATH}?item=item-1`),
    })
    expect(wrapper.find('[data-testid="header-settings"]').html()).toContain('from=')
  })

  /*
   * The guard's own rule: a path that matched no route is not an origin,
   * because `‹` would carry the user to a URL that renders nothing.
   */
  it('records no origin when the current path matched no route', () => {
    route.path = '/typo'
    route.fullPath = '/typo'
    route.matched = []

    const wrapper = mountHeader()

    expect(resolved).toEqual([])
    expect(wrapper.find('[data-testid="header-settings"]').html()).not.toContain('from=')
  })

  it('offers no gear on settings itself, so nothing resolves a self-link', () => {
    route.path = PATH.settings
    route.fullPath = PATH.settings

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="header-settings"]').exists()).toBe(false)
  })
})

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

/**
 * ADR-051 amendment 1: the switcher under the page's name keeps the two
 * views a trip is worked in, and the bar's ⋮ carries the rest — on every one
 * of the trip's four screens, filled by the frame from the route table.
 *
 * The half no screen test can see is that this happens **without the screen
 * asking**: a page that registers nothing still offers the views, which is
 * the property that makes forgetting impossible (ADR-051 driver 3).
 */
describe('AppHeader — the trip views the switcher does not show', () => {
  const action = (id: string, overflow?: boolean) => ({
    id,
    icon: 'x',
    label: id,
    onClick: vi.fn(),
    ...(overflow ? { overflow: true } : {}),
  })

  /** Open the ⋮ and return what it was asked to render, plus its dismissal. */
  async function openMenu(
    wrapper: ReturnType<typeof mountHeader>,
  ): Promise<{ buttons: SheetButton[]; dismiss: () => void }> {
    await wrapper.get('[data-testid="header-overflow"]').trigger('click')
    await flushPromises()
    const [sheet] = sheets
    // Thrown rather than asserted: everything below reads the list, and an
    // empty one would fail as "expected [] to equal […]", which says nothing.
    if (!sheet) throw new Error('the ⋮ opened no action sheet')
    return { buttons: sheet.buttons as SheetButton[], dismiss: sheet.dismiss }
  }

  beforeEach(() => clearActionsFor(M4_PATH))

  it('offers them although the screen registered no action at all', async () => {
    route.meta = { parent: '/tabs/trips', tripView: 'packing' }

    const { buttons } = await openMenu(mountHeader())

    expect(buttons.map((b) => b.text)).toEqual(['Luggage', 'Analytics', 'Cancel'])
  })

  /*
   * Where you can go, then what you can do: the two destinations head the
   * sheet and the page's own once-per-trip actions follow. Read against the
   * screen, "Finish trip" between the luggage and the analytics would be a
   * lifecycle step offered inside a list of places.
   */
  it('puts the destinations ahead of what the page does to the trip', async () => {
    route.meta = { parent: '/tabs/trips', tripView: 'packing' }
    setActionsFor(M4_PATH, [action('m4-search'), action('m4-close-packing', true)])

    const { buttons } = await openMenu(mountHeader())

    expect(buttons.map((b) => b.htmlAttributes?.['data-testid'])).toEqual([
      'trip-view-luggage',
      'trip-view-analytics',
      'm4-close-packing',
      undefined, // Cancel, which carries no id
    ])
  })

  /*
   * The complement of the switcher, not a fixed pair: on the luggage the row
   * shows *Gepäck* as the current pill, so offering it here too would be the
   * same destination twice — once marked "you are here".
   */
  it('leaves out the view being looked at, which the row is already showing', async () => {
    route.path = '/trips/trip-1/containers'
    route.meta = { parent: M4_PATH, tripView: 'luggage' }

    const { buttons } = await openMenu(mountHeader())

    expect(buttons.map((b) => b.text)).toEqual(['Analytics', 'Cancel'])
  })

  it('goes there when the entry is chosen, once the sheet is gone', async () => {
    route.meta = { parent: '/tabs/trips', tripView: 'packing' }

    const { buttons, dismiss } = await openMenu(mountHeader())
    buttons.find((b) => b.htmlAttributes?.['data-testid'] === 'trip-view-luggage')?.handler?.()

    // The entry's handler only records the choice: while an overlay is up
    // Ionic marks the outlet `aria-hidden` and clears it on dismissal, so a
    // navigation made from inside the handler leaves that flag behind. The
    // absence before the dismissal is the half that says so.
    await flushPromises()
    expect(pushed).toEqual([])

    dismiss()
    await flushPromises()
    expect(pushed).toEqual(['/trips/trip-1/containers'])
  })

  // A ⋮ acts on its own context: the luggage and the
  // analytics are the packing list's, and the pill row reaches packing.
  it('offers none of packing’s views on the shopping list or the tasks', () => {
    for (const [path, tripView] of [
      [M6_PATH, 'shopping'],
      ['/trips/trip-1/tasks', 'tasks'],
    ]) {
      route.path = path!
      route.meta = { parent: M4_PATH, tripView }

      const wrapper = mountHeader()

      expect(wrapper.find('[data-testid="header-back"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="header-overflow"]').exists()).toBe(false)
    }
  })

  it('offers none of this outside a trip, where there is no view to leave', () => {
    route.path = PATH.items
    route.meta = {}
    route.params = {}

    const wrapper = mountHeader()

    // The positive half: the bar rendered, it simply has no ⋮ to show.
    expect(wrapper.find('[data-testid="header-settings"]').exists()).toBe(true)
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

describe('AppHeader — a selection wears the bar (G-20)', () => {
  const onExit = vi.fn()
  const onAll = vi.fn()

  beforeEach(() => {
    route.path = M6_PATH
    route.meta = { parent: M4_PATH, tripView: 'shopping' }
    onExit.mockReset()
    onAll.mockReset()
    setActionsFor(M6_PATH, [{ id: 'm6-select', icon: 'x', label: 'Select', onClick: vi.fn() }])
  })

  it('is the ordinary bar while the page is not selecting', () => {
    setSelectionFor(M6_PATH, null)

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="header-back"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="m6-selbar"]').exists()).toBe(false)
  })

  it('says how many, offers „Alle N" and the way out — and nothing of the page’s', async () => {
    setSelectionFor(M6_PATH, { count: 2, total: 5, testid: 'm6', onExit, onAll })

    const wrapper = mountHeader()

    expect(wrapper.get('[data-testid="m6-select-count"]').text()).toBe('2 selected')
    expect(wrapper.get('[data-testid="m6-select-all"]').text()).toBe('All 5')
    // Every control that would leave or change the screen under a half-made
    // batch gives way; the sync glyph is G-2's and stays.
    for (const gone of ['header-back', 'm6-select', 'header-overflow', 'header-settings']) {
      expect(wrapper.find(`[data-testid="${gone}"]`).exists()).toBe(false)
    }
    expect(wrapper.findComponent({ name: 'SyncIndicator' }).exists()).toBe(true)

    await wrapper.get('[data-testid="m6-select-all"]').trigger('click')
    await wrapper.get('[data-testid="m6-select-exit"]').trigger('click')
    expect(onAll).toHaveBeenCalledOnce()
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('says nothing is chosen, rather than „0 selected"', () => {
    setSelectionFor(M6_PATH, { count: 0, total: 5, testid: 'm6', onExit, onAll })

    expect(mountHeader().get('[data-testid="m6-select-count"]').text()).toBe('Nothing selected')
  })

  it('belongs to the page that registered it: another screen keeps its own bar', () => {
    setSelectionFor(M6_PATH, { count: 1, total: 5, testid: 'm6', onExit, onAll })
    route.path = M4_PATH
    route.meta = { parent: '/tabs/trips', tripView: 'packing' }

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="m6-selbar"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="header-back"]').exists()).toBe(true)
  })
})
