/**
 * UX-13 (review 2026-08-25) — an icon-only control carries an accessible
 * name. The app bars had grown unlabeled glyphs faster than any per-screen
 * case could chase them, so the rule is asserted over the *source*, the way
 * markRendering.spec.ts confines the mark face: a button whose body renders
 * no text must declare `aria-label` on its opening tag. A `title` alone is
 * not accepted — it is a tooltip, and whether it becomes the accessible
 * name depends on the browser's fallback rather than on this codebase.
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

/** The button-shaped elements the rule covers, host and native alike. */
const BUTTON_TAGS = ['IonButton', 'IonFabButton', 'IonTabButton', 'button']

const views = globSync('src/{views,components}/**/*.vue', { cwd: process.cwd() }).map((path) => ({
  path: path.replace(/\\/g, '/'),
  source: readFileSync(resolve(process.cwd(), path), 'utf8').replace(/<!--[\s\S]*?-->/g, ''),
}))

/** True when the element body renders text of its own — a literal, or a
 *  `{{ … }}` binding. Icons and badges do not name a control. */
function rendersText(body: string): boolean {
  const withoutBadges = body.replace(/<IonBadge[\s\S]*?<\/IonBadge>/g, '')
  const text = withoutBadges.replace(/<[^>]*>/g, '')
  return /\{\{[\s\S]*?\}\}/.test(text) || text.replace(/\s/g, '').length > 0
}

function offendersIn(source: string, tag: string): number[] {
  const lines: number[] = []
  const open = new RegExp(`<${tag}(?![\\w-])`, 'g')
  for (let m = open.exec(source); m; m = open.exec(source)) {
    const tagEnd = source.indexOf('>', m.index)
    const openTag = source.slice(m.index, tagEnd)
    if (openTag.includes('aria-label')) continue
    const close = source.indexOf(`</${tag}>`, tagEnd)
    // A self-closing or unclosed match renders nothing to name itself with.
    const body = close >= 0 ? source.slice(tagEnd + 1, close) : ''
    if (rendersText(body)) continue
    lines.push(source.slice(0, m.index).split('\n').length)
  }
  return lines
}

describe('every icon-only button names itself (UX-13)', () => {
  it('finds the views to check at all', () => {
    // A glob that silently matches nothing would make everything below pass.
    expect(views.length).toBeGreaterThan(20)
  })

  it('leaves no icon-only button without an aria-label', () => {
    const offenders = views.flatMap(({ path, source }) =>
      BUTTON_TAGS.flatMap((tag) => offendersIn(source, tag).map((line) => `${path}:${line}`)),
    )
    expect(offenders).toEqual([])
  })
})
