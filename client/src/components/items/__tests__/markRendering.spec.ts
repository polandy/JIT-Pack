/**
 * FR-28.5 — the mark is content, and the mark face is the one exception to
 * invariant 9. Confining it to two components is what keeps that exception
 * from becoming a second, unreviewed palette spread across the UI.
 *
 * Read as source files, the same way typography.spec.ts guards the faces:
 * what is asserted is that no *other* screen paints an emoji, which no
 * rendered test of one screen can see.
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

/** The two components that are allowed to paint a mark, and why. */
const MARK_OWNERS = [
  'src/components/items/ItemMark.vue', // the ladder (FR-28.4)
  'src/components/items/MarkPicker.vue', // the picker's own tiles (FR-28.2)
]

const views = globSync('src/{views,components}/**/*.vue', { cwd: process.cwd() })
  .filter((path) => !MARK_OWNERS.includes(path.replace(/\\/g, '/')))
  .map((path) => ({ path, source: readFileSync(resolve(process.cwd(), path), 'utf8') }))

describe('the mark stays inside its own components (FR-28.5)', () => {
  it('finds the views to check at all', () => {
    // A glob that silently matches nothing would make everything below pass.
    expect(views.length).toBeGreaterThan(20)
  })

  it('lets no other view apply the mark face', () => {
    const offenders = views
      .filter(({ source }) => source.includes('jp-mark') || source.includes('--jp-font-marks'))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('lets no other view render an icon value as text', () => {
    // `{{ item.icon }}` anywhere else is a screen deciding the ladder for
    // itself — the thing ItemMark exists to prevent.
    const offenders = views
      .filter(({ source }) => /\{\{[^}]*\bicon\b[^}]*\}\}/.test(source))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })
})
