import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  ITEM_MODES,
  ITEM_MODE_BUY_BEFORE,
  ITEM_MODE_BUY_LOCAL,
  ITEM_MODE_PACK,
  SHOPPING_MODES,
  isShoppingMode,
  toItemMode,
} from '@/types/domain'

/**
 * U-7b (design review 2026-09-02). `TripStatus` had named values and
 * `ItemMode` did not, so `pack` was compared against by hand in four dozen
 * places. Two things are under test: that the vocabulary narrows an unknown
 * the way both importers need, and that no file goes back to spelling it —
 * the second is what keeps the first the only copy.
 */

/** Every source file that could carry a mode; `domain.ts` is the declaration. */
const sources = globSync('src/**/*.{vue,ts}', { cwd: process.cwd() })
  .map((path) => path.replace(/\\/g, '/'))
  // A fixture spelling `mode: 'pack'` *is* the specification of the value,
  // the way a spec asserting a route resolves has to name the route.
  .filter((path) => path !== 'src/types/domain.ts' && !path.includes('__tests__/'))
  .map((path) => ({
    path,
    source: readFileSync(resolve(process.cwd(), path), 'utf8')
      .replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, ''),
  }))

/**
 * A mode written out rather than named. Two shapes are not a mode and are
 * excluded by what they are, not by which file they sit in: a Vue event name
 * (`emit('pack', …)`, `@pack="…"`) and an attribute value (`class="pack"`,
 * `data-testid="m5-pack"`) are *names*, and renaming either would not change
 * a single mode a row can carry.
 */
const MODE_LITERAL = /(['"])(pack|buy_before|buy_local)\1/
const NOT_A_MODE = /\$?emit\(\s*['"]pack['"]|@pack\s*=|=\s*"[\w-]*pack"/g

describe('the item-mode vocabulary (§4a)', () => {
  it('names every mode the union spells, in packing order', () => {
    expect(ITEM_MODES).toEqual([ITEM_MODE_PACK, ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL])
    expect(SHOPPING_MODES).toEqual([ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL])
  })

  it('says a procured row is procured and a packed one is not', () => {
    expect(isShoppingMode(ITEM_MODE_BUY_BEFORE)).toBe(true)
    expect(isShoppingMode(ITEM_MODE_BUY_LOCAL)).toBe(true)
    expect(isShoppingMode(ITEM_MODE_PACK)).toBe(false)
    expect(isShoppingMode('someday')).toBe(false)
    expect(isShoppingMode(null)).toBe(false)
  })

  it('narrows a value from a file, and refuses one outside the vocabulary', () => {
    expect(toItemMode('buy_local')).toBe(ITEM_MODE_BUY_LOCAL)
    expect(toItemMode(ITEM_MODE_PACK)).toBe(ITEM_MODE_PACK)
    expect(toItemMode('sometimes')).toBeNull()
    expect(toItemMode(undefined)).toBeNull()
    expect(toItemMode(1)).toBeNull()
  })

  it('finds the sources to check at all', () => {
    // A glob that matches nothing would make the rule below vacuous.
    expect(sources.length).toBeGreaterThan(200)
  })

  it('leaves no file spelling a mode instead of naming it', () => {
    const offenders = sources.flatMap(({ path, source }) =>
      source
        .split('\n')
        // The two shapes are *removed* rather than used to skip the line: a
        // skip would let a real mode ride along on a line that also emits.
        .map((line, index) =>
          MODE_LITERAL.test(line.replace(NOT_A_MODE, '')) ? `${path}:${index + 1}` : null,
        )
        .filter((hit): hit is string => hit !== null),
    )
    expect(offenders).toEqual([])
  })
})
