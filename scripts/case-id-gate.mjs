/**
 * Holds every E2E case id in the UI-Test-Spec to one meaning.
 *
 * Found 2026-08-30 auditing M5 (backlog item 6): six of its ids were each
 * *defined twice*, carrying one promise from the original v1.0 catalogue and
 * a different one from the §3.25 rebuild. The suite implements one meaning
 * per number, so four **green** tests read as coverage of four promises
 * nothing asserted, and the traceability matrix pointed seven FRs at the
 * half nobody could see.
 *
 * Nothing could have caught it by eye. Both commits that caused it are pure
 * additions to a long bulleted list — one of them defined the same id twice
 * inside a single commit — and every automatic signal moved the *reassuring*
 * way: the count of ids with a test went up each time. It is the shape a
 * checklist is worst at and a script is best at.
 *
 * The rule: a case id is defined by exactly one bullet. A retired entry stays
 * in the file struck through — that is deliberate, so a reader arriving from
 * an old commit finds out what happened to the id it names — but it stays as
 * the *same* entry, re-headed, never as a second definition of the number.
 *
 * Node built-ins only, so it needs no install; wired into `make ci` beside
 * the other node gates.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* Run from the repository root or from `client/`, like the sibling gates. */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')
const SPEC = resolve(root, 'dev-docs/UI_Test_Spec_v1.0.md')


/**
 * A line that *defines a live case*: a top-level bullet headed by the id and
 * not struck through. A struck entry deliberately keeps its original number —
 * that is how a reader arriving from an old commit finds out what happened to
 * the id it names — so it is a tombstone, not a second definition, and only
 * the live ones may collide.
 */
const DEFINITION = /^\* \*\*(E2E-[A-Z0-9]+-\d+[a-z]*)\b/gm

const spec = readFileSync(SPEC, 'utf8')

const seen = new Map()
for (const [, id] of spec.matchAll(DEFINITION)) {
  seen.set(id, (seen.get(id) ?? 0) + 1)
}

const collisions = [...seen].filter(([, n]) => n > 1).map(([id]) => id)

if (collisions.length > 0) {
  console.error(
    `case-id-gate: ${collisions.length} case id(s) defined more than once in ${SPEC}:\n` +
      collisions.map((id) => `  ${id}`).join('\n') +
      '\n\nA number means what the suite implements. Give the newer promise its own\n' +
      'id, and leave the older entry in place — struck through, re-headed, and\n' +
      'saying where its promise went — so a reader arriving from an old commit\n' +
      'can still find out what happened to the id it names.',
  )
  process.exit(1)
}

console.log(`case-id-gate: ok — ${seen.size} case ids, one definition each`)
