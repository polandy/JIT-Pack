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
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

// Read, not imported: Vitest stubs CSS imports (and `?raw` with them), so
// an import would assert against an empty string and pass forever.
// `process.cwd()` is Vitest's configured root — the client directory.
const css = readFileSync(resolve(process.cwd(), 'src/theme/typography.css'), 'utf8')

const faceBlocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? []

describe('typography.css', () => {
  it('declares both text faces in both subsets (FR-21.6)', () => {
    // latin-ext is not decoration: the German catalogue needs it. The fifth
    // block is the mark face (FR-28.6), self-hosted for the same reason and
    // asserted on its own below.
    expect(faceBlocks).toHaveLength(5)
    for (const family of ['Fraunces', 'Hanken Grotesk']) {
      for (const subset of ['latin', 'latin-ext']) {
        const slug = family.toLowerCase().replace(/ /g, '-')
        expect(css).toContain(`../assets/fonts/${slug}-${subset}.woff2`)
      }
    }
  })

  // FR-28.6: the emoji face is self-hosted for a reason the text faces do not
  // have — a packing list is shared, and on platform emoji the sender and the
  // reader would be looking at different pictures for the same row.
  it('serves the mark face itself, subsetted to the curated index (FR-28.6)', () => {
    const mark = faceBlocks.find((block) => block.includes("'JP Marks'"))
    expect(mark).toBeDefined()
    expect(mark).toContain('../assets/fonts/noto-emoji-marks.woff2')
    // The range is what keeps the face from being fetched for ordinary text.
    expect(mark).toMatch(/unicode-range:\s*U\+/)
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

describe('the views do not decide type for themselves (G-13)', () => {
  // The rule G-13 states, asserted rather than trusted: a screen applies a
  // role, it does not pick a family or restate what a role already says.
  // Both halves of this had a real violation when it was written —
  // QuantityStepper carried its own tabular-figures rule, so `.jp-num`
  // and the component disagreed about who owns it.
  const vueFiles = globSync('src/**/*.vue', { cwd: process.cwd() })

  it('finds the views to check at all', () => {
    // Without this the two assertions below pass on an empty list.
    expect(vueFiles.length).toBeGreaterThan(20)
  })

  it('never names a face outside the token table', () => {
    for (const file of vueFiles) {
      for (const decl of readFileSync(file, 'utf8').match(/font-family:[^;}]*/g) ?? []) {
        expect(decl, `${file} names a family directly`).toContain('var(--jp-font-')
      }
    }
  })

  it('leaves tabular figures to .jp-num', () => {
    for (const file of vueFiles) {
      expect(readFileSync(file, 'utf8'), `${file} restates .jp-num`).not.toContain(
        'font-variant-numeric',
      )
    }
  })
})

describe('the scale carries the views now (FR-21.5)', () => {
  const vueFiles = globSync('src/**/*.vue', { cwd: process.cwd() })

  it('gives icons their own table, because a glyph box is not a text size', () => {
    // `font-size` on an `ion-icon` sizes the glyph, not type. Sharing the
    // text scale would have made a 64px empty-state illustration read as a
    // heading, and any later change to body copy would silently resize
    // every icon with it.
    const steps = css.match(/^\s*--jp-icon-[a-z0-9]+:/gm) ?? []
    expect(steps).toHaveLength(6)
    expect(css).toMatch(/--jp-icon-2xl:\s*64px/)
  })

  it('grew the step the views actually needed rather than rounding them up', () => {
    // Seven sites (two badges, an avatar's initials and its tick, two
    // counts and a prep marker) sat below 11px with nowhere to go. A size the table does not have is a signal
    // about the table — that is the whole reason a scale is reviewed.
    expect(css).toMatch(/--jp-text-3xs:\s*10px/)
  })

  it('names the section label once, where eleven screens had written it out', () => {
    // Nine carried it as a 16px semibold line, two as the uppercase label
    // the prototype actually specifies. The role now owns face, size,
    // weight, tracking, case and colour, so a `.section-title` rule may
    // carry nothing but its own spacing.
    expect(css).toMatch(/\.jp-eyebrow\s*\{[^}]*text-transform:\s*uppercase/)

    for (const file of vueFiles) {
      const rule = /\.section-title\s*\{([^}]*)\}/.exec(readFileSync(file, 'utf8'))?.[1]
      if (!rule) continue
      const props = [...rule.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1])
      expect(props, `${file} restates the eyebrow role instead of applying it`).toEqual(['margin'])
    }
  })

  it('applies the role wherever it claims the class', () => {
    // The pairing is what rots: a tenth section title added later would
    // get the local class for its margin and quietly render as body copy,
    // which no token assertion notices.
    for (const file of vueFiles) {
      const source = readFileSync(file, 'utf8')
      for (const m of source.matchAll(/class="([^"]*\bsection-title\b[^"]*)"/g)) {
        expect(m[1], `${file} uses .section-title without the role`).toContain('jp-eyebrow')
      }
    }
  })
})
