/**
 * Typography (Addendum FR-21.5/FR-21.6, UI-Spec G-13).
 *
 * These assert the stylesheet as a *source file*, not as rendered CSS —
 * jsdom neither loads @font-face nor resolves custom properties, and the
 * rendered end of it is covered by e2e/typography.spec.ts. What is worth
 * guarding here is the property nobody notices breaking: FR-21.6 says the
 * faces are self-hosted, and the one-line regression is somebody pasting
 * the prototype's Google Fonts URL back in. That reintroduces a
 * third-party request on every boot and leaves Local Mode — which may
 * have no network at all — rendering in a fallback face.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

// Read, not imported: Vitest stubs CSS imports (and `?raw` with them), so
// an import would assert against an empty string and pass forever.
// `process.cwd()` is Vitest's configured root — the client directory.
const css = readFileSync(resolve(process.cwd(), 'src/theme/typography.css'), 'utf8')

const faceBlocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? []

describe('typography.css', () => {
  it('declares both faces in both subsets (FR-21.6)', () => {
    // latin-ext is not decoration: the German catalogue needs it.
    expect(faceBlocks).toHaveLength(4)
    for (const family of ['Fraunces', 'Hanken Grotesk']) {
      for (const subset of ['latin', 'latin-ext']) {
        const slug = family.toLowerCase().replace(/ /g, '-')
        expect(css).toContain(`../assets/fonts/${slug}-${subset}.woff2`)
      }
    }
  })

  it('loads every face from the bundle, never from a remote host (FR-21.6)', () => {
    for (const block of faceBlocks) {
      expect(block).toMatch(/src:\s*url\('\.\.\/assets\/fonts\//)
      expect(block).not.toMatch(/https?:/)
    }
    expect(css).not.toContain('fonts.googleapis.com')
    expect(css).not.toContain('fonts.gstatic.com')
  })

  it('gives every face a swap policy so text is never invisible', () => {
    for (const block of faceBlocks) {
      expect(block).toContain('font-display: swap')
    }
  })

  it('routes Ionic through the UI face rather than the platform stack (FR-21.5)', () => {
    expect(css).toMatch(/--ion-font-family:\s*var\(--jp-font-ui\)/)
  })

  it('keeps the display roles on the display face and the scale tokens', () => {
    for (const role of ['.jp-page-title', '.jp-hero-title', '.jp-sheet-title']) {
      const block = new RegExp(`\\${role}\\s*\\{[^}]*\\}`).exec(css)?.[0]
      expect(block, `${role} is missing`).toBeDefined()
      expect(block).toContain('font-family: var(--jp-font-display)')
      expect(block).toMatch(/font-size:\s*var\(--jp-text-display-/)
    }
  })

  it('keeps every raw font size in the token block, not in the roles', () => {
    // The point of the scale: PR 3's token gate can then reject bare px
    // everywhere else in client/src. A role that hard-codes 34px would
    // quietly recreate the magic numbers this file exists to retire.
    const roleSection = css.slice(css.indexOf('.jp-page-title'))
    expect(roleSection).not.toMatch(/font-size:\s*\d/)
  })
})
