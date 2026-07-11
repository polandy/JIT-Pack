/**
 * Client-side image optimization (Addendum 3.22, FR-22.2/FR-22.3).
 *
 * The user only picks a source photo; everything below — downsampling to a
 * <=1024 px longer edge, JPEG re-encoding, and the iterative quality/
 * dimension backoff to land under the 150 KB cap — happens on-device with
 * no dialog. This generalizes the fixed 256x256 avatar path (FR-17.13):
 * an item photo keeps its aspect ratio (a reference image, not an identity
 * crop) and needs a loop because real-world photos vary too much for a
 * single fixed quality to reliably clear the cap.
 */

/** Encoder produces a JPEG blob at the given dimensions and quality. */
export type Encoder = (width: number, height: number, quality: number) => Promise<Blob>

export interface OptimizeOptions {
  /** FR-22.3 longer-edge cap in pixels. */
  maxEdge?: number
  /** FR-22.4 hard byte cap. */
  maxBytes?: number
  /** FR-22.3 starting JPEG quality. */
  startQuality?: number
  /** Floor before the loop shrinks dimensions instead. */
  minQuality?: number
  /** Quality decrement per attempt. */
  qualityStep?: number
  /** Test/telemetry hook: called for every encode attempt. */
  onStep?: (width: number, height: number, quality: number, bytes: number) => void
}

const DEFAULTS = {
  maxEdge: 1024,
  maxBytes: 150 * 1024,
  startQuality: 0.82,
  minQuality: 0.4,
  qualityStep: 0.1,
}

/** fitDimensions scales (w,h) so the longer edge is at most maxEdge,
 * preserving aspect ratio; images already within the cap are returned
 * unchanged (FR-22.3: no upscaling, no crop). */
export function fitDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longer = Math.max(width, height)
  if (longer <= maxEdge) return { width, height }
  const scale = maxEdge / longer
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * backoffEncode runs the FR-22.3 loop against an injected encoder (the
 * real one is canvas-backed; tests supply a fake). It steps quality down
 * from startQuality to minQuality; if the smallest quality still exceeds
 * maxBytes it shrinks the dimensions by 15 % and repeats. It always
 * returns a blob — the smallest it produced — so the caller lands under
 * the cap in every realistic case and, in the pathological one, still has
 * something to upload (the server's CHECK is the final backstop).
 */
export async function backoffEncode(
  srcWidth: number,
  srcHeight: number,
  encode: Encoder,
  options: OptimizeOptions = {},
): Promise<Blob> {
  const opt = { ...DEFAULTS, ...options }
  let { width, height } = fitDimensions(srcWidth, srcHeight, opt.maxEdge)
  let smallest: Blob | null = null

  // Bounded: dimensions shrink by 15 % each round, so ~30 rounds reach a
  // handful of pixels — far more than any real photo needs.
  for (let round = 0; round < 40; round++) {
    for (let q = opt.startQuality; q >= opt.minQuality - 1e-9; q -= opt.qualityStep) {
      const quality = Math.round(q * 100) / 100
      const blob = await encode(width, height, quality)
      opt.onStep?.(width, height, quality, blob.size)
      if (!smallest || blob.size < smallest.size) smallest = blob
      if (blob.size <= opt.maxBytes) return blob
    }
    if (width <= 32 || height <= 32) break
    width = Math.max(1, Math.round(width * 0.85))
    height = Math.max(1, Math.round(height * 0.85))
  }
  // Never landed under the cap (only with a degenerate encoder): return
  // the smallest attempt rather than throw.
  return smallest ?? encode(width, height, opt.minQuality)
}

/** canvasEncoder draws the source bitmap onto an offscreen canvas at the
 * requested size and re-encodes as JPEG — the browser-native path used in
 * production (mirrors the avatar toBlob technique). */
export function canvasEncoder(bitmap: ImageBitmap): Encoder {
  return (width, height, quality) =>
    new Promise<Blob>((resolve, reject) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('2d canvas context unavailable'))
        return
      }
      ctx.drawImage(bitmap, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        quality,
      )
    })
}

/** optimizeItemImage is the production entry point: decode the picked
 * file, then run the FR-22.3 backoff to a <=150 KB JPEG. */
export async function optimizeItemImage(file: Blob, options: OptimizeOptions = {}): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    return await backoffEncode(bitmap.width, bitmap.height, canvasEncoder(bitmap), options)
  } finally {
    bitmap.close()
  }
}
