// @vitest-environment jsdom
/**
 * M23 — ADR-033: „nothing is hidden — every item in the inventory is visible"
 * is a claim about master rows, and the archive is the one screen a user opens
 * *because* they believe something is in it. Told that nothing is, on a cold
 * start, they would go and recreate it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import RetiredMasterPage from '../RetiredMasterPage.vue'
import { useMasterStore } from '@/stores/masterStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

import { masterDataStub } from '@/composables/__tests__/masterDataStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { presentToast } from '@/lib/toast'
import { confirmDestructive, promptText } from '@/lib/confirm'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('@/lib/toast', () => ({ presentToast: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/confirm', () => ({
  confirmDestructive: vi.fn().mockResolvedValue(true),
  promptText: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

const master = masterDataStub()
const orchestratorFake = {
  ...master,
  masterItemDeletionOutlook: vi.fn((_id: string): Record<string, unknown> => ({
    blocked: false,
    references: [],
  })),
  templateDeletionOutlook: vi.fn(() => ({ blocked: false, references: [] })),
  masterItemRestoreVerdict: vi.fn(() => null),
  restoreMasterItem: vi.fn((_id: string, _name?: string) => true),
  deleteMasterItem: vi.fn(),
}

function mountPage() {
  return mount(RetiredMasterPage, { global: { provide: { [ORCHESTRATOR]: orchestratorFake } } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  master.masterLoaded.value = true
})

describe('M23 archive — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the archive is loading rather than claiming nothing is hidden', async () => {
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m23-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="m23-empty"]').exists()).toBe(false)
    expect(page.text()).toContain(t('retired.listUnknown'))

    master.masterLoaded.value = true
    await flushPromises()

    expect(page.find('[data-testid="m23-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m23-empty"]').exists()).toBe(true)
  })

  /*
   * The note said „loading" while the two segments above it said „(0)", and a
   * reader believes the number: it looks settled in a way a sentence does not.
   * The count is the useful half once it is real — an empty tab is worth
   * naming — so this pins both ends rather than deleting it.
   */
  it('names its segments without a count until the archive is on the device', async () => {
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m23-segment-items"]').text()).toBe(t('retired.segmentItems'))
    expect(page.find('[data-testid="m23-segment-templates"]').text()).toBe(
      t('retired.segmentTemplates'),
    )

    master.masterLoaded.value = true
    await flushPromises()

    expect(page.find('[data-testid="m23-segment-items"]').text()).toBe(
      t('retired.segmentItemsCount', { n: 0 }),
    )
    expect(page.find('[data-testid="m23-segment-templates"]').text()).toBe(
      t('retired.segmentTemplatesCount', { n: 0 }),
    )
  })

  it('shows neither state once a retired row is on the device', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id: 'i1',
      deleted: false,
      row: { name: 'Sonnencreme', unit: 'pcs', retired_at: '2026-09-01T00:00:00Z' },
    })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m23-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m23-empty"]').exists()).toBe(false)
    expect(page.findAll('[data-testid="m23-row"]')).toHaveLength(1)
  })
})

describe('M23 — a row that got here by a merge (FR-24.15)', () => {
  function seedRetired(id: string, name: string, extra: Record<string, unknown> = {}) {
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id,
      deleted: false,
      row: { name, unit: 'pcs', retired_at: '2026-09-20T00:00:00Z', ...extra },
    })
  }

  it('names the item it was merged into, so its restore is not a silent duplicate', async () => {
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id: 'i-survivor',
      deleted: false,
      row: { name: 'Stirnlampe', unit: 'pcs' },
    })
    seedRetired('i-loser', 'Stirnlampe Petzl', { merged_into_id: 'i-survivor' })
    // A second retired row, hidden the ordinary way: „the line is there" would
    // otherwise be satisfied by a screen that prints it on every row.
    seedRetired('i-plain', 'Sonnencreme')

    const page = mountPage()
    await flushPromises()

    const merged = page.findAll('[data-testid="m23-row-merged"]')
    expect(merged).toHaveLength(1)
    expect(merged[0]!.text()).toContain(t('items.mergedInto', { name: 'Stirnlampe' }))
  })
})

/*
 * FR-24.3 over ADR-075: M23 selects like every other list, and a batch is the
 * single-row acts looped — including their refusals. What is asserted is which
 * rows the screen asked the orchestrator to restore or delete, and what stays
 * selected afterwards: a batch leaves behind exactly the rows it could not act
 * on, which is how the user finds the collisions.
 */
describe('M23 — several at once (FR-24.3, ADR-075)', () => {
  const REFERENCED = 'i-used'
  const TAKEN = 'i-taken'

  function seedRetired(id: string, name: string) {
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.items,
      id,
      deleted: false,
      row: { name, unit: 'pcs', retired_at: '2026-09-20T00:00:00Z' },
    })
  }

  function seedThree() {
    seedRetired('i-a', 'Sonnencreme')
    seedRetired(REFERENCED, 'Stirnlampe')
    seedRetired(TAKEN, 'Zelt')
  }

  beforeEach(() => {
    // Only REFERENCED is still used somewhere: it has no delete of its own.
    orchestratorFake.masterItemDeletionOutlook.mockImplementation((id: string) =>
      id === REFERENCED
        ? { kind: 'retire', references: 2, certain: true }
        : { kind: 'remove', references: 0, certain: true },
    )
    // An active row holds TAKEN's name by now.
    orchestratorFake.restoreMasterItem.mockImplementation((id: string) => id !== TAKEN)
  })

  type Page = ReturnType<typeof mountPage>
  const rowNamed = (page: Page, name: string) =>
    page.findAll('[data-testid="m23-row"]').find((r) => r.text().includes(name))!
  const count = (page: Page) => page.find('[data-testid="m23-select-count"]').text()

  function headerActions(): HeaderAction[] {
    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    return build()
  }

  /** A right-click on the first (the hold's twin), then taps on the rest. */
  async function pick(page: Page, ...names: string[]) {
    const [first, ...rest] = names
    await rowNamed(page, first!).trigger('contextmenu')
    // The release's own click, with no press of its own: spent on the hold.
    await rowNamed(page, first!).trigger('click')
    for (const name of rest) {
      await rowNamed(page, name).trigger('pointerdown')
      await rowNamed(page, name).trigger('click')
    }
  }

  it('a right-click starts the selection with that row, and the row buttons step aside', async () => {
    seedThree()
    const page = mountPage()
    await flushPromises()
    expect(page.findAll('[data-testid="m23-restore"]')).toHaveLength(3)
    expect(page.find('[data-testid="m23-selbar"]').exists()).toBe(false)

    await pick(page, 'Sonnencreme')

    expect(count(page)).toBe(t('selection.count', { n: 1 }))
    expect(page.findAll('[data-testid="m23-restore"]')).toHaveLength(0)
    expect(page.find('[data-testid="m23-bulkbar"]').exists()).toBe(true)
    // The gesture itself restored nothing.
    expect(orchestratorFake.restoreMasterItem).not.toHaveBeenCalled()

    await rowNamed(page, 'Zelt').trigger('pointerdown')
    await rowNamed(page, 'Zelt').trigger('click')
    expect(count(page)).toBe(t('selection.count', { n: 2 }))
  })

  it('offers the app bar entry only while there is a row to select', async () => {
    const page = mountPage()
    await flushPromises()
    expect(headerActions().map((a) => a.id)).not.toContain('m23-select')

    seedRetired('i-b', 'Kocher')
    await flushPromises()
    const select = headerActions().find((a) => a.id === 'm23-select')!
    expect(select).toBeDefined()

    select.onClick()
    await flushPromises()
    expect(count(page)).toBe(t('selection.none'))
  })

  it('restores every free name at once and keeps the colliding row selected', async () => {
    seedThree()
    const page = mountPage()
    await flushPromises()
    await pick(page, 'Sonnencreme', 'Stirnlampe', 'Zelt')

    await page.find('[data-testid="m23-bulk-restore"]').trigger('click')
    await flushPromises()

    expect(orchestratorFake.restoreMasterItem.mock.calls.map(([id]) => id).sort()).toEqual(
      ['i-a', REFERENCED, TAKEN].sort(),
    )
    // No prompt per collision: a batch never opens a queue of dialogs.
    expect(promptText).not.toHaveBeenCalled()
    expect(count(page)).toBe(t('selection.count', { n: 1 }))
    expect(rowNamed(page, 'Zelt').attributes('data-selected')).toBe('true')
    expect(vi.mocked(presentToast).mock.calls.at(-1)![0].message).toBe(
      `${t('retired.bulkRestored', { n: 2 })} ${t('retired.bulkNameTaken', { n: 1 })}`,
    )
  })

  it('a selection of one is the single-row restore, so a collision meets its prompt', async () => {
    seedThree()
    const page = mountPage()
    await flushPromises()
    await pick(page, 'Zelt')

    await page.find('[data-testid="m23-bulk-restore"]').trigger('click')
    await flushPromises()

    expect(orchestratorFake.restoreMasterItem.mock.calls.map(([id]) => id)).toEqual([TAKEN])
    expect(promptText).toHaveBeenCalledTimes(1)
    expect(vi.mocked(promptText).mock.calls[0]![0].testid).toBe('m23-name-taken')
    expect(page.find('[data-testid="m23-selbar"]').exists()).toBe(false)
  })

  it('ends the mode when every row came back', async () => {
    seedThree()
    const page = mountPage()
    await flushPromises()
    await pick(page, 'Sonnencreme', 'Stirnlampe')

    await page.find('[data-testid="m23-bulk-restore"]').trigger('click')
    await flushPromises()

    expect(page.find('[data-testid="m23-selbar"]').exists()).toBe(false)
    expect(vi.mocked(presentToast).mock.calls.at(-1)![0].message).toBe(
      t('retired.bulkRestored', { n: 2 }),
    )
  })

  it('deletes only what the single delete would, after one confirm naming both counts', async () => {
    seedThree()
    const page = mountPage()
    await flushPromises()
    // The referenced row has no delete button of its own.
    expect(page.findAll('[data-testid="m23-purge"]')).toHaveLength(2)
    await pick(page, 'Sonnencreme', 'Stirnlampe', 'Zelt')

    await page.find('[data-testid="m23-bulk-purge"]').trigger('click')
    await flushPromises()

    expect(confirmDestructive).toHaveBeenCalledTimes(1)
    const asked = vi.mocked(confirmDestructive).mock.calls[0]![0]
    expect(asked.header).toBe(t('retired.bulkPurgeTitle', { n: 2 }))
    expect(asked.message).toBe(
      `${t('retired.bulkPurgeMessage', { n: 2 })} ${t('retired.bulkPurgeKept', { n: 1 })}`,
    )
    expect(orchestratorFake.deleteMasterItem.mock.calls.map(([id]) => id).sort()).toEqual(
      ['i-a', TAKEN].sort(),
    )
    // …and stays, selected, so the user sees which one.
    expect(count(page)).toBe(t('selection.count', { n: 1 }))
    expect(rowNamed(page, 'Stirnlampe').attributes('data-selected')).toBe('true')
  })

  it('writes nothing when the confirm is declined', async () => {
    seedThree()
    vi.mocked(confirmDestructive).mockResolvedValueOnce(false)
    const page = mountPage()
    await flushPromises()
    await pick(page, 'Sonnencreme', 'Zelt')

    await page.find('[data-testid="m23-bulk-purge"]').trigger('click')
    await flushPromises()

    expect(confirmDestructive).toHaveBeenCalledTimes(1)
    expect(orchestratorFake.deleteMasterItem).not.toHaveBeenCalled()
    expect(count(page)).toBe(t('selection.count', { n: 2 }))
  })

  it('asks nothing when every selected row is still used, and says why', async () => {
    seedThree()
    const page = mountPage()
    await flushPromises()
    await pick(page, 'Stirnlampe')

    await page.find('[data-testid="m23-bulk-purge"]').trigger('click')
    await flushPromises()

    expect(confirmDestructive).not.toHaveBeenCalled()
    expect(orchestratorFake.deleteMasterItem).not.toHaveBeenCalled()
    expect(vi.mocked(presentToast).mock.calls.at(-1)![0].message).toBe(
      t('retired.bulkPurgeNone', { n: 1 }),
    )
  })

  it('a selection belongs to its segment, and switching ends it', async () => {
    seedThree()
    const page = mountPage()
    await flushPromises()
    await pick(page, 'Sonnencreme')
    expect(page.find('[data-testid="m23-selbar"]').exists()).toBe(true)

    page
      .findComponent({ name: 'IonSegment' })
      .vm.$emit('ionChange', { detail: { value: 'templates' } })
    await flushPromises()

    expect(page.find('[data-testid="m23-selbar"]').exists()).toBe(false)
  })
})
