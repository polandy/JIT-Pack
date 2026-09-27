import { describe, expect, it } from 'vitest'

import { writtenMeta } from '../noteFacts'

const NOW = new Date('2026-09-27T12:00:00Z')
const nameOf = (id: string | null) => (id === 'user-sia' ? 'Sia' : null)

describe('writtenMeta', () => {
  it('names the writer and when', () => {
    const meta = writtenMeta('user-sia', '2026-09-27T09:30:00Z', nameOf, NOW)
    expect(meta.startsWith('Sia · ')).toBe(true)
    expect(meta.length).toBeGreaterThan('Sia · '.length)
  })

  it('leaves out a writer the directory does not know, rather than showing an id', () => {
    const meta = writtenMeta('user-unknown', '2026-09-27T09:30:00Z', nameOf, NOW)
    expect(meta).not.toContain('user-unknown')
    expect(meta).not.toContain('·')
    expect(meta).not.toBe('')
  })

  it('says nothing for neither', () => {
    expect(writtenMeta(null, null, nameOf, NOW)).toBe('')
  })
})
