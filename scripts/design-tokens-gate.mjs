#!/usr/bin/env node
/*
 * Design-token gate (CLAUDE.md invariant 9b).
 *
 * Three token tables own the shared visual decisions — catppuccin.css
 * owns colour, typography.css owns type, surfaces.css owns shape — and
 * this rejects a view that decides one for itself.
 *
 * It exists because the alternative was proved: the client accumulated
 * nine corner radii with no rule for picking one, and twelve
 * `var(--token, #hex)` fallbacks that amounted to a second, unreviewed
 * palette. Six more screen rebuilds are queued behind this, and every one
 * of them would have invented its own numbers again.
 *
 * Node built-ins only, no dependency (NFR-4.3), same shape as
 * scripts/coverage-gate.sh. Run from the repo root or from client/.
 */

import { globSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

/** Files that *are* the token tables, and so may write raw values. */
const TOKEN_FILES = [
  'src/theme/catppuccin.css',
  'src/theme/typography.css',
  'src/theme/surfaces.css',
]

/**
 * Each rule is a matcher over one line plus the reason it is a rule.
 * `allow` runs first and lets a legitimate raw value through.
 */
const RULES = [
  {
    id: 'colour-literal',
    // Hex, or any of CSS's colour functions. `rgba(var(--x), .5)` is
    // caught too: composing a colour from a triplet is a palette
    // decision, and the palette is the file that holds the triplets.
    match: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/,
    why: 'colour belongs to src/theme/catppuccin.css — use a --ct-* or --jp-* token',
  },
  {
    id: 'raw-radius',
    match: /(?:^|[;{\s])-{0,2}border-radius:\s*[^;]*\b\d[\d.]*(?:px|rem|em)/,
    // A circle is a shape rather than a size, so `50%` is not a magic
    // number and never had a token to move onto.
    allow: (line) => /border-radius:\s*(?:50%|var\()/.test(line),
    why: 'radius belongs to src/theme/surfaces.css — use --jp-r, --jp-r-sm/md/lg or --jp-r-pill',
  },
  {
    id: 'raw-shadow',
    match: /(?:^|[;{\s])-{0,2}box-shadow:\s*(?!var\()[^;]*\S/,
    // `0 0 0 <n>px <colour>` is a ring, not a shadow: no offset and no
    // blur means nothing is being lifted, it is a border drawn outside
    // the box. Elevation tokens would be the wrong thing to hand it, and
    // its colour is still governed by the colour rule above.
    allow: (line) => /box-shadow:\s*(?:none|var\(|0 0 0 [\d.]+px\b)/.test(line),
    why: 'elevation belongs to src/theme/surfaces.css — use --jp-shadow, --jp-shadow-sheet or --jp-shadow-panel',
  },
  {
    id: 'raw-type',
    match: /(?:^|[;{\s])(?:font-size|font-weight|font-family|letter-spacing):\s*(?!var\()[^;]*\S/,
    // Two carve-outs, both by rule:
    //
    // `letter-spacing: 0` and `normal` are *resets* — a rule undoing a
    // tracking it inherited. There is no token for "none of the above"
    // and inventing one would say a design decision was made where one
    // was declined.
    //
    // SVG text is not covered here at all, and cannot be: inside a
    // viewBox its font-size is in user units, a proportion of the drawing
    // rather than a size on screen. Those live as an SVG attribute in the
    // template, beside the other geometry, which keeps them out of CSS
    // and so out of this rule's way.
    allow: (line) => /(?:letter-spacing|font-[a-z]+):\s*(?:var\(|normal\b|0\s*;)/.test(line),
    why: 'type belongs to src/theme/typography.css — use --jp-text-*, --jp-icon-*, --jp-weight-*, --jp-tracking-* or a .jp-* role class',
  },
]

/**
 * Blanks out comment bodies while keeping every newline, so a reported
 * line number still points at the offending line.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
}

const clientDir = resolve(process.cwd().endsWith('client') ? '.' : 'client')
const skip = new Set(TOKEN_FILES.map((f) => resolve(clientDir, f)))

// Tests are excluded, and the reason is the rule rather than convenience:
// this gate stops a *view* from deciding colour or shape. A test that
// asserts what a token resolves to has to be able to write that token's
// text, and it paints nothing — flagging it would be the gate arguing with
// its own suite.
const sources = globSync('src/**/*.{vue,css,ts}', {
  cwd: clientDir,
  exclude: (name) => /\.spec\.ts$|^__tests__$/.test(name),
})

// A gate that scans nothing reports "ok", which is the worst answer it
// could give. Run from the wrong directory and that is exactly what
// happens, so an empty sweep is an error rather than a pass.
if (sources.length === 0) {
  console.error(`design-tokens-gate: no sources under ${clientDir} — run from the repo root or client/`)
  process.exit(2)
}

const findings = []
for (const rel of sources) {
  const file = resolve(clientDir, rel)
  if (skip.has(file)) continue

  const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (!rule.match.test(line)) continue
      if (rule.allow?.(line)) continue
      findings.push({ file: relative(clientDir, file), line: i + 1, rule, text: line.trim() })
    }
  })
}

if (findings.length > 0) {
  console.error(`design-tokens-gate: ${findings.length} raw value(s) outside the token tables\n`)
  for (const f of findings) {
    console.error(`  client/${f.file}:${f.line}  [${f.rule.id}]  ${f.text}`)
    console.error(`      ${f.rule.why}\n`)
  }
  process.exit(1)
}

console.log('design-tokens-gate: ok — colour, type, radius and elevation all come from the token tables')
