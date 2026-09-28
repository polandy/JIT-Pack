/**
 * Pictures for the dev seed's ideas (FR-29.5): a landscape painted on a
 * canvas and encoded as the JPEG a camera would have given. Dev only, like
 * the rest of `src/dev/`.
 *
 * The colours are read off the palette at run time (invariant 9): a seed
 * that painted its own hex values would be the one place in the client with
 * a colour system of its own, and the mountains would stop matching the app
 * the day the palette moves.
 */

/** One scene: which palette tokens paint its sky, its two ranges and its water. */
interface Scene {
  sky: string
  far: string
  near: string
  sun: string
  water: boolean
}

const SCENES: readonly Scene[] = [
  { sky: '--ct-glacier', far: '--ct-lupine', near: '--ct-pine', sun: '--ct-straw', water: true },
  { sky: '--ct-larch', far: '--ct-heather', near: '--ct-moss', sun: '--ct-straw', water: false },
  { sky: '--ct-lupine', far: '--ct-overlay2', near: '--ct-pine', sun: '--ct-text', water: true },
  { sky: '--ct-alpenrose', far: '--ct-heather', near: '--ct-surface2', sun: '--ct-larch', water: false },
]

const WIDTH = 1200
const HEIGHT = 800

/** A small deterministic generator, so a scene looks the same on every seed. */
function ridge(seed: number, points: number, base: number, amplitude: number): number[] {
  let state = seed * 9301 + 49297
  return Array.from({ length: points + 1 }, () => {
    state = (state * 9301 + 49297) % 233280
    return base - (state / 233280) * amplitude
  })
}

function fillRange(ctx: CanvasRenderingContext2D, heights: number[], colour: string) {
  const step = WIDTH / (heights.length - 1)
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(0, HEIGHT)
  heights.forEach((y, i) => ctx.lineTo(i * step, y))
  ctx.lineTo(WIDTH, HEIGHT)
  ctx.closePath()
  ctx.fill()
}

/** The scene at `index` (wrapping), as a JPEG. */
export function samplePicture(index: number): Promise<Blob> {
  const scene = SCENES[index % SCENES.length]!
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim()

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('2d canvas context unavailable'))

  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.6)
  sky.addColorStop(0, token(scene.sky))
  sky.addColorStop(1, token('--ct-text'))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.fillStyle = token(scene.sun)
  ctx.beginPath()
  ctx.arc(WIDTH * (0.25 + 0.15 * index), HEIGHT * 0.22, 60, 0, Math.PI * 2)
  ctx.fill()

  fillRange(ctx, ridge(index + 1, 8, HEIGHT * 0.5, HEIGHT * 0.28), token(scene.far))
  fillRange(ctx, ridge(index + 7, 5, HEIGHT * 0.72, HEIGHT * 0.2), token(scene.near))

  if (scene.water) {
    ctx.fillStyle = token(scene.sky)
    ctx.globalAlpha = 0.75
    ctx.fillRect(0, HEIGHT * 0.78, WIDTH, HEIGHT * 0.22)
    ctx.globalAlpha = 1
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      0.85,
    ),
  )
}
