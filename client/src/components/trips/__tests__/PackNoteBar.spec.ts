// @vitest-environment jsdom
/**
 * FR-25.33: the pack snackbar's *Notiz*, turned into a one-line field — the
 * snackbar's sentence and undo above it, the note below, Enter to keep it.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { t } from '@/i18n'

import PackNoteBar from '../PackNoteBar.vue'

function mountBar(current: string | null = null) {
  return mount(PackNoteBar, {
    props: { message: 'Lange Hose gepackt', current },
    attachTo: document.body,
  })
}

describe('PackNoteBar (FR-25.33)', () => {
  it("keeps the snackbar's sentence and its undo, and opens on the note as it stands", () => {
    const bar = mountBar('die graue')

    expect(bar.text()).toContain('Lange Hose gepackt')
    expect(bar.get('[data-testid="m4-pack-note-undo"]').text()).toBe(t('packing.undo'))
    const input = bar.get('[data-testid="m4-pack-note-input"]').element as HTMLInputElement
    expect(input.value).toBe('die graue')
    expect(document.activeElement).toBe(input)
    bar.unmount()
  })

  it('saves what was typed on Enter', async () => {
    const bar = mountBar()

    await bar.get('[data-testid="m4-pack-note-input"]').setValue('Jeans')
    await bar.get('[data-testid="m4-pack-note-input"]').trigger('keydown', { key: 'Enter' })

    expect(bar.emitted('save')).toEqual([['Jeans']])
    bar.unmount()
  })

  it('closes without a write when the note stored would be the note there is', async () => {
    const bar = mountBar('Jeans')

    await bar.get('[data-testid="m4-pack-note-input"]').setValue(' Jeans ')
    await bar.get('[data-testid="m4-pack-note-input"]').trigger('keydown', { key: 'Enter' })

    expect(bar.emitted('save')).toBeUndefined()
    expect(bar.emitted('close')).toHaveLength(1)
    bar.unmount()
  })

  it('emptying the field clears the note — blank is a save, not a no-op', async () => {
    const bar = mountBar('Jeans')

    await bar.get('[data-testid="m4-pack-note-input"]').setValue('')
    await bar.get('[data-testid="m4-pack-note-input"]').trigger('keydown', { key: 'Enter' })

    expect(bar.emitted('save')).toEqual([['']])
    bar.unmount()
  })

  it('Escape leaves without saving', async () => {
    const bar = mountBar()

    await bar.get('[data-testid="m4-pack-note-input"]').setValue('Jeans')
    await bar.get('[data-testid="m4-pack-note-input"]').trigger('keydown', { key: 'Escape' })

    expect(bar.emitted('save')).toBeUndefined()
    expect(bar.emitted('close')).toHaveLength(1)
    bar.unmount()
  })

  it("stops the field at the column's 60 characters and counts toward them", async () => {
    const bar = mountBar()
    const input = bar.get('[data-testid="m4-pack-note-input"]')

    await input.setValue('Jeans')

    expect(input.attributes('maxlength')).toBe('60')
    expect(bar.get('[data-testid="m4-pack-note-count"]').text()).toBe(
      t('packing.packNoteCount', { n: 5, max: 60 }),
    )
    bar.unmount()
  })

  it('offers the undo, saving nothing on the way', async () => {
    const bar = mountBar()
    await bar.get('[data-testid="m4-pack-note-input"]').setValue('Jeans')

    await bar.get('[data-testid="m4-pack-note-undo"]').trigger('click')

    expect(bar.emitted('undo')).toHaveLength(1)
    expect(bar.emitted('save')).toBeUndefined()
    bar.unmount()
  })
})
