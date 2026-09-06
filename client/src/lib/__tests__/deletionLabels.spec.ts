// @vitest-environment jsdom
/**
 * FR-24.3/ADR-032: which of the two deletions a surface announces before the
 * user confirms. The rule was written out at four call sites and asserted at
 * none of them — only the `kind` behind it (`masterDeletion.spec.ts`) had a
 * test, and `kind` is the half that does *not* consult `certain`.
 */
import { describe, expect, it, afterAll } from 'vitest'

import { setLocale } from '@/i18n'
import { DELETION_REMOVE, DELETION_RETIRE } from '@/domain/masterDeletion'
import {
  DELETION_SUBJECT_ITEM,
  DELETION_SUBJECT_TEMPLATE,
  deletionOutlookKey,
  deletionSentence,
} from '../deletionLabels'

afterAll(() => setLocale('en'))

describe('deletionOutlookKey (FR-24.3)', () => {
  it('says the row is kept when something still resolves against it', () => {
    expect(
      deletionOutlookKey(DELETION_SUBJECT_ITEM, { kind: DELETION_RETIRE, certain: true }),
    ).toBe('items.editor.deleteRetire')
  })

  it('promises a real removal only where this device can see every trip', () => {
    const outlook = { kind: DELETION_REMOVE, certain: true } as const
    expect(deletionOutlookKey(DELETION_SUBJECT_ITEM, outlook)).toBe('items.editor.deleteRemove')
  })

  it('hedges the removal where trip partitions may be missing (ADR-032)', () => {
    const outlook = { kind: DELETION_REMOVE, certain: false } as const
    expect(deletionOutlookKey(DELETION_SUBJECT_ITEM, outlook)).toBe(
      'items.editor.deleteRemoveMaybe',
    )
  })

  it('does not hedge a retire, which one reference already settles', () => {
    expect(
      deletionOutlookKey(DELETION_SUBJECT_ITEM, { kind: DELETION_RETIRE, certain: false }),
    ).toBe('items.editor.deleteRetire')
  })

  it.each([
    [DELETION_RETIRE, true, 'templates.deleteRetire'],
    [DELETION_REMOVE, true, 'templates.deleteRemove'],
    [DELETION_REMOVE, false, 'templates.deleteRemoveMaybe'],
  ] as const)('words a Vorlage from its own family (%s, certain=%s)', (kind, certain, key) => {
    expect(deletionOutlookKey(DELETION_SUBJECT_TEMPLATE, { kind, certain })).toBe(key)
  })
})

describe('deletionSentence', () => {
  it('renders the item sentence in the active locale', () => {
    const outlook = { kind: DELETION_RETIRE, certain: true } as const
    setLocale('en')
    expect(deletionSentence(DELETION_SUBJECT_ITEM, outlook)).toContain('hidden, not removed')
    setLocale('de')
    expect(deletionSentence(DELETION_SUBJECT_ITEM, outlook)).toContain('ausgeblendet')
  })

  it('words the Vorlage differently from the item — it is a different reason', () => {
    setLocale('en')
    const outlook = { kind: DELETION_RETIRE, certain: true } as const
    expect(deletionSentence(DELETION_SUBJECT_TEMPLATE, outlook)).not.toBe(
      deletionSentence(DELETION_SUBJECT_ITEM, outlook),
    )
  })
})
