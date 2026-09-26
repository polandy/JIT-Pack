// @vitest-environment jsdom
/**
 * FR-7.7: what a task says about itself — who wrote it and when, who ticked
 * it off and when.
 *
 * The cases worth pinning are the ones where a fact is *missing*, because
 * that is where a stamp goes wrong: Local Mode has nobody to name, and a
 * sentence that filled the gap with a placeholder would be claiming something.
 *
 * jsdom because the catalogue reads `localStorage` for the locale.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { setLocale } from '@/i18n'
import { nameFrom } from '@/lib/rowFacts'
import { createdStampText, resolvedStampText } from '@/lib/taskFacts'

const NOW = new Date('2026-09-21T18:00:00')

const directory = [
  { user_id: 'u-andy', display_name: 'Andy' },
  { user_id: 'u-sia', display_name: 'Sia' },
]
const nameOf = (userId: string | null) => nameFrom(directory, userId)

const task = (over: Partial<Parameters<typeof createdStampText>[0]> = {}) => ({
  created_at: '2026-09-21T14:32:00',
  author_id: 'u-andy',
  resolved_at: null,
  resolved_by_user_id: null,
  ...over,
})

describe('createdStampText / resolvedStampText (FR-7.7)', () => {
  beforeEach(() => {
    setLocale('de')
  })

  it('names the person and the moment', () => {
    expect(createdStampText(task(), nameOf, NOW)).toBe('erstellt von Andy · heute 14:32')
  })

  it('states the moment alone where nobody can be named (G-8)', () => {
    expect(createdStampText(task({ author_id: 'u-gone' }), nameOf, NOW)).toBe(
      'erstellt · heute 14:32',
    )
  })

  it('says nothing at all about a task that carries neither', () => {
    expect(createdStampText(task({ created_at: null, author_id: null }), nameOf, NOW)).toBeNull()
  })

  it('is silent about a resolution that has not happened', () => {
    expect(resolvedStampText(task(), nameOf, NOW)).toBeNull()
  })

  it('names who finished it and when', () => {
    expect(
      resolvedStampText(
        task({ resolved_at: '2026-09-20T09:15:00', resolved_by_user_id: 'u-sia' }),
        nameOf,
        NOW,
      ),
    ).toBe('erledigt von Sia · gestern 09:15')
  })

  /*
   * The one shape Local Mode produces: the client named the tap, and the
   * server that would have stamped the person does not exist. The line keeps
   * the half it has.
   */
  it('keeps the moment where a resolution has no person behind it', () => {
    expect(resolvedStampText(task({ resolved_at: '2026-09-21T09:15:00' }), nameOf, NOW)).toBe(
      'erledigt · heute 09:15',
    )
  })
})
