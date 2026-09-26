/**
 * Holds one claim a pull-to-refresh makes by existing: that pulling down
 * fetches something.
 *
 * A handler that is one line — `refresher.complete()` — shows the spinner,
 * spins its animation and resolves, having asked nothing of anybody. A gesture
 * that reports success without doing work is worse than an absent one: the
 * absent one sends you to look for the real control, and this one tells you
 * the list is up to date. A test that never touches the refresher cannot see
 * it, and neither can a diff that does not already know to look.
 *
 * **The rule, and why it is spelled this way.** Every view that renders an
 * `<IonRefresher>` must have a handler that `await`s something. Fetching is
 * asynchronous in all three modes — `drainAll`, `drainTrip`, a store `load()`
 * — so a handler with no `await` cannot have fetched, whatever it is named.
 * That is a shape the parser can check without understanding the code, and
 * it is exactly the shape the two dead ones had.
 *
 * It deliberately does *not* try to judge whether the awaited call is the
 * right one; a handler that awaits the wrong thing is a bug a test catches,
 * not a gate. What the gate is for is the empty one.
 *
 * Wired into `make client` and the CI client job.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/* Run from the repository root (`make client`) or from `client/` (CI). */
const clientDir = resolve(process.cwd().endsWith('client') ? '.' : 'client')
const ROOT = join(clientDir, 'src')

/** Every `.vue` file under `client/src`, recursively. */
function vueFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...vueFiles(full))
    else if (entry.endsWith('.vue')) out.push(full)
  }
  return out
}

/**
 * The body of `function <name>(...) { ... }`, by brace matching.
 *
 * A regex to the closing brace would stop at the first `}` inside the body,
 * which every one of these handlers has.
 */
function handlerBody(source, name) {
  const start = source.search(new RegExp(`function\\s+${name}\\s*\\(`))
  if (start === -1) return null
  const open = source.indexOf('{', start)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0)
      return source.slice(open, i + 1)
  }
  return null
}

const failures = []
let checked = 0

for (const file of vueFiles(ROOT)) {
  const source = readFileSync(file, 'utf8')
  if (!source.includes('<IonRefresher')) continue

  const where = relative(clientDir, file)
  const bound = [...source.matchAll(/@ionRefresh="([A-Za-z_$][\w$]*)"/g)].map(
    (m) => m[1],
  )

  if (bound.length === 0) {
    failures.push(
      `${where} — renders an <IonRefresher> that is bound to no handler`,
    )
    continue
  }

  for (const name of bound) {
    checked++
    const body = handlerBody(source, name)
    if (body === null) {
      failures.push(
        `${where} — @ionRefresh="${name}" names no function declared in this file`,
      )
    } else if (!/\bawait\b/.test(body)) {
      failures.push(
        `${where} — ${name}() awaits nothing, so the gesture reports success without fetching. ` +
          `Either make it pull (see DashboardPage's drainAll) or remove the refresher.`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error('refresher-gate: a pull-to-refresh must actually fetch\n')
  for (const line of failures) console.error(`  ${line}`)
  process.exit(1)
}

console.log(
  `refresher-gate: ok — ${checked} pull-to-refresh handler(s), every one of them fetches`,
)
