/**
 * Holds the client's layer order (ADR-096): every file under `client/src`
 * sits in one layer, named by its path, and imports only from its own layer
 * or the ones before it.
 *
 * The two older gates each hold one edge of this table: `domain-purity-gate.mjs`
 * the bottom (a rule reads only the vocabulary), `module-boundary-gate.mjs` the
 * top (a feature module reaches only the kernel). Between them nothing was
 * held, and that is where the inversions ADR-096 moved out of the way had
 * grown — a row codec in `composables/` read by `sync/`, a reactive helper in
 * `lib/`. A directory that says what it may import is only worth its name
 * while something refuses the import that contradicts it.
 *
 * The table has no exception list. A file that needs an edge against the
 * order is in the wrong layer, and the fix is to move it — which is the
 * revisit trigger ADR-096 names, not a line here.
 *
 * A layer may also name the packages it promises to avoid (`forbidden`). The
 * edges alone cannot see them: `lib/` and `sync/` sit low enough that every
 * edge they may take is Vue-free, yet `import type { Ref } from 'vue'` is no
 * edge at all and makes the layer reactive by signature. `domain/`'s list is
 * `domain-purity-gate.mjs`'s and is not repeated here.
 *
 * Within one layer any import is allowed; the module boundary between
 * `views/` and the feature modules, and between `components/global/` and the
 * rest of `components/`, is the module gate's. Specs (`__tests__/`) are exempt
 * as in both older gates: a spec may compose its subject with what calls it.
 *
 * Node built-ins only; wired into `make client` and the CI client job.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { MODULES } from './modules.mjs'

/* Run from the repository root (`make ci`) or from `client/` (CI job). */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')
const SRC = resolve(root, 'client/src')

/**
 * The packages that make a module reactive or tie it to the app shell. A type
 * import counts, as in the purity gate. `ionicons/icons` is not among them:
 * it is the icon set as plain SVG data, which a pure wording helper may name.
 */
const VUE = [/^vue$/, /^vue-router$/, /^pinia$/, /^@ionic\//]
const IONIC = [/^@ionic\//]

/**
 * The layers in order, each a list of path prefixes under `client/src`
 * (without extension). A file belongs to the layer of its longest matching
 * prefix; a file no prefix matches fails the gate, so a new directory is
 * placed on purpose rather than importable by default. `forbidden` lists the
 * packages a layer promises to avoid (CODING_PRINCIPLES.md §3).
 */
const LAYERS = [
  {
    name: 'vocabulary',
    // Wire types, words, tokens, URLs. A module's own catalogue is words like
    // the kernel's, read by `i18n/index.ts` (ADR-079); its `types.ts` is the
    // shapes of its rows, which its rules read (ADR-066 amendment 2).
    paths: [
      'types',
      'api',
      'i18n',
      'theme',
      'assets',
      'router/paths',
      ...MODULES.flatMap((m) => [`${m}/i18n`, `${m}/types`]),
    ],
  },
  { name: 'domain', paths: ['domain', ...MODULES.map((m) => `${m}/domain`)] },
  { name: 'lib', paths: ['lib'], forbidden: VUE },
  // The tokens and their refresh read only the wire's words and the clock;
  // the transport below `sync/` hands them every request.
  { name: 'auth', paths: ['auth'] },
  // The transport is Vue-free (ADR-096): a store hands it a plain holder,
  // which its `Ref` satisfies, never the `Ref` itself.
  { name: 'sync', paths: ['sync'], forbidden: VUE },
  { name: 'local', paths: ['local'] },
  {
    name: 'edges',
    // The app's edges with the platform: Web Push, the service worker, the
    // mode it runs in and the server it talks to, the navigation guards.
    paths: ['notifications', 'pwa', 'mode', 'config', 'router'],
  },
  { name: 'kernel', paths: ['kernel'] },
  { name: 'stores', paths: ['stores'] },
  // The use cases the CLI shares run without an app shell; reactivity is
  // theirs to use, a controller or a component is not.
  { name: 'app', paths: ['app'], forbidden: IONIC },
  { name: 'composables', paths: ['composables'] },
  { name: 'components', paths: ['components'] },
  { name: 'screens', paths: ['views', ...MODULES] },
]

/**
 * The composition root: it wires every layer together and so may import any
 * of them, and nothing below it may import it back. `dev/` is the development
 * seed and gallery the root mounts; whether a screen's dynamic import of it
 * ships is `dev-code-gate.mjs`'s question, so an import *into* `dev/` is not
 * judged here.
 */
const ROOT = ['App', 'main', 'router/index', 'dev']
const DEV = 'dev'

const matches = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`)

/** The layer index of a `client/src`-relative path without extension, or a root marker. */
function placeOf(path) {
  if (ROOT.some((p) => matches(path, p))) return 'root'
  let best = null
  let bestLength = -1
  LAYERS.forEach((layer, index) => {
    for (const prefix of layer.paths) {
      if (matches(path, prefix) && prefix.length > bestLength)
        [best, bestLength] = [index, prefix.length]
    }
  })
  return best
}

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

const withoutExtension = (path) => path.replace(/\.(ts|vue|css)$/, '')

/**
 * Where a specifier lands, as an extensionless path relative to
 * `client/src`, or null for a package. A directory resolves to its index.
 */
function target(spec, file) {
  let path
  if (spec.startsWith('@/')) path = spec.slice(2)
  else if (spec.startsWith('.')) path = relative(SRC, resolve(join(file, '..'), spec))
  else return null
  try {
    if (statSync(resolve(SRC, path)).isDirectory()) path = `${path}/index`
  } catch {
    // Not a directory: a file named without its extension.
  }
  return withoutExtension(path)
}

const label = (place) => (place === 'root' ? 'the composition root' : `\`${LAYERS[place].name}\``)

const problems = []
let files = 0
let edges = 0
let packages = 0

for (const file of walk(SRC)) {
  files += 1
  const from = withoutExtension(relative(SRC, file))
  const own = placeOf(from)
  if (own === null) {
    problems.push(
      `client/src/${relative(SRC, file)}: sits in no layer — place its directory in LAYERS`,
    )
    continue
  }
  for (const spec of specifiers(readFileSync(file, 'utf8'))) {
    const to = target(spec, file)
    if (to === null) {
      packages += 1
      const forbidden = own === 'root' ? [] : (LAYERS[own].forbidden ?? [])
      if (forbidden.some((p) => p.test(spec)))
        problems.push(
          `client/src/${relative(SRC, file)}: imports \`${spec}\` — ${label(own)} promises to avoid it`,
        )
      continue
    }
    edges += 1
    if (own === 'root' || matches(to, DEV)) continue
    const theirs = placeOf(to)
    if (theirs !== null && theirs !== 'root' && theirs <= own) continue
    problems.push(
      `client/src/${relative(SRC, file)}: imports \`${spec}\` — ${label(own)} may not reach ` +
        (theirs === null ? 'a path in no layer' : label(theirs)),
    )
  }
}

/*
 * A gate that measures nothing passes silently for the rest of its life. If
 * the tree moved, this says so instead of reporting ok over an empty walk.
 */
if (files === 0 || edges === 0) {
  console.error('layer-gate: no files or imports found under client/src')
  process.exit(1)
}

if (problems.length > 0) {
  console.error('layer-gate: a file imports a layer above its own, or a package its layer avoids.\n')
  for (const line of [...new Set(problems)].sort()) console.error(`  ${line}`)
  console.error(
    `\nADR-096: ${LAYERS.map((l) => l.name).join(' → ')}, each importing only from itself and ` +
      'the layers before it, and none of the packages its layer avoids. Move the thing being ' +
      'named down, or the importing file up — ' +
      'dev-docs/CODING_PRINCIPLES.md §3 says what each layer holds.',
  )
  process.exit(1)
}

console.log(
  `layer-gate: ok — ${files} files, ${edges} imports, ${packages} package imports, ` +
    `${LAYERS.length} layers, none reaching upward or into a package its layer avoids`,
)
