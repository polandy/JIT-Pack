import { describe, it, expect } from 'vitest'
import { fitDimensions, backoffEncode } from '../imageResize'

// FR-22.3: fit the longer edge to <=1024 without cropping, then step
// quality (and, if needed, dimension) down until the JPEG is <=150 KB.

describe('fitDimensions', () => {
  it('leaves images already within the cap untouched', () => {
    expect(fitDimensions(800, 600, 1024)).toEqual({ width: 800, height: 600 })
  })

  it('scales the longer edge down to the cap, preserving aspect ratio', () => {
    expect(fitDimensions(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 })
  })

  it('handles portrait orientation (height is the longer edge)', () => {
    expect(fitDimensions(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 })
  })
})

describe('backoffEncode', () => {
  // Fake encoder: bytes scale with pixel count and quality, so lowering
  // either reduces size — the same monotonicity a real JPEG encoder has.
  const fakeEncoder =
    (bytesPerPixelAtQ1: number) => (width: number, height: number, quality: number) =>
      Promise.resolve(
        new Blob([new Uint8Array(Math.round(width * height * bytesPerPixelAtQ1 * quality))]),
      )

  it('returns the first encode when it is already under the cap', async () => {
    // 800*600*0.1*0.82 ≈ 38 KB — first try wins.
    const blob = await backoffEncode(800, 600, fakeEncoder(0.1), { maxBytes: 150 * 1024 })
    expect(blob.size).toBeLessThanOrEqual(150 * 1024)
  })

  it('steps quality down until under the cap', async () => {
    // At q=0.82 this is ~189 KB (over); a lower quality lands under.
    const blob = await backoffEncode(1024, 768, fakeEncoder(0.3), { maxBytes: 150 * 1024 })
    expect(blob.size).toBeLessThanOrEqual(150 * 1024)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('shrinks dimensions when quality alone cannot clear the cap', async () => {
    // So heavy that even min quality at full size is over — must downscale.
    const blob = await backoffEncode(1024, 1024, fakeEncoder(0.6), { maxBytes: 150 * 1024 })
    expect(blob.size).toBeLessThanOrEqual(150 * 1024)
  })

  it('records how the source was optimized via onStep', async () => {
    const qualities: number[] = []
    await backoffEncode(1024, 768, fakeEncoder(0.3), {
      maxBytes: 150 * 1024,
      onStep: (_, __, q) => qualities.push(q),
    })
    // First attempt is the highest quality, later attempts are lower.
    expect(qualities.length).toBeGreaterThan(1)
    expect(qualities[0]!).toBeGreaterThan(qualities[qualities.length - 1]!)
  })
})
