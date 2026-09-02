// @vitest-environment jsdom
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { routes } from '@/router'
import {
  ITEM_ID_PARAM,
  PATH,
  TRIP_ID_PARAM,
  itemPath,
  seriesPath,
  templatePath,
  tripItemPath,
  tripPath,
  tripSubPath,
} from '@/router/paths'

/**
 * U-9 (design review 2026-09-02). Two things are under test: that the
 * builders spell what the router matches, and that no screen goes back to
 * spelling it itself — the second is what keeps the first true.
 */

/** Every source file that could navigate; `paths.ts` is the declaration. */
const sources = globSync(
  'src/{views,components,router,notifications,dev,composables}/**/*.{vue,ts}',
  {
    cwd: process.cwd(),
  },
)
  .map((path) => path.replace(/\\/g, '/'))
  // A spec asserting that a route resolves has to name the string the
  // router matches; that is the assertion, not a navigation.
  .filter((path) => path !== 'src/router/paths.ts' && !path.includes('__tests__/'))
  .map((path) => ({
    path,
    // Comments name paths to explain them (`TabBar.vue` on `/trips/new`);
    // a sentence is not a navigation.
    source: readFileSync(resolve(process.cwd(), path), 'utf8')
      .replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, ''),
  }))

/**
 * A path written out rather than built. The trailing-slash redirect
 * `'/tabs/'` is the one literal the table keeps: it is an alias for a
 * screen, not a screen.
 */
const RAW_PATH = /(['"`])\/(?:trips|templates|items|tabs|series|master)\/(?!['"]\s*[,)\]}])/

describe('router paths', () => {
  it('builds the paths the route table matches', () => {
    expect(tripPath('t1')).toBe('/trips/t1')
    expect(tripSubPath('t1', 'shopping')).toBe('/trips/t1/shopping')
    expect(tripItemPath('t1', 'i2')).toBe('/trips/t1/items/i2')
    expect(templatePath('tpl')).toBe('/templates/tpl')
    expect(itemPath('i2')).toBe('/items/i2')
    expect(seriesPath('s3')).toBe('/series/s3')
  })

  it('spells the route-table patterns with the same builders', () => {
    const paths = routes.map((route) => route.path)
    expect(paths).toContain(tripPath(TRIP_ID_PARAM))
    expect(paths).toContain(tripSubPath(TRIP_ID_PARAM, 'review'))
    expect(paths).toContain(PATH.dashboard)
  })

  it('resolves every declared path to a route', () => {
    // The PortableImportPage defect in reverse: a constant nothing matches
    // is a navigation that silently does nothing.
    const patterns = routes.map((route) => route.path)
    const aliases = routes.flatMap((route) =>
      typeof route.alias === 'string' ? [route.alias] : [],
    )
    const known = [...patterns, ...aliases].map(
      (pattern) => new RegExp(`^${pattern.replace(/:[A-Za-z]+/g, '[^/]+')}$`),
    )
    const unmatched = Object.entries(PATH).filter(
      ([, path]) => !known.some((pattern) => pattern.test(path)),
    )
    // The gallery exists only in a dev build, where `routes` gained it.
    expect(unmatched.map(([name]) => name)).toEqual(import.meta.env.DEV ? [] : ['devGallery'])
  })

  it('finds the sources to check at all', () => {
    // A glob that matches nothing would make the rule below vacuous.
    expect(sources.length).toBeGreaterThan(40)
  })

  it('leaves no screen navigating by a written-out path', () => {
    const offenders = sources.flatMap(({ path, source }) =>
      source
        .split('\n')
        .map((line, index) => (RAW_PATH.test(line) ? `${path}:${index + 1}` : null))
        .filter((hit): hit is string => hit !== null),
    )
    expect(offenders).toEqual([])
  })

  it('leaves the Playwright suite navigating by the same constants (T-11)', () => {
    // Only `goto` — a case asserting `toHaveURL('/tabs/items')` is
    // checking where the app went, which is the assertion itself.
    const specs = globSync('e2e/**/*.ts', { cwd: process.cwd() }).map((path) => ({
      path,
      source: readFileSync(resolve(process.cwd(), path), 'utf8'),
    }))
    expect(specs.length).toBeGreaterThan(40)
    const offenders = specs.flatMap(({ path, source }) =>
      source
        .split('\n')
        .map((line, index) => (/goto\(['`]\/[a-z]/.test(line) ? `${path}:${index + 1}` : null))
        .filter((hit): hit is string => hit !== null),
    )
    expect(offenders).toEqual([])
  })

  it('accepts the parameters the router itself uses', () => {
    expect(tripItemPath(TRIP_ID_PARAM, ITEM_ID_PARAM)).toBe('/trips/:tripId/items/:itemId')
  })
})
