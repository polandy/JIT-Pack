/**
 * Holds the feature-module boundary (FR-30.3, ADR-066; FR-29.9 names the same
 * rule for the planner).
 *
 * A feature module is a directory under `client/src` that owns one feature
 * end to end — store, actions, screens, specs. `shopping/` is the first.
 * Two directions are held, both by direct import:
 *
 * 1. **A module reaches only the shared kernel** — `api/`, `sync/`, `types/`,
 *    `lib/`, `theme/`, `i18n/`, the shared components in `components/global/`,
 *    and the three frame composables every screen is built on (the page head,
 *    the orchestrator's injection key, the trip-screen load). Never packing's
 *    views, stores, domain rules or composables, and never another module.
 * 2. **Nothing reaches into a module** except the composition root: `App.vue`
 *    through the module's public face (its `index.ts`), the router through a
 *    lazily imported page, and the dev seed through the public face. Packing code learns about a module's data only
 *    through kernel contracts such as `lib/shoppingSources.ts`, which the root
 *    binds.
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
 * Node built-ins only; wired into `make client` and the CI client job.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/* Run from the repository root (`make ci`) or from `client/` (CI job). */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')
const SRC = resolve(root, 'client/src')

/** The feature modules — one directory each under `client/src`. */
const MODULES = ['shopping']

/** Kernel directories a module may import from. */
const KERNEL_DIRS = ['api', 'sync', 'types', 'lib', 'theme', 'i18n']

/** Kernel paths below a directory that is otherwise not kernel. */
const KERNEL_PATHS = [
  'components/global/',
  'composables/useHeaderTitle',
  'composables/useOrchestrator',
  'composables/useTripScreen',
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
}
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
let files = 0
let moduleFiles = 0

for (const file of walk(SRC)) {
  files += 1
  const from = relative(SRC, file)
  const home = moduleOf(from)
  if (home) moduleFiles += 1
  for (const spec of specifiers(readFileSync(file, 'utf8'))) {
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
          `the module's index, the router via a lazy page) may reach into \`${into}/\``,
      )
    }
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
if (moduleFiles === 0) {
  console.error('module-boundary-gate: no module files found')
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

console.log(
  `module-boundary-gate: ok — ${MODULES.length} module(s), ${moduleFiles} module files, ` +
    `${files} files checked, no import across the boundary`,
)
