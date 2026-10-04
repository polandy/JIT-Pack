/**
 * FR-33.2/33.14: the units an ingredient's amount is written in — split off
 * the name as it is typed, and added up on the shopping list.
 */
import { describe, expect, it } from 'vitest'

import { sumAmounts } from '../ingredients'
import { parseIngredient } from '../mealPlan'
import { UNITS, unitOf } from '../units'

describe('parseIngredient — the units split off the name (FR-33.2)', () => {
  it.each([
    ['500 g Hörnli', 'Hörnli', '500 g'],
    ['500g Hörnli', 'Hörnli', '500g'],
    ['1,5 kg Kartoffeln', 'Kartoffeln', '1,5 kg'],
    ['500 Gramm Hackfleisch', 'Hackfleisch', '500 Gramm'],
    ['1 Liter Milch', 'Milch', '1 Liter'],
    ['2 dl Rahm', 'Rahm', '2 dl'],
    ['1 Glas Essiggurken', 'Essiggurken', '1 Glas'],
    ['2 Gläser Konfitüre', 'Konfitüre', '2 Gläser'],
    ['1 Topf Basilikum', 'Basilikum', '1 Topf'],
    ['2 Zehen Knoblauch', 'Knoblauch', '2 Zehen'],
    ['1 Becher Joghurt', 'Joghurt', '1 Becher'],
    ['1 Tube Senf', 'Senf', '1 Tube'],
    ['3 Scheiben Brot', 'Brot', '3 Scheiben'],
    ['1 Kopf Salat', 'Salat', '1 Kopf'],
    ['2 Stangen Lauch', 'Lauch', '2 Stangen'],
    ['1 Beutel Reis', 'Reis', '1 Beutel'],
    ['2 EL Öl', 'Öl', '2 EL'],
    ['1 Pck. Backpulver', 'Backpulver', '1 Pck.'],
    ['2 cups flour', 'flour', '2 cups'],
    ['1 can tomatoes', 'tomatoes', '1 can'],
    ['2 tbsp oil', 'oil', '2 tbsp'],
    ['3 cloves garlic', 'garlic', '3 cloves'],
    ['6 Eier', 'Eier', '6'],
    // A word that only starts like a unit is the name.
    ['2 Lauch', 'Lauch', '2'],
    ['1 Glasnudeln', 'Glasnudeln', '1'],
    // A unit nobody listed stays in the name — the amount is the number alone.
    ['2 Kellen Suppe', 'Kellen Suppe', '2'],
  ])('%s → %s, %s', (typed, name, amount) => {
    expect(parseIngredient(typed)).toEqual({ name, amount })
  })
})

describe('unitOf (FR-33.14)', () => {
  it('reads every spelling of a unit as that unit, case aside', () => {
    expect(unitOf('Gläser')).toBe(unitOf('glas'))
    expect(unitOf('jars')).toBe(unitOf('Glas'))
    expect(unitOf('Liter')).toBe(unitOf('l'))
    expect(unitOf('Stk.')).toBe(unitOf('Stück'))
    expect(unitOf('Kellen')).toBeUndefined()
  })

  it('gives no spelling to two units', () => {
    const owners = new Map<string, Set<string>>()
    for (const unit of UNITS) {
      for (const s of unit.spellings) {
        owners.set(s.toLowerCase(), (owners.get(s.toLowerCase()) ?? new Set()).add(unit.id))
      }
    }
    expect([...owners].filter(([, ids]) => ids.size > 1)).toEqual([])
  })
})

describe('sumAmounts across spellings (FR-33.14)', () => {
  it.each<[string, (string | null)[], ReturnType<typeof sumAmounts>]>([
    ['one and many of a unit', ['1 Glas', '2 Gläser'], [{ value: 3, unit: 'Gläser' }]],
    ['one of a unit stays one', ['1 Zehe'], [{ value: 1, unit: 'Zehe' }]],
    ['English, in its own words', ['1 jar', '1 jar'], [{ value: 2, unit: 'jars' }]],
    ['two languages, the first one’s words', ['1 Glas', '1 jar'], [{ value: 2, unit: 'Gläser' }]],
    ['litres written out', ['1 Liter', '5 dl'], [{ value: 1.5, unit: 'l' }]],
    ['grams written out', ['1 Kilo', '500 Gramm'], [{ value: 1.5, unit: 'kg' }]],
    ['pieces in any language', ['2 Stück', '1 piece', '3'], [{ value: 6, unit: '' }]],
    [
      'spoons do not mix',
      ['2 EL', '1 TL'],
      [
        { value: 2, unit: 'EL' },
        { value: 1, unit: 'TL' },
      ],
    ],
    ['an unknown unit with itself', ['2 Kellen', '1 kellen'], [{ value: 3, unit: 'Kellen' }]],
  ])('%s', (_label, amounts, expected) => {
    expect(sumAmounts(amounts)).toEqual(expected)
  })
})
