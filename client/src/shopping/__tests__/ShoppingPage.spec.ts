// @vitest-environment jsdom
/**
 * M6 — the shopping list as its own module (FR-30, ADR-066).
 *
 * The screen renders lines and never learns whose they are: the list's own
 * entries, written through the module host, and whatever a provided source
 * contributes — here a fake, because what a *packing* line means is the
 * packing side's contract (`composables/__tests__/packingShoppingSource.spec.ts`,
 * `domain/__tests__/buyRows.spec.ts`). What this spec pins is the module's
 * half: entries are added, checked off, put back and removed as rows of their
 * own table; a source line's check-off goes to the source and nowhere else;
 * and the reveal, the counts and the ADR-033 guard read both alike.
 */
import ListRows from '@/components/global/ListRows.vue'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { IonButton, IonInput, IonSearchbar } from '@ionic/vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ListComposer from '@/components/global/ListComposer.vue'
import ShoppingPage from '../ShoppingPage.vue'
import { useShoppingStore } from '../store'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/api/tables'
import { t } from '@/i18n'
import type { Mutation } from '@/api/types'
import { SHOPPING_SOURCES, type ShoppingLine, type ShoppingSource } from '@/kernel/shoppingSources'
import { IDEA_LOOKUP } from '@/kernel/ideaBridge'
import { FROM_IDEA_QUERY_PARAM } from '@/router/paths'
import type { ModuleHost } from '@/sync/featureModule'
import { changesOf } from '@/sync/optimistic'
import { mutationOf, paintOf, type Write } from '@/sync/writeFunnel'
import type { ShoppingMode } from '@/types/domain'

import { identityStub } from '@/composables/shared/__tests__/identityStub'
import { STUB_TODAY, tripScreenStub } from '@/composables/shared/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/shared/useOrchestrator'
import { setHeaderActions, type HeaderAction } from '@/composables/shared/useHeaderActions'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { presentToast } from '@/composables/shared/toast'
import { pickAssignee } from '@/composables/shared/pickAssignee'
import { barAll, barCount, barExit, barSelection } from '@/__tests__/headerSelection'
import { currentRowIn } from '@/sync/sinks'

// FR-29.13: the route the screen reads `?fromIdea=` off, and what it replaces it with.
const nav = vi.hoisted(() => ({
  route: { path: '/trips/t1/shopping', query: {} as Record<string, string> },
  replaced: [] as unknown[],
}))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive(nav.route)
  nav.route = route
  return {
    useRoute: () => route,
    useRouter: () => ({
      replace: (to: unknown) => nav.replaced.push(to),
      push: vi.fn(),
    }),
  }
})
vi.mock('@/composables/shared/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
// A page left mounted by an earlier case would answer the route as well.
enableAutoUnmount(afterEach)
vi.mock('@/composables/shared/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('@/composables/shared/useHeaderSelection', async (actual) => ({
  ...(await actual<typeof import('@/composables/shared/useHeaderSelection')>()),
  setHeaderSelection: (await import('@/__tests__/headerSelection')).captureSelection,
}))
vi.mock('@/composables/shared/toast', () => ({
  presentToast: vi.fn().mockResolvedValue(undefined),
}))

/**
 * What the person picker answers (FR-30.12) — mocked, as on M25, because a
 * dismissed sheet (`undefined`) is a value under test and a real one would
 * assert Ionic.
 */
let picked: string | null | undefined
vi.mock('@/composables/shared/pickAssignee', () => ({ pickAssignee: vi.fn(async () => picked) }))

const tripScreen = tripScreenStub()

/** Every mutation the module queued, in order. */
let written: Mutation[] = []

/**
 * The host the orchestrator hands out, doing what the real one does to the
 * device: the optimistic rows reach the module's store before anything else.
 */
function fakeHost(): ModuleHost {
  let seq = 0
  return {
    mutation: (op, table, id, fields) => ({
      mutation_id: `m${++seq}`,
      op,
      table,
      id,
      fields,
      hlc: `hlc-${seq}`,
    }),
    nowIso: () => TAP,
    write: (...writes: Write[]) => {
      for (const w of writes) {
        const mutation = mutationOf(w)
        written.push(mutation)
        const optimistic =
          'mutation' in w
            ? w.optimistic
            : paintOf(mutation, currentRowIn(useShoppingStore().sinks, mutation.table, mutation.id))
        useShoppingStore().applyChanges(changesOf(optimistic))
      }
    },
    // The shopping list has no pictures; a call here is a bug in the test.
    pictures: {
      add: () => Promise.reject(new Error('no pictures here')),
      url: () => Promise.resolve(null),
      forget: () => Promise.resolve(),
    },
    // Nor tracks.
    tracks: {
      add: () => Promise.reject(new Error('no tracks here')),
      replace: () => Promise.reject(new Error('no tracks here')),
      file: () => Promise.resolve(null),
      forget: () => Promise.resolve(),
    },
    linkPreview: {
      offered: () => false,
      read: () => Promise.resolve(null),
      picture: () => Promise.resolve(null),
    },
  }
}

/** The clock the fake host reads, so a purchase's time is a known value. */
const TAP = '2026-09-19T14:32:00.000Z'

/** Who the instance knows: the viewer and a second account (FR-30.4). */
const people = [
  { user_id: 'u-andy', display_name: 'Andy' },
  { user_id: 'u-sia', display_name: 'Sia' },
]

/** A line as a source would hand it over, with its writes recorded. */
function line(over: Partial<ShoppingLine> = {}): ShoppingLine {
  return {
    key: `src:${over.name ?? 'x'}`,
    name: 'Sonnencreme',
    quantity: 1,
    recipients: [],
    buy: vi.fn(),
    unbuy: vi.fn(),
    place: vi.fn(),
    ...over,
  }
}

function source(
  open: Partial<Record<ShoppingMode, ShoppingLine[]>>,
  bought: Partial<Record<ShoppingMode, ShoppingLine[]>> = {},
): ShoppingSource {
  return {
    open: (_trip, list) => open[list] ?? [],
    bought: (_trip, list) => bought[list] ?? [],
  }
}

function mountPage(
  sources?: ShoppingSource[],
  orchestrator: { identity?: Record<string, unknown> } = {},
) {
  const provide: Record<symbol, unknown> = {
    [ORCHESTRATOR]: {
      identity: { ...identityStub(), fetchUsers: async () => people, ...orchestrator.identity },
      ...tripScreen,
      moduleHost: fakeHost(),
    },
  }
  if (sources) provide[SHOPPING_SOURCES] = sources
  provide[IDEA_LOOKUP] = {
    idea: (tripId: string, ideaId: string) =>
      tripId === 't1' && ideaId === 'idea-1'
        ? { id: 'idea-1', title: 'Gola Gorropu', plannedOn: '2026-10-10' }
        : undefined,
  }
  return mount(ShoppingPage, {
    props: { tripId: 't1' },
    // Ionic's modal presents on an animation nobody controls; the sheet's
    // content is what these cases operate (FR-30.9).
    global: {
      provide,
      stubs: { IonModal: { props: ['isOpen'], template: '<div><slot /></div>' } },
    },
  })
}

/** FR-21.24: the composer is behind the FAB on a list with something on it. */
async function openComposer(page: ReturnType<typeof mountPage>) {
  await page.findComponent(ListComposer).vm.open()
  await flushPromises()
}

function seedEntry(id: string, row: Record<string, unknown>) {
  useShoppingStore().applyChanges([
    {
      seq: 0,
      table: 'shopping_entries',
      id,
      deleted: false,
      row: { trip_id: 't1', list: 'buy_before', bought: 0, ...row },
    },
  ])
}

beforeEach(() => {
  // jsdom has no media queries; the leave animation reads `prefers-reduced-
  // motion` at setup (FR-25.11j), like M4's own stub for the same query.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia

  setActivePinia(createPinia())
  vi.clearAllMocks()
  written = []
  tripScreen.loadedTrips.clear()
  tripScreen.loadedTrips.add('t1')
})

describe('M6 — the list’s own entries (FR-30.1)', () => {
  it('adds what was typed to the list its chip names, as a shopping entry, and clears the field', async () => {
    const page = mountPage()
    await page.find('[data-testid="m6-list-local"]').trigger('click')

    const input = page.findComponent(IonInput)
    await input.setValue('  Milch  ')
    expect(input.props('modelValue')).toBe('  Milch  ')
    await page.find('[data-testid="m6-add"]').trigger('submit')

    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      op: 'insert',
      table: 'shopping_entries',
      fields: { trip_id: 't1', name: 'Milch', list: 'buy_local', bought: 0 },
    })
    const rows = page.findAll('[data-testid="m6-row"]')
    expect(rows.map((r) => r.find('h3').text())).toEqual(['Milch'])
    expect(page.find('[data-testid="m6-group-own"]').text()).toContain(t('shopping.ownEntries'))
    expect(input.props('modelValue')).toBe('')
  })

  it('entered from an idea, holds its title on Vor Ort and writes the entry naming it (FR-29.13)', async () => {
    nav.route.query = { [FROM_IDEA_QUERY_PARAM]: 'idea-1', from: '%2Ftrips%2Ft1%2Fideas' }
    nav.replaced.length = 0
    try {
      const page = mountPage()
      await flushPromises()

      const input = page.findComponent(IonInput)
      expect(input.props('modelValue')).toBe('Gola Gorropu')
      expect(page.find('[data-testid="m6-list-local"]').attributes('aria-pressed')).toBe('true')
      // The link is answered once: the parameter goes, the way back stays.
      expect(nav.replaced).toEqual([
        { path: '/trips/t1/shopping', query: { from: '%2Ftrips%2Ft1%2Fideas' } },
      ])

      await page.find('[data-testid="m6-add"]').trigger('submit')
      expect(written[0]).toMatchObject({
        op: 'insert',
        table: 'shopping_entries',
        fields: { name: 'Gola Gorropu', list: 'buy_local', idea_id: 'idea-1' },
      })
      expect(page.find('[data-testid="m6-row-idea-Gola Gorropu"]').text()).toBe('Gola Gorropu')

      // The next entry is the list's own again.
      await input.setValue('Brot')
      await page.find('[data-testid="m6-add"]').trigger('submit')
      expect(written[1]!.fields).not.toHaveProperty('idea_id')
    } finally {
      nav.route.query = {}
    }
  })

  it('adds nothing for a blank field', async () => {
    const page = mountPage()
    await page.findComponent(IonInput).setValue('   ')
    await page.find('[data-testid="m6-add"]').trigger('submit')

    expect(written).toEqual([])
    expect(page.find('[data-testid="m6-empty"]').exists()).toBe(true)
  })

  it('checking an entry off buys it and moves it under the reveal; unchecking puts it back', async () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()

    await page.find('[data-testid="m6-row"] ion-checkbox').trigger('ionChange')
    // FR-30.4: the tap's time travels with the purchase; who is the server's.
    expect(written.at(-1)).toMatchObject({
      op: 'upsert',
      id: 'e1',
      fields: { bought: 1, bought_at: TAP },
    })
    expect(page.findAll('[data-testid="m6-row"]')).toHaveLength(0)

    await page.find('[data-testid="m6-before-fold"]').trigger('click')
    const bought = page.findAll('[data-testid="m6-bought-row"]')
    expect(bought.map((r) => r.find('h3').text())).toEqual(['Brot'])
    // An entry was never anywhere but here, so there is nowhere to say it went.
    expect(page.find('[data-testid="m6-bought-note"]').exists()).toBe(false)

    await bought[0]!.find('ion-checkbox').trigger('ionChange')
    expect(written.at(-1)).toMatchObject({
      op: 'upsert',
      id: 'e1',
      fields: { bought: 0, bought_at: null, bought_by_user_id: null },
    })
    expect(page.findAll('[data-testid="m6-row"]').map((r) => r.find('h3').text())).toEqual(['Brot'])
  })

  /*
   * The row carries no ✕ (as M25's rows carry none): an
   * entry is removed from its sheet, as a task is from its own.
   */
  it('removes an entry from its sheet, as a delete of its own row', async () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()
    expect(page.find('[data-testid="m6-row"] ion-button').exists()).toBe(false)

    await page.find('[data-testid="m6-row-label"]').trigger('click')
    await page.find('[data-testid="m6-entry-remove"]').trigger('click')

    expect(written.at(-1)).toMatchObject({ op: 'delete', table: 'shopping_entries', id: 'e1' })
    expect(page.find('[data-testid="m6-row"]').exists()).toBe(false)
  })

  it('lists entries by name, so the order survives a reload', () => {
    seedEntry('e2', { name: 'Milch' })
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()
    expect(page.findAll('[data-testid="m6-row"]').map((r) => r.find('h3').text())).toEqual([
      'Brot',
      'Milch',
    ])
  })

  it('shows both lists one under the other, each entry under its own', () => {
    seedEntry('e1', { name: 'Brot', list: 'buy_local' })
    seedEntry('e2', { name: 'Milch' })
    const page = mountPage()
    const names = (testid: string) =>
      page
        .get(`[data-testid="${testid}"]`)
        .findAll('[data-testid="m6-row"] h3')
        .map((h) => h.text())
    expect(names('m6-before')).toEqual(['Milch'])
    expect(names('m6-local')).toEqual(['Brot'])
  })
})

/*
 * M25 alike: a list with nothing open is one line at the
 * end of the screen, a statement while nothing was bought, a fold once
 * something was — and stays in its place while its only open line stands in
 * the Fällig block.
 */
describe('M6 — a list with nothing open, folded to one line at the end', () => {
  it('moves the empty list below the one still worked, as plain text', () => {
    seedEntry('e1', { name: 'Brot', list: 'buy_local' })
    const page = mountPage()

    const sections = page
      .findAll('section[data-testid="m6-before"], section[data-testid="m6-local"]')
      .map((section) => section.attributes('data-testid'))
    expect(sections).toEqual(['m6-local', 'm6-before'])
    const line = page.get('[data-testid="m6-before-fold"]')
    expect(line.text()).toBe(t('shopping.listRest', { shelf: t('shopping.beforeDeparture') }))
    expect(line.element.tagName).toBe('P')
  })

  it('opens onto what was bought, with no second fold', async () => {
    seedEntry('e1', { name: 'Brot', list: 'buy_local' })
    seedEntry('e2', { name: 'Hut', bought: 1 })
    const page = mountPage()

    const line = page.get('[data-testid="m6-before-fold"]')
    expect(line.text()).toBe(
      t('shopping.listRestBought', { shelf: t('shopping.beforeDeparture'), n: 1 }),
    )
    await line.trigger('click')
    expect(page.find('[data-testid="m6-before"] [data-testid="m6-bought-bar"]').exists()).toBe(
      false,
    )
    expect(page.findAll('[data-testid="m6-bought-row"] h3').map((h) => h.text())).toEqual(['Hut'])
  })

  it('folds a list whose only open lines stand in the Fällig block, counting them', () => {
    seedEntry('e1', { name: 'Brot', due_date: '2026-07-08' })
    seedEntry('e2', { name: 'Milch', list: 'buy_local' })
    const page = mountPage()

    const sections = page
      .findAll('section[data-testid="m6-before"], section[data-testid="m6-local"]')
      .map((section) => section.attributes('data-testid'))
    expect(sections).toEqual(['m6-local', 'm6-before'])
    expect(page.get('[data-testid="m6-before-fold"]').text()).toBe(
      t('shopping.listRestDue', { shelf: t('shopping.beforeDeparture'), due: 1 }),
    )
    expect(page.get('[data-testid="m6-due"]').text()).toContain('Brot')
  })
})

describe('M6 — lines from a source (FR-30.2)', () => {
  it('files every source’s lines first, combined under one heading, then the own entries', () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage([
      source({
        buy_before: [line({ name: 'Sonnencreme' }), line({ name: 'Adapter' })],
      }),
    ])

    const groups = page.findAll('ion-item-group')
    expect(groups.map((g) => g.attributes('data-testid'))).toEqual([
      'm6-group-packing',
      'm6-group-own',
    ])
    expect(groups[0]?.text()).toContain(t('shopping.packingList'))
    expect(groups[0]?.findAll('h3').map((h) => h.text())).toEqual(['Sonnencreme', 'Adapter'])
  })

  it('checking a source line off calls its own write and writes no entry', async () => {
    const sunscreen = line({ name: 'Sonnencreme' })
    const page = mountPage([source({ buy_before: [sunscreen] })])

    await page.find('[data-testid="m6-row"] ion-checkbox').trigger('ionChange')

    expect(sunscreen.buy).toHaveBeenCalledTimes(1)
    expect(written).toEqual([])
  })

  it('offers no remove on a source line', () => {
    const page = mountPage([source({ buy_before: [line()] })])
    // The positive signal beside the absence: the row is there.
    expect(page.findAll('[data-testid="m6-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m6-row-remove"]').exists()).toBe(false)
  })

  it('renders the amount and the recipients a source aggregated (FR-25.6)', () => {
    const page = mountPage([
      source({
        buy_before: [
          line({
            name: 'Kurze Hosen',
            quantity: 6,
            recipients: [
              { id: 'tr1', name: 'Andy' },
              { id: 'tr2', name: 'Mia' },
            ],
          }),
        ],
      }),
    ])
    const row = page.find('[data-testid="m6-row"]')
    expect(row.text()).toContain('6×')
    expect(row.find('[data-testid="m6-row-for"]').text()).toContain(
      t('shopping.forWhom', { names: 'Andy, Mia' }),
    )
  })

  it('each list’s head counts own entries and source lines alike', () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage([source({ buy_before: [line()], buy_local: [line({ name: 'Wein' })] })])
    expect(page.get('[data-testid="m6-before"] .section-head').text()).toContain(
      t('shopping.openCount', { n: 2 }),
    )
    expect(page.get('[data-testid="m6-local"] .section-head').text()).toContain(
      t('shopping.openCount', { n: 1 }),
    )
  })
})

/*
 * FR-7.12: once the packing is finished, *before departure* is over. The list
 * is still there — the record of what was bought before the trip — folded at
 * the end of the screen as M25 folds its *before*; nothing new lands on it
 * and nothing bought is put back onto it.
 */
describe('M6 — before departure is closed once the packing is finished (FR-7.12)', () => {
  function seedTrip(row: Record<string, unknown>) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'active', ...row },
    })
  }

  it('folds the list away as a record: its lock said inside, no purchase put back', async () => {
    seedTrip({ packing_closed_at: '2026-07-08T06:00:00.000Z' })
    const bought = line({ name: 'Sonnenhut' })
    const page = mountPage([source({}, { buy_before: [bought] })])
    await flushPromises()

    const fold = page.get('[data-testid="m6-before-fold"]')
    expect(fold.text()).toBe(t('shopping.beforeHistory', { n: 1 }))
    expect(page.find('[data-testid="m6-before-locked"]').exists()).toBe(false)
    await fold.trigger('click')

    expect(page.find('[data-testid="m6-before-locked"]').exists()).toBe(true)
    const history = page.get('[data-testid="m6-before-history"]')
    // The line counts the purchases, so they stand open under it.
    expect(history.find('[data-testid="m6-bought-bar"]').exists()).toBe(false)
    const tick = history.get('[data-testid="m6-bought-row"] ion-checkbox')
    expect((tick.element as HTMLInputElement).disabled).toBe(true)
  })

  it('writes what is typed for the destination, and offers no list to choose', async () => {
    seedTrip({ packing_closed_at: '2026-07-08T06:00:00.000Z' })
    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m6-composer-list"]').exists()).toBe(false)
    await page.findComponent(IonInput).setValue('Brot')
    await page.find('[data-testid="m6-add"]').trigger('submit')
    expect(written.at(-1)).toMatchObject({ op: 'insert', fields: { list: 'buy_local' } })
  })

  it('is open while the packing is', async () => {
    seedTrip({ status: 'planning' })
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()
    await openComposer(page)

    expect(page.find('[data-testid="m6-before-fold"]').exists()).toBe(false)
    expect(page.find('[data-testid="m6-before"]').exists()).toBe(true)
    expect(page.find('[data-testid="m6-composer-list"]').exists()).toBe(true)
  })
})

describe('M6 — what was bought stays reversible (FR-25.11j)', () => {
  it('offers no reveal while nothing has been bought', () => {
    const page = mountPage([source({ buy_before: [line()] })])
    expect(page.findAll('[data-testid="m6-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m6-bought-bar"]').exists()).toBe(false)
  })

  it('reveals what was bought, counted in the bar, hidden until tapped, with the source’s note', async () => {
    const bought = line({ name: 'Sonnencreme', boughtNote: t('shopping.wentToPacking') })
    const page = mountPage([
      source({ buy_before: [line({ name: 'Kaffee' })] }, { buy_before: [bought] }),
    ])

    const bar = page.find('[data-testid="m6-bought-bar"]')
    expect(bar.text()).toBe(t('shopping.boughtFold', { n: 1 }))
    expect(bar.attributes('aria-expanded')).toBe('false')
    expect(page.find('[data-testid="m6-bought-list"]').exists()).toBe(false)

    await bar.trigger('click')

    const rows = page.findAll('[data-testid="m6-bought-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.find('[data-testid="m6-bought-note"]').text()).toBe(t('shopping.wentToPacking'))
    expect(page.find('[data-testid="m6-bought-bar"]').attributes('aria-expanded')).toBe('true')

    await rows[0]!.find('ion-checkbox').trigger('ionChange')
    expect(bought.unbuy).toHaveBeenCalledTimes(1)
  })
})

describe('M6 — the ＋ bottom right, the one door to the composer (FR-30.6, FR-21.24)', () => {
  it('keeps the composer closed on a list with something on it, the FAB naming what it opens', async () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m6-composer"]').exists()).toBe(false)
    const fab = page.findComponent('[data-testid="m6-fab"]')
    expect(fab.attributes('aria-label')).toBe(t('shopping.fab'))
  })

  it('opens the composer at the top of the list: scrolled first, then the field focused', async () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()
    await flushPromises()
    const content = page.find('ion-content').element as HTMLElement & { scrollToTop?: unknown }
    const calls: string[] = []
    content.scrollToTop = vi.fn(async () => void calls.push('scroll'))
    // The field exists only once the composer is open, so its focus is caught
    // on the element's class rather than on an instance.
    const field = customElements.get('ion-input')?.prototype ?? HTMLElement.prototype
    const original = Object.getOwnPropertyDescriptor(field, 'setFocus')
    Object.defineProperty(field, 'setFocus', {
      value: vi.fn(async () => void calls.push('focus')),
      configurable: true,
    })

    try {
      await page.find('[data-testid="m6-fab"]').trigger('click')
      await flushPromises()
    } finally {
      if (original) Object.defineProperty(field, 'setFocus', original)
      else delete (field as { setFocus?: unknown }).setFocus
    }

    // Scrolled first: a focus on a field still off-screen opens the keyboard
    // over the list instead of beside the field.
    expect(calls).toEqual(['scroll', 'focus'])
    expect(page.find('[data-testid="m6-composer"]').exists()).toBe(true)
    // The FAB has nothing left to do while the composer is open — away, yet
    // still the box the toasts are anchored on.
    expect(page.get('ion-fab').classes()).toContain('fab-away')
    expect(page.get('ion-fab').attributes('id')).toBe(FAB_ANCHOR.m6)
    expect(written).toEqual([])
  })

  it('✕ closes the composer, drops the words and the day, keeps the tag, and brings the FAB back', async () => {
    seedEntry('e1', { name: 'Brot', tag: 'Supermarkt' })
    const page = mountPage()
    await openComposer(page)
    await page.find('[data-testid="m6-tag-chip"]').trigger('click')
    await page.findComponent(IonInput).setValue('Milch')
    await page.find('[data-testid="due-chip-today"]').trigger('click')

    await page.find('[data-testid="m6-composer-close"]').trigger('click')
    expect(page.find('[data-testid="m6-composer"]').exists()).toBe(false)
    expect(page.get('ion-fab').classes()).not.toContain('fab-away')

    await openComposer(page)
    expect(page.findComponent(IonInput).props('modelValue')).toBe('')
    expect(page.find('[data-testid="m6-composer-due"]').exists()).toBe(false)
    expect(page.get('[data-testid="m6-tag-chip"]').attributes('aria-pressed')).toBe('true')
    expect(written.filter((w) => w.op === 'insert')).toEqual([])
  })

  it('stands open on an empty list (G-7), with no FAB to open it', async () => {
    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m6-composer"]').exists()).toBe(true)
    expect(page.find('[data-testid="m6-empty"]').exists()).toBe(true)
    expect(page.get('ion-fab').classes()).toContain('fab-away')
  })
})

/** A purchase on the stubbed day, so its heading is *Today* whatever day the suite runs. */
const BOUGHT_TODAY = new Date(`${STUB_TODAY}T09:30:00`).toISOString()

describe('M6 — who bought it, and when (FR-30.4)', () => {
  it('names the buyer and the time on a bought entry, from the trip’s people', async () => {
    seedEntry('e1', {
      name: 'Brot',
      bought: 1,
      bought_at: BOUGHT_TODAY,
      bought_by_user_id: 'u-sia',
    })
    const page = mountPage()
    await flushPromises()

    await page.find('[data-testid="m6-before-fold"]').trigger('click')
    const stamp = page.find('[data-testid="m6-bought-stamp"]')
    // The span, not the line: the avatar beside it contributes its initials.
    // FR-30.15: the day is the heading's, so the stamp says only the time.
    expect(stamp.findAll('span').at(-1)?.text()).toMatch(/^bought by Sia · \d\d:\d\d$/)
    expect(page.find('[data-testid="m6-bought-day-head"]').text()).toMatch(/^Today\b/)
    expect(stamp.find('[data-testid="user-avatar"]').exists()).toBe(true)
  })

  it('names the buyer on a source line too, from the id the source hands over', async () => {
    const bought = line({
      name: 'Sonnencreme',
      boughtNote: t('shopping.wentToPacking'),
      boughtAt: BOUGHT_TODAY,
      boughtBy: 'u-andy',
    })
    const page = mountPage([source({}, { buy_before: [bought] })])
    await flushPromises()

    await page.find('[data-testid="m6-before-fold"]').trigger('click')
    const row = page.find('[data-testid="m6-bought-row"]')
    expect(row.find('[data-testid="m6-bought-note"]').text()).toBe(t('shopping.wentToPacking'))
    expect(row.findAll('[data-testid="m6-bought-stamp"] span').at(-1)?.text()).toMatch(
      /^bought by Andy · \d\d:\d\d$/,
    )
  })

  it('states only the time where nobody can be named (Local Mode, G-8)', async () => {
    seedEntry('e1', { name: 'Brot', bought: 1, bought_at: BOUGHT_TODAY })
    const page = mountPage()
    await flushPromises()

    await page.find('[data-testid="m6-before-fold"]').trigger('click')
    const stamp = page.find('[data-testid="m6-bought-stamp"]')
    expect(stamp.text()).toMatch(/^bought · \d\d:\d\d$/)
    expect(stamp.find('[data-testid="user-avatar"]').exists()).toBe(false)
  })

  it('says nothing where the purchase carries no record at all', async () => {
    seedEntry('e1', { name: 'Brot', bought: 1 })
    const page = mountPage()
    await page.find('[data-testid="m6-before-fold"]').trigger('click')
    // The positive signal beside the absence: the bought row itself is there.
    expect(page.findAll('[data-testid="m6-bought-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m6-bought-stamp"]').exists()).toBe(false)
  })
})

/**
 * ADR-033. „Nothing to buy before departure" is a sentence somebody leaves the
 * house on, and until this trip's partition is here it is a guess — for the
 * entries as much as for the packing rows, which travel the same partition.
 */
describe('M6 — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the list is loading rather than claiming there is nothing to buy', async () => {
    tripScreen.loadedTrips.clear()

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m6-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="m6-empty"]').exists()).toBe(false)
    expect(page.text()).toContain(t('shopping.listUnknown'))

    tripScreen.loadedTrips.add('t1')
    await flushPromises()

    expect(page.find('[data-testid="m6-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m6-empty"]').exists()).toBe(true)
    expect(page.text()).toContain(t('shopping.emptyAll'))
  })
})

/**
 * FR-30.8 — the list that is now, as the composer's default.
 *
 * With both lists on one screen there is no tab to open on; what FR-30.8's
 * rule still decides is whether a new entry may be for *before departure* at
 * all. The rule itself is pinned in `list.spec.ts`; what is pinned here is
 * that the composer asks it — and that it waits for the trip, since a rule
 * read off an absent trip would take *before* away and then give it back.
 */
describe('M6 — the list a new entry goes on (FR-30.8)', () => {
  function seedTrip(row: Record<string, unknown>) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, ...row },
    })
  }

  const listChips = (page: ReturnType<typeof mountPage>) =>
    page.find('[data-testid="m6-composer-list"]')

  it('offers both lists on a planned trip, before departure chosen', async () => {
    seedTrip({ status: 'planning' })
    const page = mountPage()
    await flushPromises()

    expect(listChips(page).exists()).toBe(true)
    expect(page.get('[data-testid="m6-list-before"]').attributes('aria-pressed')).toBe('true')
  })

  it('writes for the destination on a running trip, with no list to choose', async () => {
    seedTrip({ status: 'active' })
    const page = mountPage()
    await flushPromises()

    expect(listChips(page).exists()).toBe(false)
    await page.findComponent(IonInput).setValue('Brot')
    await page.find('[data-testid="m6-add"]').trigger('submit')
    expect(written.at(-1)).toMatchObject({ op: 'insert', fields: { list: 'buy_local' } })
  })

  it('writes for the destination once a planned trip’s packing is finished (FR-5.10)', async () => {
    seedTrip({ status: 'planning', packing_closed_at: '2026-09-20T18:40:00.000Z' })
    const page = mountPage()
    await flushPromises()

    expect(listChips(page).exists()).toBe(false)
  })

  it('writes for the destination once a planned trip’s first day has come (FR-7.14)', async () => {
    // Nobody tapped *Reise starten*; M25 already writes for the road today.
    seedTrip({ status: 'planning', start_date: '2026-07-08' })
    const page = mountPage()
    await flushPromises()

    expect(listChips(page).exists()).toBe(false)
  })

  it('offers both lists the day before a planned trip’s first day', async () => {
    seedTrip({ status: 'planning', start_date: '2026-07-09' })
    const page = mountPage()
    await flushPromises()

    expect(listChips(page).exists()).toBe(true)
  })

  it('offers before departure while the trip itself is not here yet', async () => {
    const page = mountPage()
    await flushPromises()

    expect(listChips(page).exists()).toBe(true)
  })
})

describe('M6 — tags, and the list grouped by them (FR-30.9)', () => {
  /** Types into the sheet's search field, the way Ionic reports it. */
  async function search(page: ReturnType<typeof mountPage>, text: string) {
    await page.findComponent(IonSearchbar).vm.$emit('ionInput', { detail: { value: text } })
  }
  const headings = (page: ReturnType<typeof mountPage>) =>
    page.findAll('ion-item-group').map((g) => g.attributes('data-testid'))

  it('files an entry under the tag chosen in the composer, and keeps the tag for the next one', async () => {
    seedEntry('e0', { name: 'Brot', tag: 'Supermarkt' })
    const page = mountPage()
    await openComposer(page)

    await page.find('[data-testid="m6-tag-chip"]').trigger('click')
    await page.findComponent(IonInput).setValue('Milch')
    await page.find('[data-testid="m6-add"]').trigger('submit')

    expect(written.at(-1)).toMatchObject({
      op: 'insert',
      table: 'shopping_entries',
      fields: { name: 'Milch', tag: 'Supermarkt' },
    })
    expect(page.find('[data-testid="m6-tag-chip"]').attributes('aria-pressed')).toBe('true')
    expect(written.at(-1)!.fields).not.toHaveProperty('bought_at')
  })

  it('adds an entry with no tag while no chip is selected, and a second tap unselects', async () => {
    seedEntry('e0', { name: 'Brot', tag: 'Supermarkt' })
    const page = mountPage()
    await openComposer(page)
    const chip = page.find('[data-testid="m6-tag-chip"]')

    await chip.trigger('click')
    await chip.trigger('click')
    await page.findComponent(IonInput).setValue('Batterien')
    await page.find('[data-testid="m6-add"]').trigger('submit')

    expect(written.at(-1)!.fields).toMatchObject({ name: 'Batterien', tag: null })
  })

  /** The sheet's name field — the composer has an IonInput of its own. */
  const sheetName = (page: ReturnType<typeof mountPage>) =>
    page.findAllComponents(IonInput).find((c) => c.attributes('data-testid') === 'm6-entry-name')!

  async function typeSheetName(page: ReturnType<typeof mountPage>, text: string) {
    await sheetName(page).vm.$emit('ionInput', { detail: { value: text } })
  }

  const confirm = (page: ReturnType<typeof mountPage>) =>
    page.find('[data-testid="m6-entry-confirm"]')

  it('the sheet adds an entry from a name and a tag made in it, and writes nothing before Hinzufügen', async () => {
    const page = mountPage()
    await page.findComponent(IonInput).setValue('Mücken')
    await page.find('[data-testid="m6-tag-new"]').trigger('click')
    // Carries what was typed in the field: the same entry, in the fuller mask.
    expect(sheetName(page).props('value')).toBe('Mücken')

    await typeSheetName(page, 'Mückenspray')
    await search(page, '  Apotheke ')
    expect(page.find('[data-testid="tag-pick-create"]').text()).toContain('Apotheke')
    await page.find('[data-testid="tag-pick-create"]').trigger('click')
    expect(written).toEqual([])
    expect(page.find('[data-testid="tag-pick-summary"]').text()).toBe(
      t('shopping.tagFiledUnder', { tag: 'Apotheke' }),
    )

    await confirm(page).trigger('click')
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      op: 'insert',
      table: 'shopping_entries',
      fields: { name: 'Mückenspray', tag: 'Apotheke' },
    })
    expect(page.find('[data-testid="m6-entry-name"]').exists()).toBe(false)
    expect(page.findComponent(IonInput).props('modelValue')).toBe('')
    expect(page.find('[data-testid="m6-tag-chip"]').attributes('aria-pressed')).toBe('true')
    expect(headings(page)).toEqual(['m6-group-tag-Apotheke'])
  })

  it('the sheet offers no create for a name that exists in another case, and chooses the existing one', async () => {
    seedEntry('e0', { name: 'Brot', tag: 'Supermarkt' })
    const page = mountPage()
    await openComposer(page)
    await page.find('[data-testid="m6-tag-new"]').trigger('click')
    await typeSheetName(page, 'Milch')

    await search(page, 'super')
    expect(page.find('[data-testid="tag-pick-offer-Supermarkt"]').exists()).toBe(true)
    await search(page, 'supermarkt')
    expect(page.find('[data-testid="tag-pick-create"]').exists()).toBe(false)
    await page.findComponent(IonSearchbar).trigger('keyup', { key: 'Enter' })
    await confirm(page).trigger('click')

    expect(written.at(-1)!.fields).toMatchObject({ name: 'Milch', tag: 'Supermarkt' })
  })

  it('offers Hinzufügen only for a name: a blank one writes nothing', async () => {
    const page = mountPage()
    await page.find('[data-testid="m6-tag-new"]').trigger('click')
    expect(
      page
        .findAllComponents(IonButton)
        .find((c) => c.attributes('data-testid') === 'm6-entry-confirm')!
        .props('disabled'),
    ).toBe(true)

    await confirm(page).trigger('click')
    await page.findComponent(IonSearchbar).trigger('keyup', { key: 'Enter' })
    expect(written).toEqual([])
  })

  it('a tag made in the sheet stays a chip when it is unselected — even with no entry carrying it', async () => {
    const page = mountPage()
    await page.find('[data-testid="m6-tag-new"]').trigger('click')
    await typeSheetName(page, 'Pasta')
    await search(page, 'Laden')
    await page.find('[data-testid="tag-pick-create"]').trigger('click')
    await confirm(page).trigger('click')
    await page.find('[data-testid="m6-row-label"]').trigger('click')
    await page.find('[data-testid="m6-entry-remove"]').trigger('click')

    const chip = () => page.find('[data-testid="m6-tag-chip"]')
    expect(chip().text()).toBe('Laden')
    expect(chip().attributes('aria-pressed')).toBe('true')

    await chip().trigger('click')
    expect(chip().exists()).toBe(true)
    expect(chip().attributes('aria-pressed')).toBe('false')
    await chip().trigger('click')
    expect(chip().attributes('aria-pressed')).toBe('true')
  })

  it('puts the packing list first, then groups the open entries by tag A–Z, then the untagged', () => {
    seedEntry('e1', { name: 'Pasta', tag: 'Supermarkt' })
    seedEntry('e2', { name: 'Mückenspray', tag: 'Apotheke' })
    seedEntry('e3', { name: 'Batterien' })
    seedEntry('e4', { name: 'Brot', tag: 'Supermarkt' })
    const page = mountPage([source({ buy_before: [line({ name: 'Sonnencreme' })] })])

    expect(headings(page)).toEqual([
      'm6-group-packing',
      'm6-group-tag-Apotheke',
      'm6-group-tag-Supermarkt',
      'm6-group-own',
    ])
    const supermarkt = page.find('[data-testid="m6-group-tag-Supermarkt"]')
    expect(supermarkt.findAll('h3').map((h) => h.text())).toEqual(['Brot', 'Pasta'])
  })

  it('does not group what is bought by tag: the reveal files by day and names the tag in the row', async () => {
    seedEntry('e1', { name: 'Brot', tag: 'Supermarkt', bought: 1 })
    seedEntry('e2', { name: 'Mückenspray', tag: 'Apotheke', bought: 1 })
    const page = mountPage()
    expect(headings(page)).toEqual([])

    await page.find('[data-testid="m6-before-fold"]').trigger('click')
    // FR-30.15: neither carries a moment, so both share the one undated day.
    expect(page.findAll('[data-testid="m6-bought-day-head"]').map((h) => h.text())).toEqual([
      t('shopping.boughtUndated'),
    ])
    expect(page.findAll('[data-testid="m6-bought-tag"]').map((p) => p.text())).toEqual([
      'Supermarkt',
      'Apotheke',
    ])
  })

  it('a tag whose last entry was bought is no longer offered as a chip', async () => {
    seedEntry('e1', { name: 'Brot', tag: 'Supermarkt', bought: 1 })
    seedEntry('e2', { name: 'Mückenspray', tag: 'Apotheke' })
    const page = mountPage()
    await openComposer(page)
    expect(page.findAll('[data-testid="m6-tag-chip"]').map((c) => c.text())).toEqual(['Apotheke'])
  })

  it('a tap on an own entry’s name opens the sheet with its name and tag; Speichern writes only what changed', async () => {
    seedEntry('e1', { name: 'Batterien' })
    seedEntry('e2', { name: 'Brot', tag: 'Supermarkt' })
    const page = mountPage()
    const open = () =>
      page
        .findAll('[data-testid="m6-row-label"]')
        .find((l) => l.find('h3').text().startsWith('Batterien'))!
        .trigger('click')

    await open()
    expect(page.find('[data-testid="m6-entry-title"]').text()).toBe(t('shopping.entrySheetEdit'))
    expect(sheetName(page).props('value')).toBe('Batterien')
    expect(page.find('[data-testid="tag-pick-summary"]').text()).toBe(t('shopping.tagNone'))
    await page.find('[data-testid="tag-pick-offer-Supermarkt"]').trigger('click')
    expect(written).toEqual([])
    await confirm(page).trigger('click')

    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      op: 'upsert',
      table: 'shopping_entries',
      id: 'e1',
      fields: { tag: 'Supermarkt' },
    })
    expect(written[0]!.fields).not.toHaveProperty('name')
    expect(written[0]!.fields).not.toHaveProperty('bought')
    expect(headings(page)).toEqual(['m6-group-tag-Supermarkt'])

    // The title alone: the tag is left as it is.
    await open()
    await typeSheetName(page, '  Batterien AA ')
    await confirm(page).trigger('click')
    expect(written.at(-1)).toMatchObject({ id: 'e1', fields: { name: 'Batterien AA' } })
    expect(written.at(-1)!.fields).not.toHaveProperty('tag')
  })

  it('saving an entry as it was writes nothing', async () => {
    seedEntry('e1', { name: 'Brot', tag: 'Supermarkt' })
    const page = mountPage()
    await page.find('[data-testid="m6-row-label"]').trigger('click')
    await confirm(page).trigger('click')
    expect(written).toEqual([])
  })

  it('the sheet takes the chosen tag away with its ✕, or makes a new one', async () => {
    seedEntry('e1', { name: 'Brot', tag: 'Supermarkt' })
    const page = mountPage()

    await page.find('[data-testid="m6-row-label"]').trigger('click')
    expect(page.find('[data-testid="tag-pick-summary"]').text()).toBe(
      t('shopping.tagFiledUnder', { tag: 'Supermarkt' }),
    )
    await page.find('[data-testid="tag-pick-assigned-Supermarkt"]').trigger('click')
    await confirm(page).trigger('click')
    expect(written.at(-1)).toMatchObject({ id: 'e1', fields: { tag: null } })
    expect(headings(page)).toEqual(['m6-group-own'])

    await page.find('[data-testid="m6-row-label"]').trigger('click')
    await search(page, ' Bäcker ')
    await page.find('[data-testid="tag-pick-create"]').trigger('click')
    await confirm(page).trigger('click')
    expect(written.at(-1)).toMatchObject({ id: 'e1', fields: { tag: 'Bäcker' } })
    expect(headings(page)).toEqual(['m6-group-tag-Bäcker'])
  })

  it('a source line offers nothing to edit: a tap on its name opens nothing', async () => {
    const page = mountPage([source({ buy_before: [line({ name: 'Sonnencreme' })] })])
    await page.find('[data-testid="m6-row-label"]').trigger('click')
    expect(page.find('[data-testid="m6-entry-name"]').exists()).toBe(false)
    expect(page.find('[data-testid="m6-row-tag-add"]').exists()).toBe(false)
  })

  it('draws its lines in the ListRows M25 draws its tasks in, with the buy-out wash', () => {
    const page = mountPage([source({ buy_before: [line({ name: 'Sonnencreme' })] })])
    const rows = page.findComponent(ListRows)
    expect(rows.exists()).toBe(true)
    expect(rows.props('wash')).toBe(true)
    expect(rows.find('[data-testid="m6-row"]').exists()).toBe(true)
  })

  it('a source line is moved like any other (FR-30.13): it has a grip, and its heading takes it back at another gap', () => {
    const page = mountPage([source({ buy_before: [line({ name: 'Sonnencreme' })] })])
    const row = page.find('[data-testid="m6-row"]')
    expect(row.find('[data-testid="m6-row-grip-Sonnencreme"]').exists()).toBe(true)
    expect(row.attributes('data-drop-index')).toBe('0')
    const group = page.find('[data-testid="m6-group-packing"]')
    expect(group.attributes('data-droppable')).toBe('true')
  })

  it('names the same refusal below the list, once, while not selecting', () => {
    seedEntry('e1', { name: 'Brot' })
    const withSourced = mountPage([source({ buy_before: [line({ name: 'Sonnencreme' })] })])
    expect(withSourced.find('[data-testid="m6-drag-hint"]').text()).toBe(t('shopping.dragHint'))

    // Own entries already in the store from above; nothing sourced this time
    // — nothing to drag onto, so no hint either.
    const ownOnly = mountPage()
    expect(ownOnly.find('[data-testid="m6-drag-hint"]').exists()).toBe(false)
  })

  it('puts the check-off alone at the end of the row, the due pill under the name', () => {
    seedEntry('e1', { name: 'Brot', due_date: '2026-07-20' })
    const page = mountPage()
    const row = page.get('[data-testid="m6-row"]')
    const slots = row.findAll('[slot="end"]').map((el) => el.element.tagName.toLowerCase())
    expect(slots).toEqual(['ion-checkbox'])
    expect(
      row.get('[data-testid="m6-row-facts-Brot"]').find('[data-testid="m6-row-due-Brot"]').exists(),
    ).toBe(true)
    // FR-30.13's drag: the leading slot is the grip, not selecting.
    const grip = page.find('[data-testid="m6-row-grip-Brot"]')
    expect(grip.exists()).toBe(true)
    expect(grip.attributes('aria-label')).toBe(t('shopping.dragToMove', { name: 'Brot' }))
  })
})

describe('M6 — a purchase’s own undo (FR-25.11j)', () => {
  it('raises a toast with an undo, anchored clear of the FAB — M4’s shape, not the dashboard card’s panel', async () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()

    await page.find('[data-testid="m6-row"] ion-checkbox').trigger('ionChange')

    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    expect(toast.message).toBe(t('shopping.boughtUndoable', { name: 'Brot' }))
    expect(toast.positionAnchor).toBe(FAB_ANCHOR.m6)

    written = []
    await (toast.buttons![0] as { handler: () => void }).handler()
    expect(written.at(-1)).toMatchObject({
      id: 'e1',
      fields: { bought: 0, bought_at: null, bought_by_user_id: null },
    })
  })

  it('buys a source line through its own write, the same as a tap on its checkbox', async () => {
    const sunscreen = line({ name: 'Sonnencreme' })
    const page = mountPage([source({ buy_before: [sunscreen] })])

    await page.find('[data-testid="m6-row"] ion-checkbox').trigger('ionChange')
    expect(sunscreen.buy).toHaveBeenCalledTimes(1)

    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    await (toast.buttons![0] as { handler: () => void }).handler()
    expect(sunscreen.unbuy).toHaveBeenCalledTimes(1)
  })
})

describe('M6 — multi-select and a bulk tag (FR-30.9)', () => {
  /** The mocked `setHeaderActions` getter, called fresh so it reads live state. */
  function headerActions(): HeaderAction[] {
    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    return build()
  }

  async function enterSelectionViaHeader() {
    headerActions()
      .find((a) => a.id === 'm6-select')!
      .onClick()
    await flushPromises()
  }

  it('offers the header icon only while an own entry is there to select', () => {
    mountPage([source({ buy_before: [line({ name: 'Sonnencreme' })] })])
    expect(headerActions().map((a) => a.id)).not.toContain('m6-select')

    seedEntry('e1', { name: 'Brot' })
    mountPage()
    expect(headerActions().map((a) => a.id)).toContain('m6-select')
  })

  it('a long press (contextmenu, its deterministic e2e seam) and the header icon both open the same inline selection', async () => {
    seedEntry('e1', { name: 'Brot', tag: 'Supermarkt' })
    const page = mountPage()

    await page.find('[data-testid="m6-row-label"]').trigger('contextmenu')
    expect(barSelection()).not.toBeNull()
    // Already selected by the press that started the mode — an entry that
    // already carries a tag is exactly what FR-30.9 added over M9's own
    // selection screen, which never offered a *retag*.
    expect(page.find(`[data-testid="m6-row-check-Brot"]`).classes()).toContain('on')

    await barExit()
    expect(barSelection()).toBeNull()

    await enterSelectionViaHeader()
    expect(barSelection()).not.toBeNull()
    expect(page.find(`[data-testid="m6-row-check-Brot"]`).classes()).not.toContain('on')
  })

  // G-20: the bar that counts the selection is the app bar's, so the field
  // and its chips stay where they were — at rest, never removed, or every
  // row under them would move up the moment the selection begins.
  it('keeps the field and its chips in place while selecting, at rest rather than gone', async () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()
    await openComposer(page)
    // M25's shape: the slot around the shared composer rests, as `composer-slot` there does.
    const composer = () => page.get('.composer-slot')
    expect(page.find('.composer-slot [data-testid="m6-composer"]').exists()).toBe(true)
    expect(composer().attributes('inert')).toBeUndefined()

    await enterSelectionViaHeader()

    expect(page.find('[data-testid="m6-add-input"]').exists()).toBe(true)
    expect(page.find('[data-testid="m6-tag-chips"]').exists()).toBe(true)
    expect(composer().attributes('inert')).toBeDefined()
    expect(composer().classes()).toContain('resting')

    await barExit()
    expect(composer().attributes('inert')).toBeUndefined()
  })

  it('excludes a packing-projected line — dashed, dimmed, named in the hint below the list', async () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage([source({ buy_before: [line({ name: 'Sonnencreme' })] })])

    await enterSelectionViaHeader()

    expect(page.find('[data-testid="m6-row-check-Brot"]').classes()).not.toContain('off')
    expect(page.find('[data-testid="m6-row-check-Sonnencreme"]').classes()).toContain('off')
    const rows = page.findAll('[data-testid="m6-row"]')
    const sunscreenRow = rows.find((r) => r.text().includes('Sonnencreme'))!
    expect(sunscreenRow.find('.select-box').classes()).toContain('off')
    expect(page.find('[data-testid="m6-select-hint"]').text()).toBe(t('shopping.selectHint'))

    // It cannot be toggled into the selection either.
    await sunscreenRow.find('[data-testid="m6-row-label"]').trigger('click')
    expect(page.find('[data-testid="m6-bulkbar"]').exists()).toBe(false)
  })

  it('“Alle N” takes every own line on the open tab, and the same act undoes it', async () => {
    seedEntry('e1', { name: 'Brot' })
    seedEntry('e2', { name: 'Milch', tag: 'Supermarkt' })
    const page = mountPage()

    await enterSelectionViaHeader()
    expect(barCount()).toBe(t('selection.none'))

    await barAll()
    expect(barCount()).toBe(t('selection.count', { n: 2 }))
    expect(page.find('[data-testid="m6-bulkbar"]').exists()).toBe(true)

    await barAll()
    expect(barCount()).toBe(t('selection.none'))
    expect(page.find('[data-testid="m6-bulkbar"]').exists()).toBe(false)
  })

  it('a selected line bought elsewhere leaves the batch, its count and the bar', async () => {
    seedEntry('e1', { name: 'Brot' })
    seedEntry('e2', { name: 'Milch' })
    const page = mountPage()

    await enterSelectionViaHeader()
    await barAll()
    // Another device buys Milch while it is chosen here.
    seedEntry('e2', { name: 'Milch', bought: 1, bought_at: TAP })
    await flushPromises()

    expect(barCount()).toBe(t('selection.count', { n: 1 }))
    await page.find('[data-testid="m6-bulk-tag"]').trigger('click')
    expect(page.find('[data-testid="m6-bulk-title"]').text()).toBe(
      t('shopping.bulkTagTitle', { n: 1 }),
    )

    // With Brot gone too, nothing chosen is left to act on.
    seedEntry('e1', { name: 'Brot', bought: 1, bought_at: TAP })
    await flushPromises()
    expect(page.find('[data-testid="m6-bulkbar"]').exists()).toBe(false)
  })

  it('files every selected entry — tagged or not — under one tag at once, with an undo', async () => {
    seedEntry('e1', { name: 'Brot' })
    seedEntry('e2', { name: 'Milch', tag: 'Apotheke' })
    const page = mountPage()

    await enterSelectionViaHeader()
    await barAll()
    await page.find('[data-testid="m6-bulk-tag"]').trigger('click')

    expect(page.find('[data-testid="m6-bulk-title"]').text()).toBe(
      t('shopping.bulkTagTitle', { n: 2 }),
    )
    // The single-entry sheet's summary sentence names "the entry" — wrong
    // for a batch that also applies the instant a chip is chosen.
    expect(page.find('[data-testid="tag-pick-summary"]').exists()).toBe(false)
    await page.find('[data-testid="tag-pick-offer-Apotheke"]').trigger('click')

    // Only Brot changed — Milch already carried Apotheke, so the two do not
    // collide on one write.
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ id: 'e1', fields: { tag: 'Apotheke' } })
    // The mode itself ends with the batch (M9's own rule).
    expect(barSelection()).toBeNull()

    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    expect(toast.message).toBe(t('shopping.bulkTagged', { n: 1, tag: 'Apotheke' }))
    expect(toast.positionAnchor).toBe(FAB_ANCHOR.m6)

    written = []
    await (toast.buttons![0] as { handler: () => void }).handler()
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ id: 'e1', fields: { tag: null } })
  })

  it('a batch that changes nothing raises a plain toast, with no undo to offer', async () => {
    seedEntry('e1', { name: 'Brot', tag: 'Apotheke' })
    const page = mountPage()

    await enterSelectionViaHeader()
    await barAll()
    await page.find('[data-testid="m6-bulk-tag"]').trigger('click')
    await page.find('[data-testid="tag-pick-offer-Apotheke"]').trigger('click')

    expect(written).toEqual([])
    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    expect(toast.message).toBe(t('shopping.bulkNothingToDo'))
    expect(toast.buttons).toBeUndefined()
  })
})

/*
 * FR-30.10: an entry may name the day it is due — FR-7.11's day for a task,
 * set in the entry's own sheet, worn as the same pill, and leading the list.
 */
describe('M6 — the day an entry is due (FR-30.10)', () => {
  const dueField = (page: ReturnType<typeof mountPage>) => page.findComponent({ name: 'DateField' })
  const confirmSheet = (page: ReturnType<typeof mountPage>) =>
    page.find('[data-testid="m6-entry-confirm"]').trigger('click')
  const labels = (page: ReturnType<typeof mountPage>) =>
    page.findAll('[data-testid="m6-row-label"] h3').map((h) => h.text())

  /*
   * M25's *Fällig* block: what is overdue, due today or
   * in the next two days leads, across both lists, named by its tag since it
   * stands outside its group — and leaves that group while it is there.
   */
  it('leads with what is due now across both lists, out of its group and named by its tag', () => {
    // STUB_TODAY is 2026-07-08.
    seedEntry('e1', { name: 'Brot', tag: 'Supermarkt' })
    seedEntry('e2', { name: 'Kerzen', tag: 'Supermarkt', due_date: '2026-07-20' })
    seedEntry('e3', { name: 'Spray', tag: 'Apotheke', due_date: '2026-07-07' })
    seedEntry('e4', { name: 'Pflaster', tag: 'Apotheke' })
    seedEntry('e5', { name: 'Wasser', tag: null, list: 'buy_local', due_date: '2026-07-09' })
    const page = mountPage()

    const due = page.get('[data-testid="m6-due"]')
    expect(due.findAll('[data-testid="m6-row"] h3').map((h) => h.text())).toEqual([
      'Spray',
      'Wasser',
    ])
    expect(due.get('[data-testid="m6-row-tag-Spray"]').text()).toBe('Apotheke')
    expect(due.get('[data-testid="m6-row-tag-Wasser"]').text()).toBe(t('shopping.ownEntries'))
    expect(labels(page)).toEqual(['Spray', 'Wasser', 'Pflaster', 'Kerzen', 'Brot'])
    expect(page.get('[data-testid="m6-group-tag-Apotheke"]').text()).not.toContain('Spray')
    // The list the block took its only line from folds, and counts it there.
    expect(page.get('[data-testid="m6-local-fold"]').text()).toBe(
      t('shopping.listRestDue', { shelf: t('shopping.atDestination'), due: 1 }),
    )
    expect(page.get('[data-testid="m6-row-due-Spray"]').attributes('data-due')).toBe('overdue')
    expect(page.get('[data-testid="m6-row-due-Spray"]').text()).toBe(t('tasks.dueOverdue'))
    expect(page.get('[data-testid="m6-row-due-Kerzen"]').attributes('data-due')).toBe('later')
    expect(page.find('[data-testid="m6-row-tag-Kerzen"]').exists()).toBe(false)
    expect(page.find('[data-testid="m6-row-due-Brot"]').exists()).toBe(false)
  })

  it('the sheet shows the day, sets a new one on Speichern, and takes it off with the clear', async () => {
    seedEntry('e1', { name: 'Brot', tag: null, due_date: '2026-07-09' })
    const page = mountPage()

    await page.find('[data-testid="m6-row-label"]').trigger('click')
    expect(dueField(page).props('value')).toBe('2026-07-09')
    dueField(page).vm.$emit('update', '2026-07-12')
    expect(written).toEqual([])
    await confirmSheet(page)
    expect(written.at(-1)).toMatchObject({ id: 'e1', fields: { due_date: '2026-07-12' } })

    await page.find('[data-testid="m6-row-label"]').trigger('click')
    dueField(page).vm.$emit('update', '')
    await confirmSheet(page)
    expect(written.at(-1)).toMatchObject({ id: 'e1', fields: { due_date: null } })
    expect(page.find('[data-testid="m6-row-due-Brot"]').exists()).toBe(false)
  })

  it('a new entry takes its day from the sheet', async () => {
    const page = mountPage()
    await page.find('[data-testid="m6-tag-new"]').trigger('click')
    await page
      .findAllComponents(IonInput)
      .find((c) => c.attributes('data-testid') === 'm6-entry-name')!
      .vm.$emit('ionInput', { detail: { value: 'Milch' } })
    dueField(page).vm.$emit('update', '2026-07-08')
    await confirmSheet(page)

    expect(written.at(-1)).toMatchObject({
      op: 'insert',
      fields: { name: 'Milch', due_date: '2026-07-08' },
    })
    expect(page.get('[data-testid="m6-row-due-Milch"]').text()).toBe(t('tasks.dueToday'))
  })

  /*
   * M25's day row under the field: shown once something is typed, *Vor
   * Abreise* on the list bought before the trip, and the day
   * gone again after the add.
   */
  it('dates the next entry from the composer’s chips, the eve of departure among them', async () => {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'planning', start_date: '2026-07-20' },
    })
    const page = mountPage()
    const composer = () => page.get('[data-testid="m6-composer"]')
    expect(composer().find('[data-testid="m6-composer-due-chips"]').exists()).toBe(false)

    await composer().findComponent(IonInput).setValue('Sonnencreme')
    await composer().get('[data-testid="due-chip-beforeDeparture"]').trigger('click')
    await composer().get('form').trigger('submit')

    expect(written.at(-1)).toMatchObject({
      op: 'insert',
      fields: { name: 'Sonnencreme', due_date: '2026-07-19' },
    })
    expect(composer().find('[data-testid="m6-composer-due-chips"]').exists()).toBe(false)
  })

  it('offers no eve of departure for the list bought on the road', async () => {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'planning', start_date: '2026-07-20' },
    })
    const page = mountPage()
    await page.find('[data-testid="m6-list-local"]').trigger('click')
    const composer = page.get('[data-testid="m6-composer"]')
    await composer.findComponent(IonInput).setValue('Brot')

    expect(composer.find('[data-testid="due-chip-tomorrow"]').exists()).toBe(true)
    expect(composer.find('[data-testid="due-chip-beforeDeparture"]').exists()).toBe(false)
  })
})

describe('M6 — who buys it (FR-30.12)', () => {
  /** The viewer is Andy, so *Meine* has somebody to mean. */
  const asAndy = {
    identity: {
      fetchMe: async () => ({ user_id: 'u-andy', display_name: 'Andy', is_instance_admin: false }),
    },
  }

  /** The trip's member rows — what makes a person somebody to hand a purchase to. */
  function seedMembers(members: string[] = ['u-andy', 'u-sia']) {
    const trips = useTripStore()
    for (const [i, userId] of members.entries()) {
      trips.applyChange({
        seq: 0,
        table: TABLE.tripMembers,
        id: `mem-${i}`,
        deleted: false,
        row: { trip_id: 't1', user_id: userId, role: i === 0 ? 'owner' : 'member' },
      })
    }
  }

  function headerActions(): HeaderAction[] {
    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    return build()
  }

  it('seats an own entry at its edge — never a packing line, never with nobody to hand it to', async () => {
    seedMembers()
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage([source({ buy_before: [line({ name: 'Gaskartusche' })] })], asAndy)
    await flushPromises()

    const seat = page.get('[data-testid="m6-row-assign-Brot"]')
    expect(seat.attributes('slot')).toBe('end')
    // The facts line stays for facts: an entry with none is one line.
    expect(page.find('[data-testid="m6-row-facts-Brot"]').exists()).toBe(false)
    expect(page.find('[data-testid="m6-row-assign-Gaskartusche"]').exists()).toBe(false)

    // Local and Single-User: no member rows, so no seat and no chip (G-8).
    setActivePinia(createPinia())
    seedEntry('e1', { name: 'Brot' })
    const alone = mountPage(undefined, asAndy)
    await flushPromises()
    expect(alone.find('[data-testid="m6-row-assign-Brot"]').exists()).toBe(false)
    expect(alone.find('[data-testid="m6-mine"]').exists()).toBe(false)
  })

  it('hands an entry over through the picker, names the person, and undoes it from the toast', async () => {
    seedMembers()
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage(undefined, asAndy)
    await flushPromises()

    picked = 'u-sia'
    await page.get('[data-testid="m6-row-assign-Brot"]').trigger('click')
    await flushPromises()
    expect(written).toEqual([
      expect.objectContaining({ id: 'e1', fields: { assignee_user_id: 'u-sia' } }),
    ])
    expect(page.find('[data-testid="m6-row-assign-Brot"]').text()).toContain('S')
    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    expect(toast.message).toBe(t('packing.assignedToast', { name: 'Brot', who: 'Sia' }))

    written = []
    await (toast.buttons![0] as { handler: () => void }).handler()
    expect(written).toEqual([
      expect.objectContaining({ id: 'e1', fields: { assignee_user_id: null } }),
    ])
  })

  it('writes nothing when the picker is dismissed', async () => {
    seedMembers()
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage(undefined, asAndy)
    await flushPromises()

    picked = undefined
    await page.get('[data-testid="m6-row-assign-Brot"]').trigger('click')
    await flushPromises()
    expect(written).toEqual([])
    expect(presentToast).not.toHaveBeenCalled()
  })

  it('keeps the person while selecting, but not the control', async () => {
    seedMembers()
    seedEntry('e1', { name: 'Brot', assignee_user_id: 'u-sia' })
    const page = mountPage(undefined, asAndy)
    await flushPromises()
    expect(page.find('[data-testid="m6-row-assign-Brot"]').exists()).toBe(true)

    headerActions()
      .find((a) => a.id === 'm6-select')!
      .onClick()
    await flushPromises()
    expect(page.find('[data-testid="m6-row-assign-Brot"]').exists()).toBe(false)
    expect(page.get('[data-testid="m6-row-assignee-Brot"]').attributes('slot')).toBe('end')
  })

  it('*Meine* narrows the list to what I am to buy', async () => {
    seedMembers()
    seedEntry('e1', { name: 'Brot', assignee_user_id: 'u-andy' })
    seedEntry('e2', { name: 'Milch', assignee_user_id: 'u-sia' })
    seedEntry('e3', { name: 'Käse' })
    const page = mountPage([source({ buy_before: [line({ name: 'Gaskartusche' })] })], asAndy)
    await flushPromises()

    const names = () => page.findAll('.row-name').map((el) => el.text())
    expect(names()).toEqual(expect.arrayContaining(['Brot', 'Milch', 'Käse', 'Gaskartusche']))
    await page.get('[data-testid="m6-mine"]').trigger('click')
    expect(names()).toEqual(['Brot'])
    // An empty *Meine* is not an empty list.
    await page.get('[data-testid="m6-mine"]').trigger('click')
    expect(names()).toHaveLength(4)
  })

  it('hands a whole selection to one person, with one undo, and says so', async () => {
    seedMembers()
    seedEntry('e1', { name: 'Brot' })
    seedEntry('e2', { name: 'Milch', assignee_user_id: 'u-sia' })
    const page = mountPage(undefined, asAndy)
    await flushPromises()

    headerActions()
      .find((a) => a.id === 'm6-select')!
      .onClick()
    await flushPromises()
    await barAll()
    picked = 'u-sia'
    await page.get('[data-testid="m6-bulk-assign"]').trigger('click')
    await flushPromises()

    // Milch already was Sia's: one write, and the mode ends with the batch.
    expect(written).toEqual([
      expect.objectContaining({ id: 'e1', fields: { assignee_user_id: 'u-sia' } }),
    ])
    expect(barSelection()).toBeNull()
    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    expect(toast.message).toBe(t('shopping.bulkAssigned', { n: 1, who: 'Sia' }))

    written = []
    await (toast.buttons![0] as { handler: () => void }).handler()
    expect(written).toEqual([
      expect.objectContaining({ id: 'e1', fields: { assignee_user_id: null } }),
    ])
  })

  it('heads the person picker with the chosen lines still open', async () => {
    seedMembers()
    seedEntry('e1', { name: 'Brot' })
    seedEntry('e2', { name: 'Milch' })
    const page = mountPage(undefined, asAndy)
    await flushPromises()

    headerActions()
      .find((a) => a.id === 'm6-select')!
      .onClick()
    await flushPromises()
    await barAll()
    // Another device buys Milch while it is chosen here.
    seedEntry('e2', { name: 'Milch', bought: 1, bought_at: TAP })
    await flushPromises()
    picked = undefined
    await page.get('[data-testid="m6-bulk-assign"]').trigger('click')
    await flushPromises()

    expect(vi.mocked(pickAssignee).mock.calls.at(-1)![0]).toBe(
      t('shopping.bulkAssignTitle', { n: 1 }),
    )
  })
})

/*
 * FR-30.14: a staple bought again and again — milk, bread — goes back on the
 * list as a new entry straight from its bought row, so the purchase keeps its
 * record and nothing is typed anew.
 */
describe('M6 — bought again, as a new entry (FR-30.14)', () => {
  const againOf = (page: ReturnType<typeof mountPage>, name: string) =>
    page
      .findAll('[data-testid="m6-bought-row"]')
      .find((r) => r.find('h3').text() === name)!
      .find('[data-testid="m6-bought-again"]')

  it('writes a new open entry with the name and the tag from the row, leaving the purchase as it was', async () => {
    seedEntry('e1', {
      name: 'Milch',
      tag: 'Supermarkt',
      bought: 1,
      bought_at: '2026-09-18T09:00:00.000Z',
      bought_by_user_id: 'u-sia',
      due_date: '2026-09-18',
      assignee_user_id: 'u-sia',
    })
    const page = mountPage()
    await page.find('[data-testid="m6-before-fold"]').trigger('click')

    await againOf(page, 'Milch').trigger('click')

    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      op: 'insert',
      table: 'shopping_entries',
      fields: { trip_id: 't1', name: 'Milch', list: 'buy_before', bought: 0, tag: 'Supermarkt' },
    })
    expect(written[0]!.id).not.toBe('e1')
    // Neither the day nor the person carries over: both belonged to that purchase.
    expect(written[0]!.fields).toMatchObject({ due_date: null })
    expect(written[0]!.fields).not.toHaveProperty('assignee_user_id')
    expect(page.findAll('[data-testid="m6-row"]').map((r) => r.find('h3').text())).toEqual([
      'Milch',
    ])
    expect(
      useShoppingStore()
        .boughtEntries('t1', 'buy_before')
        .map((e) => e.id),
    ).toEqual(['e1'])
  })

  it('says the entry is on the list again while it stands there open, and offers nothing twice', async () => {
    seedEntry('e1', { name: 'Milch', bought: 1 })
    seedEntry('e2', { name: 'Brot', bought: 1 })
    const page = mountPage()
    await page.find('[data-testid="m6-before-fold"]').trigger('click')
    await againOf(page, 'Milch').trigger('click')
    await page.find('[data-testid="m6-bought-bar"]').trigger('click')

    const milk = page
      .findAll('[data-testid="m6-bought-row"]')
      .find((r) => r.find('h3').text() === 'Milch')!
    expect(milk.find('[data-testid="m6-bought-again"]').exists()).toBe(false)
    expect(milk.find('[data-testid="m6-bought-listed"]').text()).toBe(t('shopping.onListAgain'))
    expect(againOf(page, 'Brot').exists()).toBe(true)
  })

  it('undoes from the toast by removing the new entry, never the bought one', async () => {
    seedEntry('e1', { name: 'Milch', bought: 1 })
    const page = mountPage()
    await page.find('[data-testid="m6-before-fold"]').trigger('click')
    await againOf(page, 'Milch').trigger('click')
    const added = written[0]!.id

    const toast = vi.mocked(presentToast).mock.calls.at(-1)![0]
    expect(toast.message).toBe(t('shopping.boughtAgain', { name: 'Milch' }))
    expect(toast.positionAnchor).toBe(FAB_ANCHOR.m6)
    await (toast.buttons![0] as { handler: () => void }).handler()

    expect(written.at(-1)).toMatchObject({ op: 'delete', table: 'shopping_entries', id: added })
    expect(
      useShoppingStore()
        .getEntries('t1')
        .map((e) => e.id),
    ).toEqual(['e1'])
  })

  it('puts a purchase made at the destination back on that list', async () => {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'active' },
    })
    seedEntry('e1', { name: 'Brot', list: 'buy_local', bought: 1 })
    const page = mountPage()
    await flushPromises()
    await page.find('[data-testid="m6-local-fold"]').trigger('click')

    await againOf(page, 'Brot').trigger('click')

    expect(written.at(-1)).toMatchObject({
      op: 'insert',
      fields: { name: 'Brot', list: 'buy_local' },
    })
  })

  it('offers nothing on a packing line, nor on a finished packing’s record of before departure (FR-7.12)', async () => {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'planning', packing_closed_at: TAP },
    })
    seedEntry('e1', { name: 'Sonnencreme', bought: 1 })
    const page = mountPage([
      source({}, { buy_local: [line({ name: 'Regenjacke', boughtNote: 'eingepackt' })] }),
    ])
    await flushPromises()
    await page.find('[data-testid="m6-before-fold"]').trigger('click')
    await page.find('[data-testid="m6-local-fold"]').trigger('click')

    const rows = page.findAll('[data-testid="m6-bought-row"]')
    expect(rows.map((r) => r.find('h3').text()).sort()).toEqual(['Regenjacke', 'Sonnencreme'])
    expect(page.find('[data-testid="m6-bought-again"]').exists()).toBe(false)
  })
})
