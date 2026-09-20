// @vitest-environment jsdom
/**
 * The sheet a bulk assignment picks its account in (FR-1.9 over FR-24.9).
 *
 * Mounted directly, for the reason `BulkTagSheet.spec.ts` gives. What M9 does
 * with the `pick` is asserted in `ItemInventoryPage.spec.ts`; that „Niemand"
 * is one of the answers, and not an empty state, is asserted here.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import BulkAssigneeSheet from '../BulkAssigneeSheet.vue'
import { t } from '@/i18n'
import type { DirectoryUser } from '@/api/types'

const directory: DirectoryUser[] = [
  { user_id: 'u-sia', display_name: 'Sia' },
  { user_id: 'u-andy', display_name: 'Andy' },
]

function mountSheet(props: Partial<InstanceType<typeof BulkAssigneeSheet>['$props']> = {}) {
  return mount(BulkAssigneeSheet, {
    props: {
      isOpen: true,
      directory,
      counts: new Map([['u-sia', 2]]),
      selected: 4,
      unassigned: 1,
      ...props,
    },
    global: { stubs: { SheetModal: { template: '<div><slot /></div>' }, SheetHead: true } },
  })
}

describe('BulkAssigneeSheet — what it offers (FR-1.9, FR-24.9)', () => {
  it('names the act and how many items it would touch', () => {
    const sheet = mountSheet()
    expect(sheet.findComponent({ name: 'SheetHead' }).props('title')).toBe(
      t('items.bulkAssigneeTitle'),
    )
    expect(sheet.findComponent({ name: 'SheetHead' }).props('meta')).toBe(
      t('items.bulkSelected', { n: 4 }),
    )
  })

  it('offers every account, by name', async () => {
    const sheet = mountSheet()

    await sheet.find('[data-testid="m9-bulk-assignee-Sia"]').trigger('click')
    expect(sheet.emitted('pick')?.[0]).toEqual([{ userId: 'u-sia' }])
  })

  it('carries „Niemand" as an answer, which is the only way back', async () => {
    const sheet = mountSheet()

    await sheet.find('[data-testid="m9-bulk-assignee-nobody"]').trigger('click')
    expect(sheet.emitted('pick')?.[0]).toEqual([{ userId: null }])
  })

  it('says how many of the selected items already name each answer', () => {
    const sheet = mountSheet()

    expect(sheet.get('[data-testid="m9-bulk-assignee-Sia"]').text()).toContain(
      t('items.bulkAlreadyOn', { n: 2 }),
    )
    expect(sheet.get('[data-testid="m9-bulk-assignee-nobody"]').text()).toContain(
      t('items.bulkAlreadyOn', { n: 1 }),
    )
    // Nothing to say for an account none of them names — a zero beside a name
    // is noise, not information.
    expect(sheet.get('[data-testid="m9-bulk-assignee-Andy"]').text()).not.toContain('0')
  })

  it('lists the accounts by name rather than in the order they arrived', () => {
    const names = mountSheet()
      .findAll('[data-testid^="m9-bulk-assignee-"]')
      .map((row) => row.attributes('data-testid'))

    expect(names).toEqual([
      'm9-bulk-assignee-nobody',
      'm9-bulk-assignee-Andy',
      'm9-bulk-assignee-Sia',
    ])
  })
})
