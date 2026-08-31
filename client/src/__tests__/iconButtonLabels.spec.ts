/**
 * UX-13 (review 2026-08-25) — an icon-only control carries an accessible
 * name. The app bars had grown unlabeled glyphs faster than any per-screen
 * case could chase them, so the rule is asserted over the *source*, the way
 * markRendering.spec.ts confines the mark face: a button whose body renders
 * no text must declare `aria-label` on its opening tag. A `title` alone is
 * not accepted — it is a tooltip, and whether it becomes the accessible
 * name depends on the browser's fallback rather than on this codebase.
 *
 * **The `title` half is the app bar's alone (owner, 2026-08-31).** G-12 asked
 * for a tooltip on every icon-only control instance-wide; measured, 9 of 62
 * carried one, and the rule narrowed to the bars rather than the attribute
 * spreading to 53 more call sites. The bar is where the labels were dropped
 * to buy room, so it is where the name has to stay retrievable — everywhere
 * else an icon sits beside the text it belongs to.
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

function offendersIn(source: string, tag: string, attribute = 'aria-label'): number[] {
  const lines: number[] = []
  const open = new RegExp(`<${tag}(?![\\w-])`, 'g')
  for (let m = open.exec(source); m; m = open.exec(source)) {
    const tagEnd = source.indexOf('>', m.index)
    const openTag = source.slice(m.index, tagEnd)
    // Matched as an attribute, never as a substring: the settings gear's
    // `:aria-label="t('settings.title')"` contains the word `title` and
    // would otherwise satisfy the tooltip rule by accident.
    if (new RegExp(`[\\s:]${attribute}=`).test(openTag)) continue
    const close = source.indexOf(`</${tag}>`, tagEnd)
    // A self-closing or unclosed match renders nothing to name itself with.
    const body = close >= 0 ? source.slice(tagEnd + 1, close) : ''
    if (rendersText(body)) continue
    lines.push(source.slice(0, m.index).split('\n').length)
  }
  return lines
}

/**
 * The app bar's own markup, plus every component slotted into it — resolved
 * from `AppHeader`'s toolbar rather than listed, so a control added to the
 * bar tomorrow is covered without anyone remembering this file.
 */
function appBarSources(): { path: string; source: string }[] {
  const header = views.find((v) => v.path.endsWith('components/global/AppHeader.vue'))
  if (!header) return []
  const start = header.source.indexOf('<IonToolbar')
  const end = header.source.indexOf('</IonToolbar>')
  const bar = header.source.slice(start, end)
  const slotted = [...new Set([...bar.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]))]
  return [
    { path: `${header.path} (toolbar)`, source: bar },
    ...views.filter(({ path }) => slotted.some((tag) => path.endsWith(`/${tag}.vue`))),
  ]
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

  it('resolves the app bar and what is slotted into it', () => {
    // Without this, an empty bar set makes the tooltip rule vacuous.
    const bar = appBarSources()
    expect(bar.map(({ path }) => path)).toContain('src/components/global/AppHeader.vue (toolbar)')
    expect(bar.length).toBeGreaterThan(1)
  })

  it('leaves no icon-only button in the app bar without a title (G-12)', () => {
    const offenders = appBarSources().flatMap(({ path, source }) =>
      BUTTON_TAGS.flatMap((tag) =>
        offendersIn(source, tag, 'title').map((line) => `${path}:${line}`),
      ),
    )
    expect(offenders).toEqual([])
  })
})
