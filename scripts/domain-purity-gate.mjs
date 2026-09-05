/**
 * Holds `client/src/domain` to invariant 4: it is the layer the rules live in,
 * and it never points at the layers that call it.
 *
 * The direction is the whole value of the package. Its modules are exhaustively
 * unit-tested precisely because a spec can construct one without a component
 * tree, a pinia instance or a router — the same reason `internal/sync` and
 * `internal/wiregen` import nothing internal on the Go side. One import of a
 * composable takes that away from every module that transitively reaches it,
 * and it takes it away silently: the suite stays green until the day a spec
 * needs the DOM the import dragged in.
 *
 * **A type-only import counts.** The finding this gate was written for was
 * exactly that shape — `domain/portableImport.ts` named its mutation builders
 * as `ReturnType<typeof useMutations>`, reaching up into `composables/` for a
 * type. It compiled to nothing and cost no runtime dependency, which is why it
 * survived a review pass and a purity claim in the same document; what it did
 * cost was the sentence "domain imports nothing above it", which was no longer
 * true and therefore no longer load-bearing. The factory it named is Vue-free
 * and now lives in `client/src/sync/mutations.ts`.
 *
 * Node built-ins only, so it needs no install; wired into `make client` and the
 * CI client job beside the other node gates.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/* Run from the repository root (`make ci`) or from `client/` (CI job). */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')
const SRC = resolve(root, 'client/src')
const DOMAIN = resolve(SRC, 'domain')

/**
 * The layers above the rules. A `domain` module may import from `types/`,
 * `api/types`, `sync/` and its own siblings — everything else in the app is
 * either a caller of these rules or a piece of the browser they are written to
 * be independent of.
 */
const FORBIDDEN_DIRS = [
  'components',
  'composables',
  'local',
  'router',
  'stores',
  'theme',
  'views',
]

/**
 * Packages that make a module un-constructible outside a browser app. `yaml`
 * is a plain parser and stays allowed, as does anything else that is not one
 * of these.
 */
const FORBIDDEN_PACKAGES = [/^vue$/, /^vue-router$/, /^pinia$/, /^@ionic\//]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

/**
 * Every module specifier the file names, whether the import is type-only or
 * not, plus dynamic `import(...)` — the two forms that would otherwise be the
 * loophole.
 */
function specifiers(source) {
  return [
    ...[...source.matchAll(/(?:^|\n)\s*(?:import|export)[^\n]*?from\s*'([^']+)'/g)].map(
      (m) => m[1],
    ),
    ...[...source.matchAll(/\bimport\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]),
  ]
}

/** Where a specifier lands, as a path relative to `client/src`, or null. */
function target(spec, file) {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (spec.startsWith('.')) return relative(SRC, resolve(join(file, '..'), spec))
  return null
}

const problems = []
let modules = 0
let imports = 0

for (const file of walk(DOMAIN)) {
  modules += 1
  const where = relative(root, file)
  const source = readFileSync(file, 'utf8')
  for (const spec of specifiers(source)) {
    imports += 1
    const inside = target(spec, file)
    if (inside === null) {
      if (FORBIDDEN_PACKAGES.some((p) => p.test(spec))) {
        problems.push(`${where}: imports \`${spec}\` — the rules run without a browser app`)
      }
      continue
    }
    const layer = inside.split('/')[0]
    if (FORBIDDEN_DIRS.includes(layer)) {
      problems.push(`${where}: imports \`${spec}\` — that is \`${layer}/\`, which calls domain`)
    }
  }
}

/*
 * A gate that measures nothing passes silently for the rest of its life. If
 * the package moved, this says so instead of reporting ok over an empty walk.
 */
if (modules === 0) {
  console.error(`domain-purity-gate: no modules found under ${relative(root, DOMAIN)}`)
  process.exit(1)
}

if (problems.length > 0) {
  console.error('domain-purity-gate: a rule module points at the layer that calls it.\n')
  for (const line of [...new Set(problems)].sort()) console.error(`  ${line}`)
  console.error(
    '\nInvariant 4: the pure client-side rules live in client/src/domain and are testable ' +
      'without a component tree. A type-only import counts — it is the shape this gate was ' +
      'written for. Move the thing being named down into domain/, sync/ or types/.',
  )
  process.exit(1)
}

console.log(
  `domain-purity-gate: ok — ${modules} modules under client/src/domain, ` +
    `${imports} imports, none reaching above it`,
)
