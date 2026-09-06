/**
 * Colour anchors (Addendum FR-21.7, UI-Spec G-11).
 *
 * The palette was never the problem — the *roles* were. `palette.css`
 * mapped blue onto `--ion-color-primary`, which Ionic paints on tabs, the
 * FAB, checkboxes and segments, and demoted peach to `warning`. The app
 * therefore read as a default Ionic app while the concept prototype puts
 * peach on everything that says "this product" and reserves blue for
 * things you act on.
 *
 * These assert the source file, the way the typography suite does: jsdom
 * resolves no custom properties, so what is worth guarding here is the
 * mapping itself. The rendered end is `e2e/colour-anchors.spec.ts`.
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

// Read, not imported: Vitest stubs CSS imports (and `?raw` with them), so
// an import would assert against an empty string and pass forever.
const css = readFileSync(resolve(process.cwd(), 'src/theme/palette.css'), 'utf8')

/** The declared value of a custom property, or undefined if unset. */
function value(prop: string): string | undefined {
  return new RegExp(`^\\s*${prop}:\\s*([^;]+);`, 'm').exec(css)?.[1]?.trim()
}

describe('the three anchors (FR-21.7)', () => {
  it('names each role once, on the hue the prototype gives it', () => {
    expect(value('--jp-brand')).toBe('var(--ct-larch)')
    expect(value('--jp-action')).toBe('var(--ct-glacier)')
    expect(value('--jp-done')).toBe('var(--ct-pine)')
  })

  it('keeps glacier as the action colour Ionic paints, and routes it through the role', () => {
    // The brand is not the primary: primary is what Ionic puts on buttons
    // and links, and those are actions. Repainting it in the brand would make
    // every button shout the brand.
    //
    // It resolves *through* --jp-action rather than reaching for the hue
    // directly, so the action hue is decided in one place the way brand and done
    // are — otherwise the anchor block would describe a rule two of the
    // three roles actually followed.
    expect(value('--ion-color-primary')).toBe('var(--jp-action)')
    expect(value('--jp-action')).toBe('var(--ct-glacier)')
  })

  it('keeps every rgb twin in step with its hex, in both flavours (ADR-048)', () => {
    // CSS cannot derive an rgb triplet from a hex, so each is written by
    // hand beside its colour and would drift apart silently — Ionic's
    // rgba() internals are the only consumer, and a stale twin shows up as
    // slightly-off ripples and nothing else. Before ADR-048 only the brand
    // was guarded, because only the brand was restated per flavour; now
    // every accent is, so every twin is.
    const blocks = [
      /:root\s*\{([^}]*)\}/.exec(css)?.[1],
      /:root\.jitpack-day\s*\{([^}]*)\}/.exec(css)?.[1],
    ]
    for (const block of blocks) {
      expect(block, 'a flavour block is missing').toBeDefined()
      const twins = [...block!.matchAll(/--ct-([a-z0-9-]+)-rgb:\s*(\d+),\s*(\d+),\s*(\d+);/g)]
      // Positive signal: the loop below is vacuous on a block with no twins.
      expect(twins.length).toBeGreaterThan(10)
      for (const [, name, r, g, b] of twins) {
        if (name === 'on-accent') continue // an alias, resolved below
        const hex = new RegExp(`--ct-${name}:\\s*#([0-9a-f]{6});`).exec(block!)?.[1]
        expect(hex, `--ct-${name} has a twin but no hex`).toBeDefined()
        const want = [1, 3, 5].map((i) => String(parseInt(hex!.slice(i - 1, i + 1), 16)))
        expect([r, g, b], `--ct-${name}-rgb disagrees with #${hex}`).toEqual(want)
      }
      // --ct-on-accent is an alias of a plane, so its twin must equal that plane's.
      const alias = /--ct-on-accent:\s*var\(--ct-([a-z0-9]+)\);/.exec(block!)?.[1]
      expect(alias).toBeDefined()
      expect(new RegExp(`--ct-on-accent-rgb:\\s*([^;]+);`).exec(block!)?.[1]).toBe(
        new RegExp(`--ct-${alias}-rgb:\\s*([^;]+);`).exec(block!)?.[1],
      )
    }
  })

  it('stops caution from borrowing the brand hue', () => {
    // The brand hue was `warning`, so a container overweight and the product's
    // own identity were the same colour. Caution moves to straw; anything
    // that was warning *because it is the brand* moves to --jp-brand.
    expect(value('--ion-color-warning')).toBe('var(--ct-straw)')
  })

  it('puts the brand on the surfaces that carry identity', () => {
    // Not a colour list — a claim about which components changed. Each of
    // these is painted by Ionic from --ion-color-primary unless told
    // otherwise, which is what made the app look generic.
    expect(css).toMatch(/ion-fab-button\s*\{[^}]*var\(--jp-brand\)/)
    expect(css).toMatch(/ion-checkbox\s*\{[^}]*var\(--jp-done\)/)
    expect(css).toMatch(/ion-toggle\s*\{[^}]*var\(--jp-done\)/)
    expect(css).toMatch(/ion-progress-bar\s*\{[^}]*var\(--jp-done\)/)
  })
})

describe('no colour lives outside the token table (invariant 9)', () => {
  const vueFiles = globSync('src/**/*.vue', { cwd: process.cwd() })

  it('finds the views to check at all', () => {
    // Without this the assertion below passes vacuously on an empty glob.
    expect(vueFiles.length).toBeGreaterThan(20)
  })

  it('never writes a hex literal, not even as a var() fallback', () => {
    // `var(--ion-color-light, #eee)` is the shape this catches. It reads
    // as harmless, but the fallback is a second, unreviewed palette that
    // only ever paints when something is already wrong — and every one of
    // them was a *light* colour sitting behind a dark-default theme.
    for (const file of vueFiles) {
      const hex = readFileSync(file, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
      expect(hex, `${file} hard-codes ${hex.join(', ')}`).toEqual([])
    }
  })
})

describe('every token a view asks for exists (invariant 9, ADR-048)', () => {
  // A `var(--ct-peach)` that nothing defines paints *nothing* — no error, no
  // fallback, the property is simply invalid at computed-value time — and
  // the tokens gate cannot see it, because the reference is a token by
  // shape. The ADR-048 rename removed fourteen accent names; this is what
  // says none of them is still asked for anywhere.
  const tokenFiles = ['src/theme/palette.css', 'src/theme/typography.css', 'src/theme/surfaces.css']
  const defined = new Set(
    tokenFiles.flatMap((f) =>
      [
        ...readFileSync(resolve(process.cwd(), f), 'utf8').matchAll(
          /^\s*(--(?:ct|jp)-[a-z0-9-]+):/gm,
        ),
      ].map((m) => m[1]),
    ),
  )
  const sources = globSync('src/**/*.{vue,ts,css}', { cwd: process.cwd() }).filter(
    (f) => !f.includes('__tests__'),
  )

  it('finds tokens and sources to check at all', () => {
    expect(defined.size).toBeGreaterThan(40)
    expect(sources.length).toBeGreaterThan(100)
  })

  it('never references a --ct-* or --jp-* token that no table defines', () => {
    // `--jp-mark-size` and the like are *set* by a surface and read by a
    // role class, so a token is also "defined" where a source declares it.
    const declaredInSources = new Set(
      sources.flatMap((f) =>
        [...readFileSync(f, 'utf8').matchAll(/(--(?:ct|jp)-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
      ),
    )
    const missing = new Map<string, string[]>()
    for (const file of sources) {
      for (const m of readFileSync(file, 'utf8').matchAll(/var\((--(?:ct|jp)-[a-z0-9-]+)/g)) {
        const token = m[1]!
        if (defined.has(token) || declaredInSources.has(token)) continue
        missing.set(token, [...(missing.get(token) ?? []), file])
      }
    }
    expect([...missing.entries()].map(([t, f]) => `${t} in ${f.join(', ')}`)).toEqual([])
  })
})
