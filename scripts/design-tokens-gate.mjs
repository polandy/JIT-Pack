#!/usr/bin/env node
/*
 * Design-token gate (CLAUDE.md invariant 9b).
 *
 * Three token tables own the shared visual decisions — palette.css
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
  'src/theme/palette.css',
  'src/theme/typography.css',
  'src/theme/surfaces.css',
]

/**
 * Every colour notation CSS has, except `color-mix()`. Named so the two
 * rules that need it cannot drift apart, and written as one alternation
 * so adding a notation is one edit.
 *
 * `color(` is guarded against `background-color(`, which cannot occur but
 * would match a bare word boundary if it did.
 */
const MODERN_COLOUR_FN =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|device-cmyk|light-dark)\(|(?<![-\w])color\(/

/**
 * The 148 colour names CSS defines. A denylist is normally the wrong
 * shape — the one this project keeps for module boundaries was
 * incomplete the day it was written — but this list is different in kind:
 * it is normatively closed. The last name added was `rebeccapurple`, in
 * 2014, and CSS Color 4 states no more will follow.
 */
const NAMED_COLOURS =
  'aliceblue|antiquewhite|aquamarine|aqua|azure|beige|bisque|black|blanchedalmond|blueviolet|blue|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|goldenrod|gold|gray|greenyellow|green|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavenderblush|lavender|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|limegreen|lime|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olivedrab|olive|orangered|orange|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|whitesmoke|white|yellowgreen|yellow'

/** A named colour standing as a whole token in a declaration's value. */
const NAMED_COLOUR_VALUE = new RegExp(`:[^;{}]*(?:^|[\\s,(])(?:${NAMED_COLOURS})(?![-\\w])`)

/**
 * A declaration whose *whole* value is a colour, capturing that value.
 * A custom property is in the set because outside the token tables it is
 * a token being re-decided under another name.
 */
const COLOUR_ONLY_DECL =
  /(?:^|[;{\s])(?:--[-\w]*(?:color|background|ink|tint|shade)|(?:[-\w]+-)?color|fill|stroke|stop-color|flood-color|lighting-color):([^;{}]*)/

/**
 * What a colour value may contain besides a token: the keywords that name
 * no colour, a percentage or number belonging to a mix, and punctuation.
 */
const COLOUR_ABSTENTIONS =
  /\b(?:transparent|currentColor|inherit|initial|unset|revert|revert-layer|none|in|srgb|oklab|oklch|shorter|longer|increasing|decreasing|hue|auto)\b|[\d.]+%?|[\s,()!]|important/gi

/**
 * Removes each `name(...)` call and its balanced body, so what is left is
 * whatever the author wrote *outside* the tokens. Balanced rather than
 * regex because a `var()` may carry a fallback that is itself a call.
 */
function stripCalls(text, names) {
  for (const name of names) {
    let start
    while ((start = text.search(new RegExp(`(?<![-\\w])${name}\\(`))) !== -1) {
      let depth = 0
      let i = text.indexOf('(', start)
      for (; i < text.length; i++) {
        if (text[i] === '(') depth++
        else if (text[i] === ')' && --depth === 0) break
      }
      if (i >= text.length) return text.slice(0, start) // unbalanced: stop, do not loop
      text = text.slice(0, start) + text.slice(i + 1)
    }
  }
  return text
}

/**
 * Each rule is a matcher over one line plus the reason it is a rule.
 * `allow` runs first and lets a legitimate raw value through.
 */
const RULES = [
  {
    id: 'colour-literal',
    // Hex, or any of CSS's colour functions — every notation the
    // language has, not the two that happened to be in use when the rule
    // was written. `rgba(var(--x), .5)` is caught too: composing a colour
    // from a triplet is a palette decision, and the palette is the file
    // that holds the triplets. `light-dark()` is here for a second
    // reason — it decides a flavour, which the two `:root` blocks own.
    // `color-mix()` is deliberately absent: it is the one function that
    // can be written entirely out of tokens, so it has its own rule below.
    match: MODERN_COLOUR_FN,
    why: 'colour belongs to src/theme/palette.css — use a --ct-* or --jp-* token',
  },
  {
    id: 'colour-keyword',
    // The other half of the same hole. A rule that only knows how to spot
    // a *function* never sees `color: white`, so this one works the other
    // way round: for a property whose whole value is a colour, the value
    // has to be built out of tokens and the keywords that decline to name
    // one. An allowlist, so a notation CSS gains next year is closed by
    // default rather than needing this file to hear about it.
    match: COLOUR_ONLY_DECL,
    allow: (line) => {
      const value = line.match(COLOUR_ONLY_DECL)?.[1] ?? ''
      // `color-mix` is stripped whole rather than judged here — its
      // arguments are the file rule's business, and it may wrap a line.
      return stripCalls(value, ['var', 'color-mix']).replace(COLOUR_ABSTENTIONS, '').trim() === ''
    },
    why: 'colour belongs to src/theme/palette.css — use a --ct-* or --jp-* token',
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
  {
    id: 'colour-name',
    // The net under both rules above: a named colour reads as prose and
    // hides in a shorthand, where no allowlist over whole values can
    // reach it — `border: 1px solid red` names a colour in the middle of
    // three other decisions.
    match: NAMED_COLOUR_VALUE,
    why: 'colour belongs to src/theme/palette.css — use a --ct-* or --jp-* token',
  },
]

/**
 * `color-mix()` is the one colour function a view may legitimately write,
 * because it can be built entirely out of tokens — and all 24 uses
 * outside the token tables are. What it must not do is smuggle a literal
 * in as one of its arguments, which is what this checks. It is a whole-
 * file rule rather than a line rule because a mix's arguments wrap.
 */
function findRawMixes(source) {
  const found = []
  const call = /(?<![-\w])color-mix\(/g
  let m
  while ((m = call.exec(source)) !== null) {
    let depth = 0
    let end = m.index + m[0].length - 1
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++
      else if (source[end] === ')' && --depth === 0) break
    }
    const body = source.slice(m.index + m[0].length, end)
    // Nested mixes are removed rather than judged: each is found again by
    // this same scan, and reporting it twice would name one line twice.
    const rest = stripCalls(body, ['var', 'color-mix']).replace(COLOUR_ABSTENTIONS, '').trim()
    if (rest !== '') {
      found.push({
        line: source.slice(0, m.index).split('\n').length,
        text: `color-mix(${body.replace(/\s+/g, ' ')})`,
        rest,
      })
    }
  }
  return found
}

const MIX_RULE = {
  id: 'raw-mix-argument',
  why: 'a colour mixed in a view is composed of --ct-*/--jp-* tokens, transparent or currentColor — nothing else',
}

/**
 * Blanks out comment bodies while keeping every newline, so a reported
 * line number still points at the offending line. A `.vue` file carries
 * HTML comments as well, and prose names colours: the FR-19.8 card
 * explains itself with the words "a grey button".
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->/g, (m) =>
    m.replace(/[^\n]/g, ' '),
  )
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

  const source = stripComments(readFileSync(file, 'utf8'))
  for (const mix of findRawMixes(source)) {
    findings.push({ file: relative(clientDir, file), line: mix.line, rule: MIX_RULE, text: mix.text })
  }

  const lines = source.split('\n')
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
