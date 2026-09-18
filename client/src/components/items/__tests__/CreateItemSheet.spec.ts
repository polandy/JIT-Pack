// @vitest-environment jsdom
/**
 * FR-24.11 — the sheet M9 creates a missing item in.
 *
 * Mounted directly, for the reason `TagFilterSheet.spec.ts` gives: Ionic
 * renders an overlay's content only once it has presented, and under jsdom it
 * never does. When M9 opens it and what M9 does with `created` is asserted in
 * `ItemInventoryPage.spec.ts`; the write itself is asserted here, because the
 * sheet makes it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import CreateItemSheet from '../CreateItemSheet.vue'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

interface Writes {
  created: string[]
  assigned: { itemId: string; tagId: string }[]
  tags: string[]
}
let writes: Writes

const orchestratorFake = {
  createMasterItem: (name: string) => {
    writes.created.push(name)
    return `new-${name}`
  },
  assignTag: (itemId: string, tagId: string) => {
    writes.assigned.push({ itemId, tagId })
    return `${itemId}-${tagId}`
  },
  createTag: (name: string) => {
    writes.tags.push(name)
    useMasterStore().applyChange({
      seq: 0,
      table: TABLE.tags,
      id: `t-${name}`,
      deleted: false,
      row: { name, sort_order: 9 },
    })
    return `t-${name}`
  },
}

function seed() {
  const masterStore = useMasterStore()
  const tag = (id: string, name: string, sort_order: number) =>
    masterStore.applyChange({
      seq: 0,
      table: TABLE.tags,
      id,
      deleted: false,
      row: { name, sort_order },
    })
  tag('t-hyg', 'Hygiene', 0)
  tag('t-camp', 'Camping', 1)
  tag('t-tech', 'Technik', 2)
  masterStore.applyChange({
    seq: 0,
    table: TABLE.items,
    id: 'i-zb',
    deleted: false,
    row: { name: 'Zahnbürste', unit: 'pcs' },
  })
}

function mountSheet(props: Partial<InstanceType<typeof CreateItemSheet>['$props']> = {}) {
  return mount(CreateItemSheet, {
    props: { isOpen: true, name: 'Stirnlampe', tagIds: [], preferredTagIds: [], ...props },
    global: {
      provide: { [ORCHESTRATOR]: orchestratorFake },
      stubs: { SheetModal: { template: '<div><slot /></div>' }, SheetHead: true },
    },
  })
}

async function typeName(sheet: ReturnType<typeof mountSheet>, value: string) {
  await sheet.get('[data-testid="create-item-name"]').trigger('ionInput', { detail: { value } })
}

/** The field's value — a property on the custom element, not an attribute. */
function nameValue(sheet: ReturnType<typeof mountSheet>): unknown {
  return (sheet.get('[data-testid="create-item-name"]').element as HTMLIonInputElement).value
}

beforeEach(() => {
  setActivePinia(createPinia())
  writes = { created: [], assigned: [], tags: [] }
  seed()
})

describe('CreateItemSheet (FR-24.11)', () => {
  it('opens with the query as the name and the filter tags already assigned', () => {
    const sheet = mountSheet({ tagIds: ['t-camp'] })

    expect(nameValue(sheet)).toBe('Stirnlampe')
    expect(sheet.find('[data-testid="create-item-tag-primary-Camping"]').exists()).toBe(true)
    expect(sheet.get('[data-testid="create-item-tag-summary"]').text()).toContain('Camping')
  })

  it('offers the tags the similar items carry ahead of the vocabulary’s own order', () => {
    const sheet = mountSheet({ preferredTagIds: ['t-tech'] })
    const offers = sheet
      .findAll('[data-testid^="create-item-tag-offer-"]')
      .map((chip) => chip.text())

    expect(offers).toEqual(['Technik', 'Hygiene', 'Camping'])
  })

  it('writes the item and then its tags, primary first — the same write M10 makes', async () => {
    const sheet = mountSheet({ tagIds: ['t-camp'] })
    await sheet.get('[data-testid="create-item-tag-offer-Technik"]').trigger('click')
    await sheet.get('[data-testid="create-item-confirm"]').trigger('click')

    expect(writes.created).toEqual(['Stirnlampe'])
    expect(writes.assigned).toEqual([
      { itemId: 'new-Stirnlampe', tagId: 't-camp' },
      { itemId: 'new-Stirnlampe', tagId: 't-tech' },
    ])
    expect(sheet.emitted('created')).toEqual([
      [{ id: 'new-Stirnlampe', name: 'Stirnlampe', open: false }],
    ])
  })

  it('asks M9 to continue in M10 from „Anlegen und öffnen"', async () => {
    const sheet = mountSheet()
    await sheet.get('[data-testid="create-item-open"]').trigger('click')

    expect(sheet.emitted('created')).toEqual([
      [{ id: 'new-Stirnlampe', name: 'Stirnlampe', open: true }],
    ])
  })

  it('answers a blank name with a hint and writes nothing (FR-24.5)', async () => {
    const sheet = mountSheet()
    await typeName(sheet, '   ')
    await sheet.get('[data-testid="create-item-confirm"]').trigger('click')

    expect(sheet.get('[data-testid="create-item-error"]').text()).toBe(
      t('items.editor.nameMissing'),
    )
    expect(writes.created).toEqual([])
    expect(sheet.emitted('created')).toBeUndefined()
  })

  it('refuses a name an item already carries, in any case, before the push could', async () => {
    const sheet = mountSheet()
    await typeName(sheet, 'zahnbürste')
    await sheet.get('[data-testid="create-item-confirm"]').trigger('click')

    expect(sheet.get('[data-testid="create-item-error"]').text()).toBe(
      t('items.editor.nameTaken', { name: 'zahnbürste' }),
    )
    expect(writes.created).toEqual([])
  })

  it('creates a typed tag nobody has and assigns it', async () => {
    const sheet = mountSheet()
    const search = sheet.get('[data-testid="create-item-tag-search"]')
    await search.trigger('ionInput', { detail: { value: 'Nachtwanderung' } })
    await sheet.get('[data-testid="create-item-tag-create"]').trigger('click')
    await flushPromises()

    expect(writes.tags).toEqual(['Nachtwanderung'])
    expect(sheet.find('[data-testid="create-item-tag-primary-Nachtwanderung"]').exists()).toBe(true)
  })

  it('starts every opening from the props, not from the last draft', async () => {
    const sheet = mountSheet({ tagIds: ['t-camp'] })
    await sheet.get('[data-testid="create-item-tag-assigned-Camping"]').trigger('click')
    await typeName(sheet, 'Anders')

    await sheet.setProps({ isOpen: false })
    await sheet.setProps({ isOpen: true, name: 'Zelt' })

    expect(nameValue(sheet)).toBe('Zelt')
    expect(sheet.find('[data-testid="create-item-tag-primary-Camping"]').exists()).toBe(true)
  })
})
