/**
 * The design-token gate's own specification (CLAUDE.md invariant 9b).
 *
 * A guard that finds nothing has to prove it *can* find something, and
 * this one had been passing for weeks while blind to every colour
 * notation newer than `hsl()` — `color-mix()`, `oklch()`, `light-dark()`
 * and the 148 names all walked past it. So each rule is asserted from
 * both sides here: what it must reject, and what it must keep letting
 * through.
 *
 * It runs the gate as a process against a fixture tree rather than
 * importing it, because the script scans on load and exits with a code —
 * the code being the thing under test.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const GATE = resolve('../scripts/design-tokens-gate.mjs')

let workspace = ''

/** Runs the gate over a single fixture file and returns what it reported. */
function gateOver(name: string, contents: string): { code: number; output: string } {
  workspace = mkdtempSync(join(tmpdir(), 'tokens-gate-'))
  const dir = join(workspace, 'client', 'src', 'views')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), contents)
  try {
    const output = execFileSync('node', [GATE], { cwd: workspace, encoding: 'utf8' })
    return { code: 0, output }
  } catch (err) {
    const failure = err as { status: number; stderr: string }
    return { code: failure.status, output: failure.stderr }
  }
}

afterEach(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true })
  workspace = ''
})

describe('design-tokens-gate: colour', () => {
  const rejected: Array<[string, string, string]> = [
    ['a hex literal, as it always did', 'color: #ff8844;', 'colour-literal'],
    ['an rgb() triplet, as it always did', 'color: rgb(255 136 68);', 'colour-literal'],
    ['an oklch() colour', 'color: oklch(0.7 0.15 40);', 'colour-literal'],
    ['an oklab() colour', 'color: oklab(0.7 0.1 0.1);', 'colour-literal'],
    ['a lab() colour', 'color: lab(70% 20 30);', 'colour-literal'],
    ['an lch() colour', 'color: lch(70% 40 40);', 'colour-literal'],
    ['an hwb() colour', 'color: hwb(20 10% 20%);', 'colour-literal'],
    ['a color() colour in another space', 'color: color(display-p3 1 0.5 0.2);', 'colour-literal'],
    [
      'light-dark(), which decides a flavour the two :root blocks own',
      'color: light-dark(#fff, #000);',
      'colour-literal',
    ],
    ['a named colour standing alone', 'color: rebeccapurple;', 'colour-keyword'],
    ['a named colour inside a shorthand', 'border: 1px solid red;', 'colour-name'],
    [
      'a named colour inside a gradient',
      'background-image: linear-gradient(navy, teal);',
      'colour-name',
    ],
    // `color` is a colour-only property, so the allowlist rule reaches an
    // inline binding before the name rule needs to.
    ['a named colour in an inline style binding', ':style="{ color: \'gold\' }"', 'colour-keyword'],
    ['a named colour in a custom property', '--ion-item-background: whitesmoke;', 'colour-keyword'],
    [
      'a mix carrying a hex argument',
      'background: color-mix(in srgb, #ff8844 14%, transparent);',
      'raw-mix-argument',
    ],
    [
      'a mix carrying a named colour',
      'background: color-mix(in srgb, teal 14%, transparent);',
      'raw-mix-argument',
    ],
    [
      'a mix whose arguments wrap across lines',
      'background: color-mix(\n  in srgb,\n  #ff8844 14%,\n  transparent\n);',
      'raw-mix-argument',
    ],
  ]

  it.each(rejected)('rejects %s', (_what, declaration, rule) => {
    const { code, output } = gateOver(
      'Fixture.vue',
      `<style scoped>\n.x {\n  ${declaration}\n}\n</style>\n`,
    )
    expect(code).toBe(1)
    expect(output).toContain(`[${rule}]`)
  })

  const accepted: Array<[string, string]> = [
    ['a token', 'color: var(--ct-text);'],
    [
      'a mix built entirely from tokens',
      'background: color-mix(in srgb, var(--jp-brand) 14%, transparent);',
    ],
    [
      'a mix of two tokens',
      'background: color-mix(in srgb, var(--jp-brand) 14%, var(--jp-surface-page));',
    ],
    [
      'a nested mix, both halves tokens',
      'color: color-mix(in srgb, color-mix(in srgb, var(--ct-text) 50%, transparent) 50%, var(--jp-brand));',
    ],
    ['a token with a token fallback', 'color: var(--jp-brand, var(--ct-text));'],
    ['currentColor, which names no colour', 'border-color: currentColor;'],
    ['a declined colour', 'background-color: transparent;'],
    ['a length in a custom property', '--padding-start: 12px;'],
  ]

  it.each(accepted)('accepts %s', (_what, declaration) => {
    const { code } = gateOver(
      'Fixture.vue',
      `<style scoped>\n.x {\n  ${declaration}\n}\n</style>\n`,
    )
    expect(code).toBe(0)
  })

  it('leaves a colour name in a catalogue string alone', () => {
    // `en.ts` is scanned like every other source, and its values are
    // sentences: `markGreen: 'Mark as green'` is prose after a colon.
    const { code } = gateOver(
      'copy.ts',
      "export const copy = {\n  markGreen: 'Mark as green',\n  status: 'red',\n}\n",
    )
    expect(code).toBe(0)
  })

  it('reads a colour name in prose as prose, in both comment syntaxes', () => {
    const { code } = gateOver(
      'Fixture.vue',
      [
        '<template>',
        '  <!-- FR-19.8: the guard is a sentence, not only a grey button. -->',
        '  <p>x</p>',
        '</template>',
        '<style scoped>',
        '/* deliberately not red: the state is a warning, not an error. */',
        '.x { color: var(--ct-straw); }',
        '</style>',
      ].join('\n'),
    )
    expect(code).toBe(0)
  })

  it('refuses to report ok when it scanned nothing', () => {
    workspace = mkdtempSync(join(tmpdir(), 'tokens-gate-'))
    let status = 0
    try {
      execFileSync('node', [GATE], { cwd: workspace, encoding: 'utf8' })
    } catch (err) {
      status = (err as { status: number }).status
    }
    expect(status).toBe(2)
  })
})
