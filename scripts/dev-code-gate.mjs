/**
 * Holds one claim the code makes about itself: the development-only surfaces —
 * the sample-data seed, the M14 fixture and the component gallery — are **gone
 * from a production build**, not merely hidden in it.
 *
 * It was false for weeks. `import.meta.env.DEV` guarded the *button*, while the
 * dynamic `import()` inside its handler stayed a live code path, so Rollup
 * emitted the chunks and every self-hosted instance shipped them. Nobody could
 * reach them, which is exactly why nobody noticed — a hidden surface and an
 * absent one look identical from the outside, and only the bundle can tell you
 * apart. Found reviewing the PR that added the second seed (2026-08-16).
 *
 * Run after `npm run build`; wired into `make client` and the CI client job.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS = 'client/dist/assets'

/** Module basenames that must not appear as a chunk, and the marker inside one. */
const DEV_ONLY = ['sampleData', 'sampleMaster', 'sampleTrip', 'reviewFixture', 'GalleryPage']

const files = readdirSync(ASSETS)

const chunks = files.filter((file) => DEV_ONLY.some((name) => file.startsWith(`${name}-`)))

/*
 * A chunk name is the cheap half; a dev module inlined into a shared chunk
 * would pass that and still ship, so look for something only the *data* says.
 *
 * Deliberately not the button's label: a `v-if` on a compile-time-false
 * constant leaves the branch's strings in the page's render function. That is
 * an inert branch of a few bytes, not a reachable surface, and chasing it would
 * cost more machinery than it saves. What must never ship is the seed itself —
 * the modules and the fifteen items, groups and templates inside them.
 *
 * The marks are seed *data*, not identifiers: minification renames functions,
 * and a name a human would pick ("Makro Fotografie") turns out to live in the
 * i18n catalogue as example copy — a fingerprint that fires on shipping product
 * text is worse than none.
 */
const FINGERPRINTS = ['Fotoreise (Beispiel)', 'Samedan Sommer (Beispiel)', 'Kartusche prüfen']
const inlined = files
  .filter((file) => file.endsWith('.js'))
  .flatMap((file) => {
    const source = readFileSync(join(ASSETS, file), 'utf8')
    return FINGERPRINTS.filter((mark) => source.includes(mark)).map((mark) => ({ file, mark }))
  })

if (chunks.length || inlined.length) {
  console.error('dev-code-gate: development-only code reached the production bundle')
  for (const file of chunks) console.error(`  chunk:   ${file}`)
  for (const { file, mark } of inlined) console.error(`  inlined: ${file} contains ${JSON.stringify(mark)}`)
  console.error('\nGuard the dynamic import with `if (!import.meta.env.DEV) return` — a `v-if`')
  console.error('on the trigger hides the surface without removing the code behind it.')
  process.exit(1)
}

console.log(`dev-code-gate: ok — no dev-only module in ${ASSETS} (${files.length} files checked)`)
