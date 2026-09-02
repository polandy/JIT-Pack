// @vitest-environment jsdom
/**
 * U-4 (design review 2026-09-02). The dialog's protocol is what is under
 * test: which role counts as a yes, that the caller is told about a cancel,
 * and that a prompt returning `false` keeps the alert open with the typed
 * text — the rule that saves a rename from being thrown away, and the one
 * that was written three different ways before this module existed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { confirmAction, confirmDestructive, promptText } from '@/lib/confirm'

interface CreatedAlert {
  header?: string
  message?: string
  buttons: { text: string; role?: string; handler?: (values: unknown) => unknown }[]
  inputs?: { name: string; value?: string; attributes?: Record<string, string> }[]
}

const created: CreatedAlert[] = []
/** The role the fake alert reports; a cancel is what Ionic sends on dismiss. */
let dismissRole = 'cancel'
const setAttribute = vi.fn()

vi.mock('@ionic/vue', () => ({
  alertController: {
    create: (options: CreatedAlert) => {
      created.push(options)
      return Promise.resolve({
        present: () => Promise.resolve(),
        onDidDismiss: () => Promise.resolve({ role: dismissRole }),
        setAttribute,
      })
    },
  },
}))

beforeEach(() => {
  created.length = 0
  dismissRole = 'cancel'
  setAttribute.mockClear()
})

/** The confirming button of the alert that was created last. */
function confirmButton() {
  const buttons = created[created.length - 1]!.buttons
  return buttons[buttons.length - 1]!
}

describe('confirmDestructive', () => {
  it('resolves true only when the destructive button was chosen', async () => {
    dismissRole = 'destructive'
    await expect(confirmDestructive({ confirmLabel: 'Delete' })).resolves.toBe(true)
  })

  it('resolves false on a cancel, so the caller does nothing', async () => {
    dismissRole = 'cancel'
    await expect(confirmDestructive({ confirmLabel: 'Delete' })).resolves.toBe(false)
  })

  it('does not accept a plain confirm as a destructive yes', async () => {
    // The two roles are the difference between "take over" and "delete";
    // reading either as a yes would make the distinction decorative.
    dismissRole = 'confirm'
    await expect(confirmDestructive({ confirmLabel: 'Delete' })).resolves.toBe(false)
  })

  it('offers a cancel beside the named action, never an OK (G-16)', async () => {
    await confirmDestructive({ header: 'Trip?', message: 'Gone.', confirmLabel: 'Delete' })
    const alert = created[0]!
    expect(alert.header).toBe('Trip?')
    expect(alert.message).toBe('Gone.')
    expect(alert.buttons.map((b) => b.role)).toEqual(['cancel', 'destructive'])
    expect(confirmButton().text).toBe('Delete')
  })

  it('puts a testid on the element only when one is asked for', async () => {
    await confirmDestructive({ confirmLabel: 'Delete' })
    expect(setAttribute).not.toHaveBeenCalled()
    await confirmDestructive({ confirmLabel: 'Delete', testid: 'm23-purge-confirm' })
    expect(setAttribute).toHaveBeenCalledWith('data-testid', 'm23-purge-confirm')
  })
})

describe('confirmAction', () => {
  it('asks with the confirm role, which is not painted as a deletion', async () => {
    dismissRole = 'confirm'
    await expect(confirmAction({ confirmLabel: 'Take over' })).resolves.toBe(true)
    expect(created[0]!.buttons.map((b) => b.role)).toEqual(['cancel', 'confirm'])
  })
})

describe('promptText', () => {
  it('opens on the current value and labels the field for a screen reader', async () => {
    await promptText({ value: 'Sommer', confirmLabel: 'Save', onConfirm: () => true })
    expect(created[0]!.inputs).toEqual([
      {
        name: 'name',
        value: 'Sommer',
        placeholder: undefined,
        attributes: { 'aria-label': 'name' },
      },
    ])
  })

  it('hands the answer over trimmed', async () => {
    const onConfirm = vi.fn(() => true)
    await promptText({ value: 'Sommer', confirmLabel: 'Save', onConfirm })
    await confirmButton().handler!({ name: '  Winter  ' })
    expect(onConfirm).toHaveBeenCalledWith('Winter')
  })

  it('hands over an empty string when the field was cleared', async () => {
    const onConfirm = vi.fn(() => false)
    await promptText({ value: 'Sommer', confirmLabel: 'Save', onConfirm })
    await confirmButton().handler!({})
    expect(onConfirm).toHaveBeenCalledWith('')
  })

  it('keeps the alert open when the answer is refused', async () => {
    // Ionic reads `false` as "do not dismiss": the typed name survives.
    await promptText({ value: 'Sommer', confirmLabel: 'Save', onConfirm: () => false })
    await expect(confirmButton().handler!({ name: 'Winter' })).resolves.toBe(false)
  })

  it('closes when the handler says nothing, the way a no-op edit does', async () => {
    await promptText({ value: 'Sommer', confirmLabel: 'Save', onConfirm: () => undefined })
    await expect(confirmButton().handler!({ name: 'Sommer' })).resolves.toBe(true)
  })

  it('waits for an async answer before deciding to close', async () => {
    await promptText({
      value: 'Sommer',
      confirmLabel: 'Save',
      onConfirm: () => Promise.resolve(false),
    })
    await expect(confirmButton().handler!({ name: 'Winter' })).resolves.toBe(false)
  })
})
