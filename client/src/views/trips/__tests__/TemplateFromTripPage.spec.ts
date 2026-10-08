// @vitest-environment jsdom
/**
 * M21's screen-level rules (FR-27.5). The recognition and the write plan are
 * domain-owned and the reachable flow is E2E-M21-01…03b; what is pinned here
 * is the one thing neither covers — that pressing create twice writes one
 * template, which an e2e case cannot provoke reliably and a real thumb can.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TemplateFromTripPage from '../TemplateFromTripPage.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/api/tables'

import { tripScreenStub } from '@/composables/shared/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/shared/useOrchestrator'

vi.mock('@/composables/shared/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}))

vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ionic/vue')
  return {
    ...actual,
    // Present resolves on a later tick, which is exactly the window the
    // second tap lands in. The stand-in is a real element because
    // `presentToast` marks the presented toast with an attribute, and an
    // object literal would be a toast no browser could have produced.
    toastController: {
      create: () =>
        Promise.resolve(
          Object.assign(document.createElement('ion-toast'), {
            present: () => Promise.resolve(),
          }),
        ),
    },
  }
})

const orchestratorFake = {
  ...tripScreenStub(),
  createTemplateFromTrip: vi.fn(() => 'tpl-new'),
  templateNameCollision: vi.fn(() => undefined),
  today: () => '2026-03-01',
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  orchestratorFake.createTemplateFromTrip.mockReturnValue('tpl-new')
  useTripStore().applyChanges([
    {
      seq: 0,
      table: TABLE.trips,
      id: 'trip-1',
      deleted: false,
      row: { name: 'Samedan Sommer 2026', year: 2026, status: 'archived' },
    },
    {
      seq: 0,
      table: TABLE.tripItems,
      id: 'row-1',
      deleted: false,
      row: { trip_id: 'trip-1', name: 'Reisefön', quantity: 1 },
    },
  ])
})

function mountPage() {
  return mount(TemplateFromTripPage, {
    props: { tripId: 'trip-1' },
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
  })
}

describe('M21 — creating (FR-27.5)', () => {
  it('writes one template however fast the button is pressed twice', async () => {
    const page = mountPage()
    await page.vm.$nextTick()

    const create = page.find('[data-testid="m21-create"]')
    // Both taps before either await settles — the toast and the navigation
    // are async, and the screen is still on top while they run.
    await Promise.all([create.trigger('click'), create.trigger('click')])
    await page.vm.$nextTick()

    expect(orchestratorFake.createTemplateFromTrip).toHaveBeenCalledTimes(1)
  })

  it('lets the user try again when the trip’s rows were not on the device', async () => {
    orchestratorFake.createTemplateFromTrip.mockReturnValue(null as never)
    const page = mountPage()
    await page.vm.$nextTick()

    await page.find('[data-testid="m21-create"]').trigger('click')
    await page.vm.$nextTick()
    await page.vm.$nextTick()

    // A refusal is not a dead end: the control comes back.
    expect(page.find('[data-testid="m21-create"]').attributes('disabled')).toBeUndefined()
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('M21 — a line per thing, saying for whom (UX-13, FR-27.5)', () => {
  function seedPeople(names: string[]) {
    useTripStore().applyChanges(
      names.map((name) => ({
        seq: 0,
        table: TABLE.travelers,
        id: `tr-${name}`,
        deleted: false,
        row: { trip_id: 'trip-1', name },
      })),
    )
  }
  function seedRow(id: string, name: string, travelerId: string | null) {
    useTripStore().applyChanges([
      {
        seq: 0,
        table: TABLE.tripItems,
        id,
        deleted: false,
        row: { trip_id: 'trip-1', name, quantity: 1, assigned_traveler_id: travelerId },
      },
    ])
  }
  const lines = (page: ReturnType<typeof mountPage>) =>
    page.findAll('[data-testid="m21-loose"]').map((l) => {
      const line = l.find('[data-testid="m21-loose-line"]')
      return [l.find('.name').text(), ...(line.exists() ? [line.text()] : [])].join(' | ')
    })

  it('folds one row per traveller into one line naming them all', async () => {
    seedPeople(['Andy', 'Sia', 'Leonardo'])
    // Rows arrive in sync order; the line names the travellers by name.
    for (const who of ['Sia', 'Leonardo', 'Andy'])
      seedRow(`jacke-${who}`, 'Regenjacke', `tr-${who}`)
    seedRow('stoecke', 'Wanderstöcke', 'tr-Andy')

    const page = mountPage()
    await page.vm.$nextTick()

    expect(lines(page)).toEqual([
      'Reisefön',
      'Regenjacke | per person · Andy, Leonardo, Sia',
      'Wanderstöcke | for Andy',
    ])
  })

  it('says per person whenever the save will, even before a traveller has synced', async () => {
    seedPeople(['Andy', 'Sia'])
    seedRow('hut-andy', 'Sonnenhut', 'tr-Andy')
    seedRow('hut-gone', 'Sonnenhut', 'tr-not-synced')

    const page = mountPage()
    await page.vm.$nextTick()

    expect(lines(page)).toContain('Sonnenhut | per person · Andy')
  })

  it('names nobody when the trip has one traveller', async () => {
    seedPeople(['Andy'])
    seedRow('stoecke', 'Wanderstöcke', 'tr-Andy')

    const page = mountPage()
    await page.vm.$nextTick()

    expect(lines(page)).toEqual(['Reisefön', 'Wanderstöcke'])
  })

  it('says "without a group" once for the section, not on every line', async () => {
    const page = mountPage()
    await page.vm.$nextTick()

    expect(page.find('[data-testid="m21-loose-caption"]').exists()).toBe(true)
    expect(page.find('[data-testid="m21-loose-line"]').exists()).toBe(false)
  })
})
