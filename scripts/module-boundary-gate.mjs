/**
 * Holds the feature-module boundary (FR-30.3, ADR-066; FR-29.9 names the same
 * rule for the planner).
 *
 * A feature module is a directory under `client/src` that owns one feature
 * end to end — store, actions, screens, specs. `shopping/` is the first,
 * `planner/` (§3.29) the second.
 * Two directions are held, both by direct import:
 *
 * 1. **A module reaches only the shared kernel** — `api/`, `sync/`, `types/`,
 *    `lib/`, `theme/`, `i18n/`, the shared components in `components/global/`,
 *    and the frame composables every screen is built on (the page head, the
 *    header's action cluster, the press-and-hold primitive, the orchestrator's
 *    injection key, the trip-screen load, the trip's identity). Never packing's
 *    views, stores, domain rules or composables, and never another module.
 * 2. **Nothing reaches into a module** except the composition root: `App.vue`
 *    through the module's public face (its `index.ts`), the router through a
 *    lazily imported page, the dev seed through the public face, and the
 *    kernel's catalogue through the module's own (`<module>/i18n/`). Packing
 *    code learns about a module's data only through kernel contracts such as
 *    `lib/shoppingSources.ts`, which the root binds.
 *
 * Specs (`__tests__/`) are exempt on both sides: an integration spec may
 * compose a module with the packing code it is wired to in production, which
 * is exactly what `App.vue` does, and that is where such a spec proves the
 * wiring. The boundary is about what ships.
 *
 * The frame composable `useTripScreen` reads the trip store for the trip
 * itself — trips are shared by every feature and still live beside the packing
 * rows. That transitive reach is known and accepted; this gate judges direct
 * imports only, like `domain-purity-gate.mjs`.
 *
 * Unlike that gate, the import scan here matches `from '…'` wherever it
 * stands, so a multi-line import (`} from '…'` on its own line) is seen.
 *
 * The kernel's catalogue (`i18n/index.ts`) names each module's own catalogue
 * (`<module>/i18n/en.ts`, `de.ts`), so the module's copy sits in its directory
 * and a diff that changes only its words stays a module-only diff (ADR-079).
 * The words are the module's like its code: **a key a module's catalogue
 * defines is read only inside that module** — a kernel file naming one would
 * reach the module through a string.
 *
 * A third rule rides along, because it is about the same list: **every e2e
 * case under `client/e2e/<module>/` is tagged `@<module>`**, in its own title
 * or in a top-level `describe` around it. CI runs a module-only diff as
 * `--grep "@<module>|@smoke"` (ADR-079), and an untagged case there would drop
 * out of that run without a sound. The same holds for a case *outside* those
 * directories that works a module's surface (`MODULE_E2E_MARKERS`): the case,
 * or the top-level `describe` around it, carries the module's tag too.
 *
 * Node built-ins only; wired into `make client` and the CI client job.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { MODULE_E2E_MARKERS, MODULES } from './modules.mjs'

/* Run from the repository root (`make ci`) or from `client/` (CI job). */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')
const SRC = resolve(root, 'client/src')
const E2E = resolve(root, 'client/e2e')

/** Kernel directories a module may import from. */
const KERNEL_DIRS = ['api', 'sync', 'types', 'lib', 'theme', 'i18n']

/** Kernel paths below a directory that is otherwise not kernel. */
const KERNEL_PATHS = [
  'components/global/',
  'composables/useHeaderTitle',
  'composables/useOrchestrator',
  'composables/useTripScreen',
  // Who the trip's people are, for naming a record (FR-30.4) — a trip-level
  // question every module asks, like the trip itself (the planner's votes).
  'composables/useTripIdentity',
  // The app bar's action cluster (G-12) — a reactive map keyed by route path,
  // no packing shape in sight; M9's own selection mode is what a module's
  // FR-30.9-style selection mode mirrors.
  'composables/useHeaderActions',
  // The app bar's selection mode (G-20) — the same keyed map as the cluster,
  // holding a count and two callbacks; no row shape of anyone's.
  'composables/useHeaderSelection',
  // Press-and-hold: pure timer logic templated over the payload, imported by
  // packing screens today but with no packing shape of its own (FR-30.9's
  // shopping-list selection is its first use outside one).
  'composables/useLongPress',
  // Lift-carry-drop, templated over the payload and the place: it knows a
  // `data-drop-target` string, never a tag or a task (FR-7.8's own gesture,
  // reused for FR-30.9's single-row retag — no packing shape either).
  'composables/useDragToGroup',
  // Selecting rows in place (ADR-075): string keys and the hold, no row shape —
  // M6 and M25 share it so a hold means one thing on both lists.
  'composables/useRowSelection',
  // What a screen carrying GPX tracks does with them (FR-29.17, FR-31.15):
  // the owner's writes are passed in, so it knows a track and no holder —
  // M28 and the packing side's M27 share it (ADR-089).
  'composables/useTrackOwner',
  // FR-29.13: a screen entered from an idea opens its creator pre-filled — the
  // route's `?fromIdea=` and the kernel's idea lookup, no packing shape; M6
  // seeds its composer through it as M25 and M27 do.
  'composables/useIdeaSeed',
  // The device's one position (FR-29.19, ADR-087), made by the composition
  // root and injected — no packing shape; the kernel's track map reads it,
  // and the planner's connection search and map (FR-29.18) do too.
  'composables/useLiveLocation',
  // The URL vocabulary — pure path builders, no views — so a module can link
  // to a screen, its own included, without reaching the route table.
  'router/paths',
  // A GPX track's rules (FR-29.17): a file, its figures and its time — no
  // idea and no excursion in sight, since both carry tracks (ADR-085).
  'domain/track',
  // Editing a track's route (FR-29.20): handles, legs and the GPX written
  // from them — a route, nothing it hangs on (ADR-088).
  'domain/route',
  // The app's one search fold (FR-24.7): umlauts either way. A module that
  // matches typed text matches it as the inventory does (FR-33.12).
  'domain/search',
]

/** A module's public face: the directory itself, i.e. its `index.ts`. */
const publicFace = (rest) => rest === '' || rest === 'index' || rest === 'index.ts'

/**
 * The composition root, and what of a module it may name: `App.vue` the
 * module's public face, the router a page it loads lazily. The dev seed
 * (`dev/`, stripped from production by `dev-code-gate.mjs`) writes sample
 * data through a module's own actions, so it may name the public face too.
 */
const ROOT_IMPORTS = {
  'App.vue': publicFace,
  'router/index.ts': (rest) => rest.endsWith('Page.vue'),
  'i18n/index.ts': (rest) => /^i18n\/(en|de)(\.ts)?$/.test(rest),
}

/** Where a module's own catalogue lives; its English half names the keys. */
const moduleCatalogue = (module) => resolve(SRC, module, 'i18n/en.ts')
const DEV_DIR = 'dev/'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') out.push(...walk(full))
    } else if (/\.(ts|vue)$/.test(entry) && !/\.spec\.ts$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Every module specifier: `from '…'`, a bare `import '…'`, and `import('…')`. */
function specifiers(source) {
  return [
    ...[...source.matchAll(/(?:^|[\s}])from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
  ]
}

/** Where a specifier lands, as a path relative to `client/src`, or null. */
function target(spec, file) {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (spec.startsWith('.')) return relative(SRC, resolve(join(file, '..'), spec))
  return null
}

/** The module a `client/src`-relative path belongs to, or null. */
function moduleOf(path) {
  const top = path.split('/')[0]
  return MODULES.includes(top) ? top : null
}

function isKernel(path) {
  return KERNEL_DIRS.includes(path.split('/')[0]) || KERNEL_PATHS.some((p) => path.startsWith(p))
}

const problems = []
const kernelSources = []
let files = 0
let moduleFiles = 0

for (const file of walk(SRC)) {
  files += 1
  const from = relative(SRC, file)
  const home = moduleOf(from)
  const source = readFileSync(file, 'utf8')
  if (home) moduleFiles += 1
  else kernelSources.push([from, source])
  for (const spec of specifiers(source)) {
    const to = target(spec, file)
    if (to === null) continue
    const into = moduleOf(to)
    if (home) {
      if (into === home || isKernel(to)) continue
      problems.push(
        `client/src/${from}: imports \`${spec}\` — a module reaches only its own directory ` +
          `and the kernel (${[...KERNEL_DIRS.map((d) => `${d}/`), ...KERNEL_PATHS].join(', ')})`,
      )
    } else if (into) {
      const rest = to.slice(into.length + 1)
      const allowed = ROOT_IMPORTS[from] ?? (from.startsWith(DEV_DIR) ? publicFace : undefined)
      if (allowed && allowed(rest)) continue
      problems.push(
        `client/src/${from}: imports \`${spec}\` — only the composition root (App.vue via ` +
          `the module's index, the router via a lazy page, i18n/index.ts via its catalogue) ` +
          `may reach into \`${into}/\``,
      )
    }
  }
}

const strayKeys = []
for (const module of MODULES) {
  let catalogue
  try {
    catalogue = readFileSync(moduleCatalogue(module), 'utf8')
  } catch {
    continue
  }
  const keys = [...catalogue.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1])
  for (const [from, source] of kernelSources) {
    for (const key of keys) {
      if (![`'${key}'`, `"${key}"`, `\`${key}\``].some((quoted) => source.includes(quoted))) continue
      strayKeys.push(
        `client/src/${from}: reads \`${key}\` from ${module}/i18n/ — a key there is the ` +
          `module's own; one the kernel reads too belongs in i18n/messages/`,
      )
    }
  }
}

/** Every `*.spec.ts` below `dir`. */
function specFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...specFiles(full))
    else if (entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

/** The titles of a spec's top-level `test(…)` and `test.describe(…)` calls. */
const TOP_LEVEL_TITLE = /^test(?:\.describe(?:\.(?:serial|parallel))?)?\(\s*(['"`])(.*?)\1/gm

const untagged = []
let moduleSpecs = 0
for (const module of MODULES) {
  let dir
  try {
    dir = resolve(E2E, module)
    statSync(dir)
  } catch {
    continue
  }
  for (const file of specFiles(dir)) {
    moduleSpecs += 1
    const titles = [...readFileSync(file, 'utf8').matchAll(TOP_LEVEL_TITLE)].map((m) => m[2])
    for (const title of titles) {
      if (title.split(/\s+/).includes(`@${module}`)) continue
      untagged.push(
        `${relative(root, file)}: \`${title}\` is not tagged \`@${module}\` — CI's ` +
          `module-only run selects the module's cases by that tag (ADR-079)`,
      )
    }
  }
}

/** A test or describe call opening on this line, and its indentation. */
const TEST_START = /^(\s*)test(?:\.describe(?:\.(?:serial|parallel))?)?\(/
const STRING = /(['"`])(.*?)\1/

/** The title of the call opening on line `i`: on that line, or the next. */
function titleAt(lines, i) {
  const rest = lines[i].replace(TEST_START, '')
  return (STRING.exec(rest) ?? STRING.exec(lines[i + 1] ?? ''))?.[2] ?? ''
}

const TOP_LEVEL_FUNCTION = /^(?:async\s+)?function\s+(\w+)/

/**
 * A spec's own top-level helper that works a module's surface is a marker
 * too: a call to it is as good as the line it wraps.
 */
function wrappers(lines, markers) {
  const out = []
  let name = null
  let hit = false
  for (const line of lines) {
    const fn = TOP_LEVEL_FUNCTION.exec(line)
    if (fn) [name, hit] = [fn[1], false]
    if (name && markers.some((re) => re.test(line))) hit = true
    if (name && line.startsWith('}')) {
      if (hit) out.push(new RegExp(`\\b${name}\\(`))
      name = null
    }
  }
  return out
}

const tagged = (title, module) => title.split(/\s+/).includes(`@${module}`)

const moduleDirs = MODULES.map((m) => resolve(E2E, m))
for (const file of specFiles(E2E)) {
  if (moduleDirs.some((d) => file.startsWith(`${d}/`))) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  for (const [module, direct] of Object.entries(MODULE_E2E_MARKERS)) {
    const markers = [...direct, ...wrappers(lines, direct)]
    const seen = new Set()
    let test = -1
    let describe = -1
    let inHelper = false
    lines.forEach((line, i) => {
      if (TOP_LEVEL_FUNCTION.test(line)) inHelper = true
      else if (inHelper && line.startsWith('}')) inHelper = false
      if (inHelper) return
      const start = TEST_START.exec(line)
      if (start) {
        test = i
        if (start[1] === '') describe = i
      }
      if (!markers.some((re) => re.test(line))) return
      const where = test < 0 ? `line ${i + 1}, before any test` : titleAt(lines, test)
      if (test >= 0 && (tagged(titleAt(lines, test), module) || tagged(titleAt(lines, describe), module))) return
      if (seen.has(where)) return
      seen.add(where)
      untagged.push(
        `${relative(root, file)}: \`${where}\` works the ${module} module's surface and is not ` +
          `tagged \`@${module}\` — CI's module-only run would skip it (ADR-079)`,
      )
    })
  }
}

/*
 * A gate that measures nothing passes silently for the rest of its life. If a
 * module moved, this says so instead of reporting ok over an empty walk.
 */
for (const module of MODULES) {
  try {
    statSync(resolve(SRC, module))
  } catch {
    console.error(`module-boundary-gate: module \`${module}\` has no directory under client/src`)
    process.exit(1)
  }
}
if (moduleFiles === 0 || moduleSpecs === 0) {
  console.error('module-boundary-gate: no module files or module e2e specs found')
  process.exit(1)
}

if (problems.length > 0) {
  console.error('module-boundary-gate: a feature module and the code around it import each other.\n')
  for (const line of [...new Set(problems)].sort()) console.error(`  ${line}`)
  console.error(
    '\nFR-30.3 / ADR-066: a module and the packing code meet only through kernel contracts ' +
      '(e.g. lib/shoppingSources.ts) that App.vue binds. Move the shared shape into the kernel, ' +
      'or pass it in from the composition root.',
  )
  process.exit(1)
}

if (strayKeys.length > 0) {
  console.error("module-boundary-gate: kernel code reads a module catalogue's key.\n")
  for (const line of strayKeys) console.error(`  ${line}`)
  process.exit(1)
}

if (untagged.length > 0) {
  console.error('module-boundary-gate: a module e2e case is missing its module tag.\n')
  for (const line of untagged) console.error(`  ${line}`)
  process.exit(1)
}

console.log(
  `module-boundary-gate: ok — ${MODULES.length} module(s), ${moduleFiles} module files, ` +
    `${files} files checked, no import across the boundary; ${moduleSpecs} module e2e spec(s) tagged`,
)
