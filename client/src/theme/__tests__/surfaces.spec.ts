/**
 * Surfaces (Addendum FR-21.8, UI-Spec G-14).
 *
 * The gap this closes is one the app could not see: the M4 group card
 * painted itself `--ct-mantle` on a `--ct-mantle` page, so "card" and
 * "page" were literally the same colour and a 1px hairline was doing all
 * the work. Radius had nine values and no rule; elevation was four raw
 * `rgba(0,0,0,…)` shadows written by hand.
 *
 * These assert the source files, as the typography and colour suites do —
 * jsdom resolves no custom properties. The rendered end is
 * `e2e/surfaces.spec.ts`, and the sweep across every view is
 * `scripts/design-tokens-gate.mjs`, which `make ci` runs.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

// Read, not imported: Vitest stubs CSS imports (and `?raw` with them), so
// an import would assert against an empty string and pass forever.
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')
const surfaces = read('src/theme/surfaces.css')
const palette = read('src/theme/catppuccin.css')

/** The declared value of a custom property in `css`, or undefined. */
function value(css: string, prop: string): string | undefined {
  return new RegExp(`^\\s*${prop}:\\s*([^;]+);`, 'm').exec(css)?.[1]?.trim()
}

/** The body of the `:root` rule that also sets `marker`. */
function block(css: string, selector: string, marker: string): string | undefined {
  const re = new RegExp(`${selector}\\s*\\{[^}]*--${marker}:[^}]*\\}`)
  return re.exec(css)?.[0]
}

describe('the card sits on its own plane (FR-21.8)', () => {
  it('separates page from card, so a card is never the page in disguise', () => {
    // The whole point. If these two ever name the same token again, the
    // M4 group card is a hairline rectangle drawn on the page and no
    // amount of radius or shadow will make it read as an object.
    const page = value(palette, '--jp-surface-page')
    const card = value(palette, '--jp-surface-card')
    expect(page).toBe('var(--ct-mantle)')
    expect(card).toBe('var(--ct-base)')
    expect(card).not.toBe(page)
  })

  it('routes Ionic surfaces through the plane roles rather than the palette', () => {
    // Same rule the colour anchors follow: if --ion-background-color
    // reached --ct-mantle directly, the role block would describe a
    // depth model the app did not actually use.
    expect(value(palette, '--ion-background-color')).toBe('var(--jp-surface-page)')
    expect(value(palette, '--ion-item-background')).toBe('var(--jp-surface-card)')
    expect(value(palette, '--ion-card-background')).toBe('var(--jp-surface-card)')
  })

  it('builds .jp-card out of tokens only', () => {
    const card = /\.jp-card\s*\{([^}]*)\}/.exec(surfaces)?.[1]
    expect(card, 'surfaces.css defines no .jp-card').toBeDefined()
    expect(card).toContain('var(--jp-surface-card)')
    expect(card).toContain('var(--jp-surface-border)')
    expect(card).toContain('var(--jp-r)')
    expect(card).toContain('var(--jp-shadow)')
  })
})

describe('elevation is one geometry cast in two inks (FR-21.8)', () => {
  it('writes each cast once, in surfaces.css', () => {
    for (const token of ['--jp-shadow', '--jp-shadow-sheet', '--jp-shadow-panel']) {
      const declared = surfaces.match(new RegExp(`^\\s*${token}:`, 'gm')) ?? []
      expect(declared, `${token} is declared ${declared.length}× in surfaces.css`).toHaveLength(1)
    }
  })

  it('takes its ink from the flavour, never from a literal', () => {
    // A shadow is a colour, and colour follows the flavour: crust on the
    // dark ground, ink on the light one. Before this the four shadows in
    // the client were all rgba(0,0,0,…) — black in a theme that has no
    // black, and the same weight in both flavours.
    expect(value(surfaces, '--jp-shadow-sheet')).toContain('var(--jp-shadow-ink-rgb)')
    expect(surfaces).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(surfaces).not.toMatch(/rgba?\(\s*\d/)
  })

  it('restates ink and weight for Latte, because a dark cast is not a light one', () => {
    // Mocha casts in crust, which in Latte is a light grey — a shadow in
    // it would be invisible. The pairing is what needs guarding: an ink
    // changed without its alpha leaves the light theme muddy.
    const latte = block(palette, ':root\\.jitpack-latte', 'jp-shadow-ink-rgb')
    expect(latte, 'Latte does not restate its shadow ink').toBeDefined()
    expect(latte).toContain('--jp-shadow-alpha')
    expect(latte).toContain('--jp-shadow-rim')

    const mocha = block(palette, ':root', 'jp-shadow-ink-rgb')
    expect(mocha).toContain('--jp-shadow-alpha')
  })
})

describe('the radius scale replaced the nine magic numbers (FR-21.8)', () => {
  it('offers five steps and no more', () => {
    // A scale earns its keep by being short enough to choose from. The
    // client had 2/4/7/8/10/12/14/22/999px before this and no rule; nine
    // steps is not a scale, it is nine decisions.
    const steps = surfaces.match(/^\s*--jp-r(?:-[a-z]+)?:/gm) ?? []
    expect(steps).toHaveLength(5)
  })

  it('keeps the card and sheet radii on the prototype values', () => {
    expect(value(surfaces, '--jp-r')).toBe('18px')
    expect(value(surfaces, '--jp-r-lg')).toBe('26px')
  })
})
