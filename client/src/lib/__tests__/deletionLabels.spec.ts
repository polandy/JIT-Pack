// @vitest-environment jsdom
/**
 * FR-24.3/ADR-032: which of the two deletions a surface announces before the
 * user confirms. The rule was written out at four call sites and asserted at
 * none of them — only the `kind` behind it (`masterDeletion.spec.ts`) had a
 * test, and `kind` is the half that does *not* consult `certain`.
 */
import { describe, expect, it, afterAll, beforeEach } from 'vitest'

import { setLocale, t } from '@/i18n'
import { DELETION_REMOVE, DELETION_RETIRE } from '@/domain/masterDeletion'
import {
  DELETION_SUBJECT_ITEM,
  DELETION_SUBJECT_TEMPLATE,
  bulkRetireSentence,
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

describe('bulkRetireSentence (FR-24.9)', () => {
  // Pinned rather than inherited: the cases above switch the locale, and the
  // wording assertion below reads English.
  beforeEach(() => setLocale('en'))

  it('names only the act that applies when the batch is all of one kind', () => {
    // „0 werden versteckt, 4 werden entfernt" is a sentence that reads as a
    // bug, and the two pure cases are the common ones.
    expect(bulkRetireSentence(3, 0)).toBe(t('items.bulkRetireAllHidden', { n: 3 }))
    expect(bulkRetireSentence(0, 4)).toBe(t('items.bulkRetireAllRemoved', { n: 4 }))
  })

  it('names both where the selection spans both acts', () => {
    const mixed = bulkRetireSentence(1, 2)

    expect(mixed).toBe(t('items.bulkRetireMixed', { hidden: 1, removed: 2 }))
    // Both numbers are in it: a batch that reports one of them is the half
    // that surprises somebody.
    expect(mixed).toContain('1')
    expect(mixed).toContain('2')
  })

  it('says which half can be taken back, in every form', () => {
    for (const sentence of [
      bulkRetireSentence(3, 0),
      bulkRetireSentence(0, 4),
      bulkRetireSentence(1, 2),
    ]) {
      expect(sentence.toLowerCase()).toContain('undone')
    }
  })
})
