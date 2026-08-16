/**
 * M3 step 3 — the composition half (§3.27): the two scopes are separate
 * sections (FR-27.6), the preview names every merge with the groups that
 * caused it (FR-27.2), and it states how many preparation tasks the trip
 * will inherit (FR-27.7).
 *
 * A component test rather than e2e: the assertions are about what the
 * preview *says* about a composition, which needs a seeded master
 * partition with groups and includes. The e2e unit covers reaching and
 * completing the wizard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TripWizardPage from '../TripWizardPage.vue'
import { useMasterStore } from '@/stores/masterStore'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const orchestratorFake = { createTripFromWizard: vi.fn(() => 'trip-1') }

function template(id: string, name: string, kind: 'template' | 'group') {
  useMasterStore().applyChange({
    seq: 0,
    table: 'templates',
    id,
    deleted: false,
    row: { owner_id: 'me', name, kind },
  })
}

function item(id: string, name: string) {
  useMasterStore().applyChange({ seq: 0, table: 'items', id, deleted: false, row: { name } })
}

function position(id: string, templateId: string, itemId: string) {
  useMasterStore().applyChange({
    seq: 0,
    table: 'template_items',
    id,
    deleted: false,
    row: {
      template_id: templateId,
      item_id: itemId,
      quantity: 1,
      assignment: 'trip_global',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    },
  })
}

function includes(id: string, templateId: string, includedTemplateId: string) {
  useMasterStore().applyChange({
    seq: 0,
    table: 'template_includes',
    id,
    deleted: false,
    row: { template_id: templateId, included_template_id: includedTemplateId },
  })
}

function positionTask(id: string, templateItemId: string, task: string) {
  useMasterStore().applyChange({
    seq: 0,
    table: 'template_item_tasks',
    id,
    deleted: false,
    row: { template_item_id: templateItemId, task },
  })
}

/**
 * The owner's scenario: a Ferien-Vorlage over two photography groups that
 * share the camera, one of which asks for a battery charge before leaving.
 */
function seedComposition() {
  template('v1', 'Sommerferien', 'template')
  template('g1', 'Makro Fotografie', 'group')
  template('g2', 'Wildlife Fotografie', 'group')
  item('cam', 'Kamera')
  item('macro', 'Makro-Objektiv')
  item('tele', 'Teleobjektiv')
  position('p1', 'g1', 'cam')
  position('p2', 'g1', 'macro')
  position('p3', 'g2', 'cam')
  position('p4', 'g2', 'tele')
  includes('inc1', 'v1', 'g1')
  includes('inc2', 'v1', 'g2')
  positionTask('tk1', 'p1', 'Akkus laden')
}

/** Mount and walk to step 3 the way a user does — name, Next, Next. */
async function mountAtStepThree() {
  const wrapper = mount(TripWizardPage, {
    global: { provide: { orchestrator: orchestratorFake } },
  })
  await wrapper.get('[data-testid="wizard-name"]').trigger('ionInput', {
    detail: { value: 'Fototour' },
  })
  await wrapper.get('[data-testid="wizard-next"]').trigger('click')
  await wrapper.get('[data-testid="wizard-next"]').trigger('click')
  expect(wrapper.find('[data-testid="wizard-step-3"]').exists()).toBe(true)
  return wrapper
}

async function pick(wrapper: Awaited<ReturnType<typeof mountAtStepThree>>, templateId: string) {
  await wrapper
    .get(`[data-testid="wizard-pick-${templateId}"]`)
    .trigger('ionChange', { detail: { checked: true } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
})

describe('M3 step 3 — template composition (§3.27)', () => {
  it('splits the two scopes into their own sections (FR-27.6)', async () => {
    seedComposition()

    const wrapper = await mountAtStepThree()

    const vorlagen = wrapper.get('[data-testid="wizard-section-templates"]')
    const gruppen = wrapper.get('[data-testid="wizard-section-groups"]')
    expect(vorlagen.text()).toContain('Sommerferien')
    expect(vorlagen.text()).not.toContain('Makro Fotografie')
    expect(gruppen.text()).toContain('Makro Fotografie')
    expect(gruppen.text()).toContain('Wildlife Fotografie')
    expect(gruppen.text()).not.toContain('Sommerferien')
  })

  it('orders each section by name, not by the order rows arrived in', async () => {
    // Seeded deliberately out of alphabetical order: templateList follows Map
    // insertion, which follows the sync/IndexedDB order and differs per device.
    template('g9', 'Wildlife Fotografie', 'group')
    template('g1', 'Ausrüstung', 'group')
    template('g5', 'Makro Fotografie', 'group')

    const wrapper = await mountAtStepThree()

    const names = wrapper
      .get('[data-testid="wizard-section-groups"]')
      .findAll('ion-item h3')
      .map((n) => n.text())
    expect(names).toEqual(['Ausrüstung', 'Makro Fotografie', 'Wildlife Fotografie'])
  })

  it('counts a Vorlage by what it resolves to, not by its own positions (FR-27.2)', async () => {
    seedComposition()

    const wrapper = await mountAtStepThree()

    // v1 owns no positions; its three items all come from the two groups.
    expect(wrapper.get('[data-testid="wizard-count-v1"]').text()).toContain('3')
  })

  it('previews the items of the groups a picked Vorlage includes', async () => {
    seedComposition()

    const wrapper = await mountAtStepThree()
    await pick(wrapper, 'v1')

    expect(wrapper.get('[data-testid="wizard-item-count"]').text()).toContain('3')
  })

  it('names every merge and the groups that caused it (FR-27.2)', async () => {
    seedComposition()

    const wrapper = await mountAtStepThree()
    await pick(wrapper, 'v1')

    const merges = wrapper.get('[data-testid="wizard-merges"]').text()
    expect(merges).toContain('Kamera')
    expect(merges).toContain('Makro Fotografie')
    expect(merges).toContain('Wildlife Fotografie')
  })

  it('reports the preparation tasks the trip inherits (FR-27.7)', async () => {
    seedComposition()

    const wrapper = await mountAtStepThree()
    await pick(wrapper, 'v1')

    expect(wrapper.get('[data-testid="wizard-task-count"]').text()).toContain('1')
  })

  it('says nothing about tasks when no picked position carries one', async () => {
    seedComposition()

    const wrapper = await mountAtStepThree()
    await pick(wrapper, 'g2')

    expect(wrapper.find('[data-testid="wizard-task-count"]').exists()).toBe(false)
  })

  it('marks a group a picked Vorlage already brings, instead of offering it twice', async () => {
    seedComposition()

    const wrapper = await mountAtStepThree()
    await pick(wrapper, 'v1')

    // Both groups hang off v1, so both rows say where they came from.
    expect(wrapper.get('[data-testid="wizard-included-g1"]').text()).toContain('Sommerferien')
    expect(wrapper.get('[data-testid="wizard-included-g2"]').text()).toContain('Sommerferien')
  })

  it('names the first items on the row itself, and counts the rest (FR-27.12 · C)', async () => {
    seedComposition()
    // A fourth item pushes the group past what a row can show.
    item('ring', 'Ringlicht')
    item('zwi', 'Zwischenringe')
    position('p5', 'g1', 'ring')
    position('p6', 'g1', 'zwi')

    const wrapper = await mountAtStepThree()

    // Ordered by name, not by position order, and truncated with a count.
    expect(wrapper.get('[data-testid="wizard-preview-g1"]').text()).toBe(
      'Kamera · Makro-Objektiv · Ringlicht +1',
    )
  })

  it('says nothing about contents for a group that has none', async () => {
    template('g9', 'Leer', 'group')

    const wrapper = await mountAtStepThree()

    // The row is rendered — only the summary is absent, because "" is worse
    // than nothing.
    expect(wrapper.get('[data-testid="wizard-count-g9"]').text()).toContain('0')
    expect(wrapper.find('[data-testid="wizard-preview-g9"]').exists()).toBe(false)
  })

  it('offers the peek on every row of both scopes (FR-27.12 · A)', async () => {
    seedComposition()

    const wrapper = await mountAtStepThree()

    // The sheet's own contents are pinned in GroupPeekSheet.spec.ts — what the
    // wizard owes is a way in, on a Vorlage and on a group alike.
    expect(wrapper.get('[data-testid="wizard-peek-v1"]').attributes('aria-label')).toContain(
      'Sommerferien',
    )
    expect(wrapper.find('[data-testid="wizard-peek-g1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wizard-peek-g2"]').exists()).toBe(true)
  })

  it('leaves the group rows unmarked while no Vorlage is picked', async () => {
    seedComposition()

    const wrapper = await mountAtStepThree()

    // The row itself is on screen — the marker, and only the marker, is absent.
    expect(wrapper.get('[data-testid="wizard-count-g1"]').text()).toContain('2')
    expect(wrapper.find('[data-testid="wizard-included-g1"]').exists()).toBe(false)
  })
})
