import { describe, it, expect } from 'vitest'
import { coverScale, clampOffset, sourceRect } from '../avatarCrop'

// FR-17.13 avatar crop math: pan/zoom over a square viewport that maps to
// the 256×256 output. Kept pure so the gesture component stays a thin shell.

describe('coverScale', () => {
  it('scales the shorter edge to exactly fill the viewport', () => {
    // Portrait 400×800 into a 200 viewport → shorter edge (400) fills it.
    expect(coverScale(400, 800, 200)).toBe(0.5)
  })

  it('handles landscape (shorter edge is the height)', () => {
    expect(coverScale(1000, 500, 200)).toBe(0.4)
  })
})

describe('clampOffset', () => {
  it('pins a just-covering image so it cannot leave a gap', () => {
    // 400px image at scale 0.5 = 200px displayed, viewport 200 → no slack.
    expect(clampOffset(30, 400, 0.5, 200)).toBe(0)
    expect(clampOffset(-30, 400, 0.5, 200)).toBe(0)
  })

  it('allows panning within the slack when zoomed in', () => {
    // scale 1.0 → 400px displayed in a 200 viewport → offset in [-200, 0].
    expect(clampOffset(-50, 400, 1.0, 200)).toBe(-50)
    expect(clampOffset(-9999, 400, 1.0, 200)).toBe(-200)
    expect(clampOffset(50, 400, 1.0, 200)).toBe(0)
  })
})

describe('sourceRect', () => {
  it('maps the viewport back to the source pixels to draw', () => {
    // scale 1.0, panned left by 50 viewport px → source starts at x=50.
    expect(sourceRect(1.0, -50, 0, 200)).toEqual({ sx: 50, sy: 0, sw: 200, sh: 200 })
  })

  it('a smaller scale reads a larger source window', () => {
    expect(sourceRect(0.5, 0, 0, 200)).toEqual({ sx: 0, sy: 0, sw: 400, sh: 400 })
  })
})
