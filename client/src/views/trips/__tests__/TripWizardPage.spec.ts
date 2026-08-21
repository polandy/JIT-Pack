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

const orchestratorFake = {
  // Typed on its parameter so a test can read the draft back: an untyped
  // vi.fn() records a zero-length argument tuple.
  createTripFromWizard: vi.fn((_draft: { sourceTemplateIds?: string[] }) => 'trip-1'),
}

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

/**
 * Pick a template on step 3, then walk to step 4 where its rows are reviewed.
 * A traveler is added on the way: without one, a per-person position fans out
 * over nobody and produces no row at all.
 */
async function mountAtStepFour(templateId = 'v1') {
  const wrapper = mount(TripWizardPage, {
    global: { provide: { orchestrator: orchestratorFake } },
  })
  await wrapper.get('[data-testid="wizard-name"]').trigger('ionInput', {
    detail: { value: 'Fototour' },
  })
  await wrapper.get('[data-testid="wizard-next"]').trigger('click')
  await wrapper.get('[data-testid="wizard-add-traveler"]').trigger('click')
  const travelerFields = wrapper.findAll('[data-testid="wizard-traveler-name"]')
  await travelerFields[travelerFields.length - 1]!.trigger('ionInput', {
    detail: { value: 'Andy' },
  })
  await wrapper.get('[data-testid="wizard-next"]').trigger('click')
  expect(wrapper.find('[data-testid="wizard-step-3"]').exists()).toBe(true)
  await pick(wrapper, templateId)
  await wrapper.get('[data-testid="wizard-next"]').trigger('click')
  expect(wrapper.find('[data-testid="wizard-step-4"]').exists()).toBe(true)
  return wrapper
}

/**
 * FR-2.6 variant A: the review step reviews. Until now it changed exactly one
 * thing — the amount — and every other decision waited until the trip existed.
 */
describe('M3 step 4 — deciding before the trip exists (FR-2.6)', () => {
  function seedForReview() {
    seedComposition()
    // A per-person row and a buy-before row, so the marks have something to
    // explain; both come from the Vorlage itself.
    useMasterStore().applyChange({
      seq: 0,
      table: 'template_items',
      id: 'p-jacket',
      deleted: false,
      row: {
        template_id: 'v1',
        item_id: 'jacket',
        quantity: 1,
        assignment: 'per_person',
        dedup: 'max',
        default_mode: 'pack',
        late_packer: 0,
      },
    })
    useMasterStore().applyChange({
      seq: 0,
      table: 'template_items',
      id: 'p-cream',
      deleted: false,
      row: {
        template_id: 'v1',
        item_id: 'cream',
        quantity: 1,
        assignment: 'trip_global',
        dedup: 'max',
        default_mode: 'buy_before',
        late_packer: 0,
      },
    })
    item('jacket', 'Regenjacke')
    item('cream', 'Sonnencreme')
  }

  const rowFor = (wrapper: Awaited<ReturnType<typeof mountAtStepFour>>, name: string) =>
    wrapper.findAll('[data-testid="wizard-review-row"]').find((n) => n.text().includes(name))!

  it('drops a row as consciously skipped, not as a missing row (FR-5.5)', async () => {
    seedForReview()
    const wrapper = await mountAtStepFour()

    await rowFor(wrapper, 'Kamera').get('[data-testid="wizard-review-drop"]').trigger('click')

    // Still on screen, struck through, and its amount is zero — which is what
    // makes the created row `skipped` rather than absent.
    const row = rowFor(wrapper, 'Kamera')
    expect(row.classes()).toContain('dropped')
    expect(row.get('[data-testid="wizard-review-qty"]').text()).toBe('0')
  })

  it('takes the drop back', async () => {
    seedForReview()
    const wrapper = await mountAtStepFour()

    const drop = rowFor(wrapper, 'Kamera').get('[data-testid="wizard-review-drop"]')
    await drop.trigger('click')
    await rowFor(wrapper, 'Kamera').get('[data-testid="wizard-review-restore"]').trigger('click')

    expect(rowFor(wrapper, 'Kamera').classes()).not.toContain('dropped')
    expect(rowFor(wrapper, 'Kamera').get('[data-testid="wizard-review-qty"]').text()).toBe('1')
  })

  it('counts what is actually coming on the create button', async () => {
    seedForReview()
    const wrapper = await mountAtStepFour()

    const count = (text: string) => Number(text.match(/\d+/)![0])
    const before = count(wrapper.get('[data-testid="wizard-create"]').text())
    await rowFor(wrapper, 'Kamera').get('[data-testid="wizard-review-drop"]').trigger('click')

    // A number that ignores the row you just dropped is worse than no number.
    expect(count(wrapper.get('[data-testid="wizard-create"]').text())).toBe(before - 1)
  })

  it('marks what the row already is, without offering to change it', async () => {
    seedForReview()
    const wrapper = await mountAtStepFour()

    expect(rowFor(wrapper, 'Regenjacke').text()).toMatch(/pro Person|per person/i)
    expect(rowFor(wrapper, 'Sonnencreme').text()).toMatch(/buy before|kaufen/i)

    // Labels, not controls: procurement and assignment have one editor, M5.
    expect(rowFor(wrapper, 'Sonnencreme').findAll('button').length).toBe(1)
  })
})

/**
 * G-16 on the one step e2e cannot reach with a field: a fresh instance has
 * no templates, so E2E-M3-19 ends on an empty step 4 with no quantity input.
 * The seeded harness has rows, so the create half of the pattern is driven
 * here instead.
 */
describe('M3 step 4 — the default action (G-16)', () => {
  it('Enter in a quantity field creates the trip, exactly like the button', async () => {
    seedComposition()
    const wrapper = await mountAtStepFour()

    await wrapper.get('.qty-input').trigger('keydown.enter')

    expect(orchestratorFake.createTripFromWizard).toHaveBeenCalledTimes(1)
  })
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

    // Ordered by name, not by position order, and truncated with a count at
    // PREVIEW_ROW_NAMES — two, because three wrap onto a second line at 390 px.
    expect(wrapper.get('[data-testid="wizard-preview-g1"]').text()).toBe(
      'Kamera · Makro-Objektiv +2',
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

describe('what the trip follows (FR-27.4)', () => {
  it('registers the picked templates as the trip’s sources, not the resolved composition', async () => {
    seedComposition()
    const wrapper = await mountAtStepFour('v1')

    await wrapper.get('[data-testid="wizard-create"]').trigger('click')

    const draft = orchestratorFake.createTripFromWizard.mock.calls[0]?.[0]
    // The pick, not the groups it expands to: the trip follows the Vorlage,
    // and a group added to that Vorlage later has to reach the trip through
    // it — which only works if the link is re-resolved rather than frozen.
    expect(draft?.sourceTemplateIds).toEqual(['v1'])
  })
})

describe('M3 step 3 — single items (FR-27.3)', () => {
  /**
   * Type into the picker. `ionInput` rather than setValue: `v-model` on an
   * ion-input listens for that event, and setValue does not reach a custom
   * element's value binding — the same seam the wizard's name field uses.
   */
  async function search(wrapper: Awaited<ReturnType<typeof mountAtStepThree>>, query: string) {
    await wrapper
      .get('[data-testid="wizard-item-search"]')
      .trigger('ionInput', { detail: { value: query } })
  }

  it('offers inventory matches and adds the picked one as a chip', async () => {
    seedComposition()
    item('drone', 'Drohne')
    const wrapper = await mountAtStepThree()

    await search(wrapper, 'Droh')
    const suggestion = wrapper.get('[data-testid="wizard-item-suggestion-drone"]')
    expect(suggestion.text()).toContain('Drohne')

    await suggestion.trigger('click')

    expect(wrapper.get('[data-testid="wizard-item-chips"]').text()).toContain('Drohne')
    // The count is the point: the trip now carries one more row than the
    // templates produced, without any template having said so.
    expect(wrapper.get('[data-testid="wizard-item-count"]').text()).toContain('1')
  })

  it('takes the chip back out again', async () => {
    seedComposition()
    item('drone', 'Drohne')
    const wrapper = await mountAtStepThree()
    await search(wrapper, 'Droh')
    await wrapper.get('[data-testid="wizard-item-suggestion-drone"]').trigger('click')

    await wrapper.get('[data-testid="wizard-item-chip-drone"]').trigger('click')

    expect(wrapper.find('[data-testid="wizard-item-chips"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="wizard-item-count"]').text()).toContain('0')
  })

  it('reports an item a picked template already brought, and adds nothing', async () => {
    seedComposition()
    const wrapper = await mountAtStepThree()
    await pick(wrapper, 'v1')
    const before = wrapper.get('[data-testid="wizard-item-count"]').text()

    await search(wrapper, 'Kam')
    await wrapper.get('[data-testid="wizard-item-suggestion-cam"]').trigger('click')

    const report = wrapper.get('[data-testid="wizard-item-duplicates"]')
    expect(report.text()).toContain('Kamera')
    // Reported *and* not counted: a silent no-op reads as a lost tap, and a
    // silent duplicate reads as two cameras.
    expect(wrapper.get('[data-testid="wizard-item-count"]').text()).toBe(before)
  })

  it('says so when nothing in the inventory matches', async () => {
    seedComposition()
    const wrapper = await mountAtStepThree()

    await search(wrapper, 'Schneeschuh')

    expect(wrapper.get('[data-testid="wizard-item-nomatch"]').text()).toContain('Schneeschuh')
    expect(wrapper.find('[data-testid="wizard-item-suggestions"]').exists()).toBe(false)
  })

  it('keeps a picked item out of the suggestions rather than offering it twice', async () => {
    seedComposition()
    item('drone', 'Drohne')
    const wrapper = await mountAtStepThree()
    await search(wrapper, 'Droh')
    await wrapper.get('[data-testid="wizard-item-suggestion-drone"]').trigger('click')

    await search(wrapper, 'Droh')

    expect(wrapper.find('[data-testid="wizard-item-suggestion-drone"]').exists()).toBe(false)
  })

  it('carries the picked item into the created trip, with no template claiming it', async () => {
    seedComposition()
    item('drone', 'Drohne')
    const wrapper = await mountAtStepThree()
    await search(wrapper, 'Droh')
    await wrapper.get('[data-testid="wizard-item-suggestion-drone"]').trigger('click')
    await wrapper.get('[data-testid="wizard-next"]').trigger('click')
    await wrapper.get('[data-testid="wizard-create"]').trigger('click')

    const draft = orchestratorFake.createTripFromWizard.mock.calls[0]![0] as {
      items: { name: string; source_template_id: string | null }[]
      sourceTemplateIds?: string[]
    }
    expect(draft.items.map((i) => i.name)).toEqual(['Drohne'])
    // FR-27.4 reads this provenance: a single item follows nothing, so
    // claiming a template for it would make the trip follow a lie.
    expect(draft.items[0]!.source_template_id).toBeNull()
    expect(draft.sourceTemplateIds).toEqual([])
  })
})

describe('M3 step 3 — the picker does not outlive the inventory (FR-27.3)', () => {
  it('drops the chip for an item the inventory no longer has', async () => {
    seedComposition()
    item('drone', 'Drohne')
    const wrapper = await mountAtStepThree()
    await wrapper
      .get('[data-testid="wizard-item-search"]')
      .trigger('ionInput', { detail: { value: 'Droh' } })
    await wrapper.get('[data-testid="wizard-item-suggestion-drone"]').trigger('click')
    expect(wrapper.get('[data-testid="wizard-item-chips"]').text()).toContain('Drohne')

    // Deleted on another device, mid-draft. Generation already ignores the
    // id; rendering it as a raw uuid would make the chip and the count
    // disagree about what the trip is going to contain.
    useMasterStore().applyChange({ seq: 0, table: 'items', id: 'drone', deleted: true, row: null })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="wizard-item-chips"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="wizard-item-count"]').text()).toContain('0')
  })
})
