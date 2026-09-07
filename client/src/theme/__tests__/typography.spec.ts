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

  it('sets buttons and segment labels in sentence case, not Material capitals (ADR-049)', () => {
    const block = /^ion-button,\s*\n?ion-segment-button\s*\{([^}]*)\}/m.exec(css)?.[1]
    expect(block, 'no ion-button/ion-segment-button rule').toBeDefined()
    expect(block).toContain('text-transform: none')
    expect(block).toContain('letter-spacing: normal')
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

  it('names the section head once, with its counter beside it (G-13)', () => {
    // Fifty-five heads across twelve screens carried `.section-title
    // jp-eyebrow`. The role decided everything except the margin, and the
    // margin is exactly what each screen then wrote for itself — in five
    // different values. Both halves live in one place now: the type here,
    // the spacing in SectionHead.vue.
    const head = /\.jp-section-head\s*\{([^}]*)\}/.exec(css)?.[1]
    expect(head, 'typography.css defines no .jp-section-head role').toBeTruthy()
    expect(head).toContain('font-family: var(--jp-font-display)')
    expect(head).toMatch(/font-size:\s*var\(--jp-text-display-/)

    // The count is the head's number, not its voice: UI face, recessive,
    // and tabular so a figure that changes in place cannot shift the
    // baseline it sits on.
    const count = /\.jp-section-count\s*\{([^}]*)\}/.exec(css)?.[1]
    expect(count, 'typography.css defines no .jp-section-count role').toBeTruthy()
    expect(count).toContain('font-family: var(--jp-font-ui)')
    expect(count).toContain('font-variant-numeric: tabular-nums')
    expect(count).toMatch(/color:\s*var\(--ct-/)
  })

  it('leaves the eyebrow the job it is drawn for — a label inside a list', () => {
    // The class kept its capitals but lost the heads: what still claims it
    // is a marker within dense content (the inventory's letter head, the
    // quick-add chip groups, the word above a banner's sentence).
    expect(css).toMatch(/\.jp-eyebrow\s*\{[^}]*text-transform:\s*uppercase/)
    for (const file of vueFiles) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} pairs the eyebrow with a section-title rule`).not.toContain(
        'section-title',
      )
    }
  })

  it("names the head's second line once, with its colour (G-9, ADR-050)", () => {
    // The meta line is a role rather than a size a component picks, and its
    // recessive colour is part of it for the same reason the eyebrow's is: a
    // subordinate line that is not recessive stops being subordinate. Four
    // screens used to state this fact inside the title string instead.
    const rule = /\.jp-meta\s*\{([^}]*)\}/.exec(css)?.[1]
    expect(rule, 'typography.css defines no .jp-meta role').toBeTruthy()
    expect(rule).toMatch(/color:\s*var\(--ct-subtext0\)/)
    expect(rule).toMatch(/font-size:\s*var\(--jp-text-/)
  })

  it('retires the role whose one screen gave it up (ADR-050)', () => {
    // `.jp-screen-title` existed for M4's in-content name and nothing else.
    // The head uses `.jp-page-title`; a role left defined with no user is a
    // second answer to a question the table is supposed to answer once.
    expect(css).not.toContain('.jp-screen-title')
    for (const file of vueFiles) {
      expect(readFileSync(file, 'utf8'), `${file} still claims .jp-screen-title`).not.toContain(
        'jp-screen-title',
      )
    }
  })

  it('asks for no italic, because the bundle ships none (FR-21.6)', () => {
    // The concept sets the hero's eyebrow in Fraunces *italic*. Upright is
    // what ships: an italic is a second pair of files beside the roman's
    // 126 KB, on every boot, in every mode, for one line. What makes the
    // decision cost nothing to hold is this — a later `font-style: italic`
    // would not fail, it would *synthesise*, and a slanted Fraunces looks
    // enough like the real thing to survive a screenshot.
    expect(faceBlocks.every((block) => block.includes('font-style: normal'))).toBe(true)
    for (const file of [...vueFiles, 'src/theme/typography.css']) {
      expect(readFileSync(file, 'utf8'), `${file} asks for an italic nothing ships`).not.toMatch(
        /font-style:\s*(italic|oblique)/,
      )
    }
  })

  it("sizes the list row's two lines from this table, not from Ionic (FR-21.14)", () => {
    // The app's body copy was the one text the scale did not carry: Ionic
    // sets `ion-label h2` at 16px, `h3` at 14px and `p` at 14px.
    const row = /ion-label\[class\] h2,\s*\nion-label\[class\] h3 \{([^}]*)\}/.exec(css)?.[1]
    expect(row, 'typography.css sizes no list row').toBeTruthy()
    expect(row).toContain('font-size: var(--jp-text-md)')
    expect(row).toContain('font-weight: var(--jp-weight-semibold)')

    const detail = /ion-label\[class\] p \{([^}]*)\}/.exec(css)?.[1]
    expect(detail).toContain('font-size: var(--jp-text-sm)')

    // The body's own size, which the browser had been deciding at 16px.
    const body = /\nbody \{([^}]*)\}/.exec(css)?.[1]
    expect(body).toContain('font-size: var(--jp-text-md)')
  })

  it('keeps the attribute that makes those rules apply at all (FR-21.14)', () => {
    // `ion-label` is a *scoped* Ionic component, so its own rules arrive as
    // `.sc-ion-label-md-s h3` — one class more specific than a bare
    // `ion-label h3`, which therefore never applies. Dropping `[class]` is
    // the tidying edit that would silently put every row back on Ionic's
    // sizes, and nothing but a rendered pixel would say so (E2E-G13-06
    // goes red on both browsers under exactly that edit).
    for (const selector of css.match(/^ion-label[^{]*/gm) ?? []) {
      expect(selector, `${selector.trim()} would lose to Ionic's own rule`).toContain('[class]')
    }
  })

  it('gives the hero eyebrow the display face in the brand (FR-21.13)', () => {
    const rule = /\.jp-hero-eyebrow\s*\{([^}]*)\}/.exec(css)?.[1]
    expect(rule, 'typography.css defines no .jp-hero-eyebrow role').toBeTruthy()
    expect(rule).toContain('font-family: var(--jp-font-display)')
    expect(rule).toContain('color: var(--jp-brand)')
  })

  it('renders every section head through the one component', () => {
    // What rots is the pairing: a screen that writes the class by hand gets
    // the type and loses the spacing and the counter slot with it, and no
    // token assertion notices. The role is claimed in exactly one file.
    const claimants = vueFiles.filter((file) =>
      readFileSync(file, 'utf8').includes('jp-section-head'),
    )
    expect(claimants).toEqual(['src/components/global/SectionHead.vue'])
  })
})
