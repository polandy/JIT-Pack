// @vitest-environment jsdom
/**
 * FR-5.8: the confirmation names every cost the removal carries, and nothing
 * it does not — a sentence about notes on a row without any would teach the
 * reader to stop reading the dialog.
 */
import { describe, expect, it, afterAll, beforeEach } from 'vitest'

import { setLocale } from '@/i18n'
import { removalSentence } from '../removalLabels'

afterAll(() => setLocale('en'))
beforeEach(() => setLocale('de'))

const NOTHING = { packed: 0, notes: 0, companions: [] }

describe('removalSentence (FR-5.8)', () => {
  it('always says what removal is, and points at the skip for the other intent', () => {
    expect(removalSentence(NOTHING)).toBe(
      'Die Zeile verschwindet von der Packliste. Wenn du es bewusst zu Hause lässt, ' +
        'wähle „Nicht einpacken“.',
    )
  })

  it('names packed units, notes and companions, each once', () => {
    const sentence = removalSentence({
      packed: 2,
      notes: 3,
      companions: [{ name: 'Heringe' }, { name: 'Zeltunterlage' }],
    })
    expect(sentence).toContain('Bereits 2 gepackt.')
    expect(sentence).toContain('3 Notizen werden mitgelöscht.')
    expect(sentence).toContain('Ebenfalls nicht eingepackt: Heringe, Zeltunterlage.')
  })

  it('says nothing about a cost the row does not carry', () => {
    const sentence = removalSentence({ ...NOTHING, notes: 1 })
    expect(sentence).toContain('1 Notiz wird mitgelöscht.')
    expect(sentence).not.toContain('gepackt.')
    expect(sentence).not.toContain('Ebenfalls')
  })
})
