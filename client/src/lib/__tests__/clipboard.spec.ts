// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyText } from '../clipboard'

// FR-23.7: the token is readable once, and copying it is a convenience on top
// of showing it. Every path here has to answer rather than throw, because the
// surface decides what to say from the answer.

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubClipboard(writeText: (s: string) => Promise<void>) {
  vi.stubGlobal('navigator', { clipboard: { writeText } })
}

describe('copyText', () => {
  it('uses the clipboard API when the browser offers one', async () => {
    const written: string[] = []
    stubClipboard(async (s) => {
      written.push(s)
    })

    expect(await copyText('jwt.header.payload')).toBe(true)
    expect(written).toEqual(['jwt.header.payload'])
  })

  it('falls back when the clipboard API refuses, rather than reporting failure', async () => {
    stubClipboard(async () => {
      throw new Error('permission denied')
    })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })

    expect(await copyText('token')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('falls back when there is no clipboard API at all', async () => {
    vi.stubGlobal('navigator', {})
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })

    expect(await copyText('token')).toBe(true)
  })

  it('reports false when nothing worked, and leaves no element behind', async () => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(document, 'execCommand', {
      value: () => {
        throw new Error('unsupported')
      },
      configurable: true,
    })

    expect(await copyText('token')).toBe(false)
    // The textarea the fallback needs must not survive the attempt — it
    // holds the token.
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })
})
