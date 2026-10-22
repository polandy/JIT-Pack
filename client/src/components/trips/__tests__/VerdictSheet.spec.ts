// @vitest-environment jsdom
/**
 * M4's closing-pass verdict sheet (FR-9.6): one row, three choices and a
 * reason, saved in one step. The verdict *rules* (which choices a window
 * offers, the needed-quantity range) are pinned in `domain/__tests__/
 * verdict.spec.ts`; here only the sheet's own wiring — what it starts from,
 * what pressing an option does, what `save` emits.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import VerdictSheet from '../VerdictSheet.vue'
import { STATE_PACKED, STATE_SKIPPED, STATE_OPEN } from '@/types/domain'
import { VERDICT_WINDOW_AFTER, VERDICT_WINDOW_DURING, type VerdictRow } from '@/domain/verdict'

function row(overrides: Partial<VerdictRow> = {}): VerdictRow {
  return {
    state: STATE_PACKED,
    packed_count: 1,
    flag_missing: false,
    flag_unused: false,
    needed_quantity: null,
    ...overrides,
  }
}

function mountSheet(props: Partial<InstanceType<typeof VerdictSheet>['$props']> = {}) {
  return mount(VerdictSheet, {
    props: {
      isOpen: true,
      itemName: 'Zelt',
      row: row(),
      window: VERDICT_WINDOW_AFTER,
      ...props,
    },
    global: {
      // SheetModal's own IonModal plays an entry animation nothing here
      // waits on; a plain slot stands in for it, like every other sheet
      // spec in this directory (e.g. CreateItemSheet.spec.ts).
      stubs: { SheetModal: { template: '<div><slot /></div>' } },
    },
  })
}

describe('VerdictSheet (FR-9.6)', () => {
  it('names the row in the sheet head', () => {
    const wrapper = mountSheet()
    expect(wrapper.get('[data-testid="m4-verdict-sheet-title"]').text()).toBe('Zelt')
  })

  it('offers only the choices the window and the row carry', () => {
    // A skipped row offers missing (it stayed home) but never unused or
    // fewer — there is nothing packed to have been unnecessary or too much.
    const wrapper = mountSheet({ row: row({ state: STATE_SKIPPED, packed_count: 0 }) })

    expect(wrapper.find('[data-testid="m4-verdict-missing"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="m4-verdict-unused"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m4-verdict-fewer"]').exists()).toBe(false)
  })

  it('offers fewer once two or more were packed, with the stepper under it', async () => {
    const wrapper = mountSheet({ row: row({ packed_count: 3 }) })

    expect(wrapper.find('[data-testid="m4-verdict-needed"]').exists()).toBe(false)

    await wrapper.get('[data-testid="m4-verdict-fewer"]').trigger('click')

    expect(wrapper.find('[data-testid="m4-verdict-needed"]').exists()).toBe(true)
  })

  it('starts from the verdict the row already carries, not blank', () => {
    const wrapper = mountSheet({ row: row({ flag_unused: true }) })

    expect(wrapper.get('[data-testid="m4-verdict-unused"]').classes()).toContain('picked')
  })

  it('saves the picked verdict, the needed count and the typed reason in one step', async () => {
    const wrapper = mountSheet({ row: row({ packed_count: 4 }) })

    await wrapper.get('[data-testid="m4-verdict-fewer"]').trigger('click')
    await wrapper.get('[data-testid="m4-verdict-why"]').setValue('Zelt vom Nachbarn geliehen')
    await wrapper.get('[data-testid="m4-verdict-save"]').trigger('click')

    // `fewer` defaults the stepper to the top of its range (`pick`'s own
    // rule) until the reader moves it, so 3 of 4 — one surplus — is what a
    // save with no stepper interaction commits.
    expect(wrapper.emitted('save')).toEqual([['fewer', 3, 'Zelt vom Nachbarn geliehen']])
  })

  it('clears a carried verdict rather than saving it back unchanged', async () => {
    const wrapper = mountSheet({ row: row({ flag_missing: true }) })

    await wrapper.get('[data-testid="m4-verdict-clear"]').trigger('click')
    await wrapper.get('[data-testid="m4-verdict-save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([[null, undefined, '']])
  })

  it('starts over on every open, so a dismissed reason never leaks onto the next row', async () => {
    const wrapper = mountSheet({ isOpen: false, row: row({ packed_count: 1 }) })
    await wrapper.setProps({ isOpen: true })
    await wrapper.get('[data-testid="m4-verdict-why"]').setValue('stays open')

    await wrapper.setProps({ isOpen: false })
    await wrapper.setProps({ isOpen: true, row: row({ packed_count: 1 }) })

    expect(
      (wrapper.get('[data-testid="m4-verdict-why"]').element as HTMLTextAreaElement).value,
    ).toBe('')
  })

  it('offers missing while the trip still runs, for a row that never packed — only the window decides', () => {
    // 'after' (this file's default elsewhere) withholds *missing* from a row
    // that is neither skipped nor already carrying it; 'during' does not —
    // the sheet defers entirely to `verdictChoices`, which this pins at the
    // sheet's own call site rather than only in `domain/__tests__/verdict.spec.ts`.
    const openRow = row({ state: STATE_OPEN, packed_count: 0 })
    const after = mountSheet({ window: VERDICT_WINDOW_AFTER, row: openRow })
    const during = mountSheet({ window: VERDICT_WINDOW_DURING, row: openRow })

    expect(after.find('[data-testid="m4-verdict-missing"]').exists()).toBe(false)
    expect(during.find('[data-testid="m4-verdict-missing"]').exists()).toBe(true)
  })
})
