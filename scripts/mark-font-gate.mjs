/**
 * Holds the curated mark index, the self-hosted subset and the CSS
 * `unicode-range` together (FR-28.6).
 *
 * The failure this exists for is silent and late: an entry added to
 * `itemMarks.ts` without rerunning `scripts/build-mark-font.sh` is offered by
 * the picker, stored on the item, and renders as an empty box on every device —
 * a support ticket rather than a build failure. So the index is the source of
 * truth and everything else is compared against it.
 */
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { markCodePoints } from './mark-codepoints.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSS = 'client/src/theme/typography.css'
const FONT = 'client/src/assets/fonts/noto-emoji-marks.woff2'

/** Above this the subset has stopped being a subset (NFR-4.3). The measured
 *  size at 102 entries is ~82 KB; the ceiling leaves room to grow the index
 *  without leaving room to accidentally ship the whole emoji table. */
const MAX_FONT_BYTES = 160 * 1024

function fail(message) {
  console.error(`mark-font-gate: ${message}`)
  process.exit(1)
}

const css = readFileSync(join(root, CSS), 'utf8')
const declared = /font-family:\s*'JP Marks'[\s\S]*?unicode-range:\s*([^;]+);/.exec(css)
if (!declared) fail(`no 'JP Marks' @font-face with a unicode-range in ${CSS}`)

const declaredPoints = declared[1]
  .split(',')
  .map((part) => part.trim())
  .filter(Boolean)
const expected = markCodePoints().map((cp) => `U+${cp.toString(16).toUpperCase()}`)

const missing = expected.filter((cp) => !declaredPoints.includes(cp))
const extra = declaredPoints.filter((cp) => !expected.includes(cp))
if (missing.length || extra.length) {
  fail(
    `${CSS}'s unicode-range no longer matches the curated index.\n` +
      (missing.length ? `  in the index, not in the range: ${missing.join(', ')}\n` : '') +
      (extra.length ? `  in the range, not in the index: ${extra.join(', ')}\n` : '') +
      '  rebuild both: nix-shell -p "python3.withPackages(ps: [ps.fonttools ps.brotli])" ' +
      '--run scripts/build-mark-font.sh',
  )
}

let bytes
try {
  bytes = statSync(join(root, FONT)).size
} catch {
  fail(`${FONT} is missing — run scripts/build-mark-font.sh`)
}
if (bytes > MAX_FONT_BYTES) {
  fail(`${FONT} is ${Math.round(bytes / 1024)} KB, over the ${MAX_FONT_BYTES / 1024} KB ceiling (NFR-4.3)`)
}

console.log(
  `mark-font-gate: ok — ${expected.length} code points, subset ${Math.round(bytes / 1024)} KB`,
)
