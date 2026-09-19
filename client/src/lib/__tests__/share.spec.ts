// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SHARE_MEDIA_TYPE, canShareFile, shareFile, shareableFile } from '../share'

// FR-18.2: a Vorlage is shared through the device's share sheet. The action is
// offered only where the browser can share the file, and dismissing the sheet
// is not reported as a failure.

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shareableFile', () => {
  it('travels as plain text so Chrome will share it, keeping .yaml in the name', async () => {
    const file = shareableFile('kind: template\n', 'Makro')
    expect(file.name).toBe('Makro.yaml.txt')
    expect(file.type).toBe(SHARE_MEDIA_TYPE)
    expect(await file.text()).toBe('kind: template\n')
  })
})

describe('canShareFile', () => {
  const file = shareableFile('x', 'x')

  it('is true only when the browser says it can share files', () => {
    vi.stubGlobal('navigator', { canShare: () => true })
    expect(canShareFile(file)).toBe(true)
    vi.stubGlobal('navigator', { canShare: () => false })
    expect(canShareFile(file)).toBe(false)
  })

  it('is false without Web Share at all', () => {
    vi.stubGlobal('navigator', {})
    expect(canShareFile(file)).toBe(false)
  })

  it('is false when canShare throws', () => {
    vi.stubGlobal('navigator', {
      canShare: () => {
        throw new TypeError('bad data')
      },
    })
    expect(canShareFile(file)).toBe(false)
  })
})

describe('shareFile', () => {
  const file = shareableFile('x', 'Makro')

  it('hands the file and title to the share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    expect(await shareFile(file, 'Makro')).toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Makro' })
  })

  it('reports a dismissed sheet as cancelled, not failed', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new DOMException('dismissed', 'AbortError')),
    })
    expect(await shareFile(file, 'Makro')).toBe('cancelled')
  })

  it('reports any other rejection as failed', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
    })
    expect(await shareFile(file, 'Makro')).toBe('failed')
  })
})
