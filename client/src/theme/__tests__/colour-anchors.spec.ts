/**
 * Colour anchors (Addendum FR-21.7, UI-Spec G-11).
 *
 * The palette was never the problem — the *roles* were. `catppuccin.css`
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
const css = readFileSync(resolve(process.cwd(), 'src/theme/catppuccin.css'), 'utf8')

/** The declared value of a custom property, or undefined if unset. */
function value(prop: string): string | undefined {
  return new RegExp(`^\\s*${prop}:\\s*([^;]+);`, 'm').exec(css)?.[1]?.trim()
}

describe('the three anchors (FR-21.7)', () => {
  it('names each role once, on the hue the prototype gives it', () => {
    expect(value('--jp-brand')).toBe('var(--ct-peach)')
    expect(value('--jp-action')).toBe('var(--ct-blue)')
    expect(value('--jp-done')).toBe('var(--ct-green)')
  })

  it('keeps blue as the action colour Ionic paints', () => {
    // The brand is not the primary: primary is what Ionic puts on buttons
    // and links, and those are actions. Repainting it peach would make
    // every button shout the brand.
    expect(value('--ion-color-primary')).toBe('var(--ct-blue)')
  })

  it('stops caution from borrowing the brand hue', () => {
    // Peach was `warning`, so a container overweight and the product's own
    // identity were the same colour. Caution moves to yellow; anything
    // that was warning *because it is the brand* moves to --jp-brand.
    expect(value('--ion-color-warning')).toBe('var(--ct-yellow)')
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
