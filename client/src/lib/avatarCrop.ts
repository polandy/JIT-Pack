/**
 * Avatar pan/zoom crop math (FR-17.13). A square viewport of `viewport`
 * display pixels maps onto the 256×256 output. The image is placed at
 * `cover` scale (shorter edge fills the viewport) times a user zoom, and
 * offset in viewport-pixel space; these helpers keep the crop consistent
 * and clamped, so the gesture component stays a thin shell around them.
 */

/** coverScale is the scale at zoom = 1: the shorter edge exactly fills
 * the square viewport (no gaps, aspect ratio preserved). */
export function coverScale(imgWidth: number, imgHeight: number, viewport: number): number {
  return viewport / Math.min(imgWidth, imgHeight)
}

/** clampOffset pins the image's top-left (one axis) so the viewport is
 * always fully covered — the displayed image length is imgLen * scale and
 * offset must stay within [viewport - displayed, 0]. */
export function clampOffset(
  offset: number,
  imgLen: number,
  scale: number,
  viewport: number,
): number {
  const min = viewport - imgLen * scale // ≤ 0 while the image covers
  return Math.min(0, Math.max(min, offset))
}

export interface SourceRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/** sourceRect converts the current scale/offset into the source-pixel
 * rectangle that fills the viewport, ready for canvas drawImage(). */
export function sourceRect(
  scale: number,
  offsetX: number,
  offsetY: number,
  viewport: number,
): SourceRect {
  const side = viewport / scale
  // `+ 0` collapses a -0 (from negating 0) to 0 for clean equality.
  return { sx: -offsetX / scale + 0, sy: -offsetY / scale + 0, sw: side, sh: side }
}
