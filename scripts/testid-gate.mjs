/**
 * Holds one claim the e2e suite makes: a test id it operates is an id the app
 * actually declares.
 *
 * A locator that finds nothing usually fails loudly, so the id that matters
 * here is the one in an **absence** assertion. `expect(getByTestId('x'))
 * .toHaveCount(0)` against an id `client/src` has never contained is green
 * today, was green before the change it was written for, and stays green
 * after the control it names is added — false-green by construction, which is
 * the shape CLAUDE.md's testing rules name outright. This gate found exactly
 * one when it was written (`filter-apply`, packing-list.spec.ts).
 *
 * **What counts as declared, and why it is a substring test.** An id reaches
 * the DOM three ways in this client: as a `data-testid` attribute, as a
 * `testid` **prop** on a shared component (EmptyState, SheetModal, DateField,
 * FilePickButton) which renders it, and as a field in a descriptor list a
 * component binds. Matching only the attribute would fail on two thirds of
 * them; matching each form would be three brittle patterns plus the next one
 * somebody invents. In every form the id is written as a quoted literal, so
 * that is what is looked for.
 *
 * **Interpolated ids** are matched by their literal edge. A row is
 * `data-testid="`m4-row-${name}`"`, so a spec's `m4-row-Zelt` is known by the
 * prefix `m4-row-`; `FilePickButton` renders `${testid}-input`, so
 * `import-file-input` is known by the suffix. A template whose id is entirely
 * interpolated would constrain nothing — none exists, and the gate says so
 * rather than silently accepting everything, because a single empty prefix
 * makes `startsWith` true for every id and the whole gate vacuous. That was
 * the first version's actual bug.
 *
 * Node built-ins only; wired into `make ci` and the CI client job beside the
 * other node gates.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/* Run from the repository root (`make ci`) or from `client/` (the CI job). */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')
const SRC = resolve(root, 'client/src')
const E2E = resolve(root, 'client/e2e')

/**
 * Ids the app deliberately does not declare, with the reason. The mock IdP is
 * a page the e2e harness serves itself (ADR-029): it is not JIT-Pack, and its
 * controls have no business appearing in `client/src`.
 */
const NOT_THE_APPS = {
  'idp-login-': 'the mock identity provider is served by the e2e harness, not by the app (ADR-029)',
}

/**
 * Strips comments, because the gate measures code and not prose. Without it
 * the gate reads its own explanation of a removed id and reports the id as
 * still in use — which is exactly how the first run after the fix failed.
 *
 * Line-based on purpose. A regex for `/* … *\/` looked obviously right and
 * silently ate 15 KB out of a single-file component, taking twenty real ids
 * with it: a Vue SFC is three languages, and a cross-line pattern cannot tell
 * a comment from the same characters inside a template or a style block. A
 * line whose first non-space characters open a comment is one; nothing else
 * is touched, so a `//` inside a URL survives.
 */
function withoutComments(text) {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart()
      return !(
        t.startsWith('//') ||
        t.startsWith('/*') ||
        t.startsWith('*') ||
        t.startsWith('<!--')
      )
    })
    .join('\n')
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(full)) out.push(full)
  }
  return out
}

const sourceFiles = walk(SRC).filter((f) => !f.includes('__tests__'))
const source = sourceFiles.map((f) => withoutComments(readFileSync(f, 'utf8'))).join('\n')
if (sourceFiles.length === 0) {
  console.error('testid-gate: read no source files — the comparison would be vacuous')
  process.exit(1)
}

/**
 * The literal edges of every interpolated id — written as the attribute or
 * handed to a shared component as the `testid` prop, because a descriptor
 * list builds `testid: `trips-filter-${value}`` and never touches the
 * attribute itself.
 */
const prefixes = new Set()
const suffixes = new Set()
const templates = [
  ...source.matchAll(/data-testid=["']?`([^`]+)`/g),
  ...source.matchAll(/\btestid[:=]\s*["']?`([^`]+)`/g),
]
const unconstrained = []
const literalTemplates = new Set()
for (const [, template] of templates) {
  /* A template with no interpolation at all is simply an id. */
  if (!template.includes('${')) {
    literalTemplates.add(template)
    continue
  }
  let constrains = false
  const head = template.match(/^([^$]+)\$\{/)
  if (head) {
    prefixes.add(head[1])
    constrains = true
  }
  const tail = template.match(/\}([^${}]+)$/)
  if (tail) {
    suffixes.add(tail[1])
    constrains = true
  }
  /*
   * A template that opens with an interpolation still has literal edges — the
   * row id is `${child ? 'm4-child' : 'm4-row'}-${key}`, and both branches are
   * spelled out. Each quoted literal inside the group, joined to the literal
   * segment that follows it, is a real prefix.
   */
  const opening = template.match(/^\$\{([^}]*)\}([^${}]*)/)
  if (opening) {
    for (const [, value] of opening[1].matchAll(/'([^']+)'/g)) {
      prefixes.add(value + opening[2])
      constrains = true
    }
  }
  /*
   * A template that contributes no literal edge at all constrains nothing.
   * The first version instead let an *empty* prefix into the set, which makes
   * `startsWith` true for every id and the whole gate vacuous — it reported
   * "0 problems" and could not have reported anything else.
   */
  if (!constrains) unconstrained.push(template)
}

if (unconstrained.length > 0) {
  console.error(
    'testid-gate: a data-testid is built entirely from interpolation, so no spec can be ' +
      'checked against it and no reader can find it:\n',
  )
  for (const template of unconstrained) console.error(`  \`${template}\``)
  console.error('\nGive it at least one literal segment.')
  process.exit(1)
}

/**
 * Every id the source spells out in full — the attribute, the `testid` prop,
 * and a descriptor's field alike. Needed as a set as well as as text, because
 * a spec's *prefix* is known when some declared id begins with it:
 * `m7-kind-${kind}` in a helper reaches `m7-kind-template` and
 * `m7-kind-group`, which the screen declares one by one.
 */
const exactIds = new Set(literalTemplates)
for (const [, id] of source.matchAll(/data-testid="([^"$`{]+)"/g)) exactIds.add(id)
for (const [, id] of source.matchAll(/\btestid[:=]\s*["']([^"'$`{]+)["']/g)) exactIds.add(id)

const declared = (id) =>
  source.includes(`'${id}'`) || source.includes(`"${id}"`) || source.includes(`\`${id}\``)
const isPrefixOfADeclaredId = (id) => [...exactIds].some((known) => known.startsWith(id))
const byPrefix = (id) => [...prefixes].some((p) => id.startsWith(p))
const bySuffix = (id) => [...suffixes].some((s) => id.endsWith(s))
const excused = (id) => Object.keys(NOT_THE_APPS).some((p) => id.startsWith(p))
const known = (id) => declared(id) || byPrefix(id) || bySuffix(id) || excused(id)

const problems = []
let checked = 0
for (const file of walk(E2E)) {
  const text = withoutComments(readFileSync(file, 'utf8'))
  const where = relative(root, file)
  const seen = [
    ...[...text.matchAll(/getByTestId\(\s*'([^'`$]+)'\s*\)/g)].map((m) => m[1]),
    ...[...text.matchAll(/\[data-testid="([^"$]+)"\]/g)].map((m) => m[1]),
  ]
  for (const id of seen) {
    checked += 1
    if (!known(id)) problems.push(`${where}: "${id}" appears nowhere in client/src`)
  }
  /*
   * A template's literal head is checked more loosely: it names a family, so
   * it is enough that the app declares a member of it.
   */
  for (const [, head] of text.matchAll(/getByTestId\(\s*`([^`]*?)\$\{/g)) {
    if (!head) continue
    checked += 1
    if (!known(head) && !isPrefixOfADeclaredId(head)) {
      problems.push(`${where}: no id in client/src begins with "${head}"`)
    }
  }
}

if (problems.length > 0) {
  console.error('testid-gate: the suite operates ids the app does not declare.\n')
  for (const line of [...new Set(problems)].sort()) console.error(`  ${line}`)
  console.error(
    '\nEither the control was renamed and the spec was not, or the assertion is an absence ' +
      'against a control that never existed — which is green whatever the app does. Assert ' +
      'against what the screen demonstrably offers instead.',
  )
  process.exit(1)
}

console.log(
  `testid-gate: ok — ${checked} test-id uses in client/e2e, ` +
    `all declared in client/src (${prefixes.size} interpolated prefixes, ${suffixes.size} suffixes)`,
)
