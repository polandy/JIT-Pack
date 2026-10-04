/**
 * The units an ingredient's amount is written in (FR-33.2, FR-33.14) — one
 * table, read both where *„500 g Hörnli"* is split into name and amount and
 * where the shopping list adds amounts up, so a unit the field takes is
 * always one the list can count. German and English, since the app speaks
 * both; `docs/meal-plan.md` lists them for the reader.
 */

/** What a unit measures: a mass and a volume convert within themselves, anything else only adds to itself. */
export type UnitFamily = 'mass' | 'volume' | 'count' | 'named'

/** A unit, its spellings, and the words a total is written in. */
export interface Unit {
  /** One name per unit, whichever spelling was typed. */
  id: string
  family: UnitFamily
  /** For a mass or volume: how many of the family's base unit (g, ml) one holds. */
  factor: number
  /**
   * Every spelling the field takes, case aside. Each language's own come in
   * pairs — one, then many — which is how a total of a named unit is worded
   * in the language its first part was typed in.
   */
  spellings: readonly string[]
}

function measure(id: string, family: 'mass' | 'volume', factor: number, spellings: string[]): Unit {
  return { id, family, factor, spellings }
}

/** A named unit from its spellings, each pair written as *one many* (`'Glas Gläser'`). */
function named(id: string, ...pairs: string[]): Unit {
  return { id, family: 'named', factor: 1, spellings: pairs.flatMap((pair) => pair.split(' ')) }
}

/** Every unit the field takes. A measure's first spelling is the one its total is written in. */
export const UNITS: readonly Unit[] = [
  measure('mg', 'mass', 0.001, ['mg', 'Milligramm']),
  measure('g', 'mass', 1, ['g', 'Gramm', 'gr', 'gram', 'grams']),
  measure('kg', 'mass', 1000, ['kg', 'Kilo', 'Kilogramm', 'kilogram', 'kilograms']),
  measure('ml', 'volume', 1, ['ml', 'Milliliter', 'millilitre', 'milliliter']),
  measure('cl', 'volume', 10, ['cl', 'Zentiliter']),
  measure('dl', 'volume', 100, ['dl', 'Deziliter']),
  measure('l', 'volume', 1000, ['l', 'Liter', 'litre', 'litres', 'liters']),
  {
    id: 'piece',
    family: 'count',
    factor: 1,
    spellings: ['Stk.', 'Stk', 'Stück', 'piece', 'pieces', 'pc', 'pcs'],
  },
  named('jar', 'Glas Gläser', 'jar jars'),
  named('can', 'Dose Dosen', 'can cans', 'tin tins'),
  named('packet', 'Packung Packungen', 'Pck. Pck', 'pack packs', 'packet packets'),
  named('bottle', 'Flasche Flaschen', 'Fl. Fl', 'bottle bottles'),
  named('bunch', 'Bund Bunde', 'bunch bunches'),
  named('pinch', 'Prise Prisen', 'pinch pinches'),
  named('tbsp', 'EL EL', 'Esslöffel Esslöffel', 'tbsp tbsp'),
  named('tsp', 'TL TL', 'Teelöffel Teelöffel', 'tsp tsp'),
  named('cup', 'Tasse Tassen', 'cup cups'),
  named('tub', 'Becher Becher', 'tub tubs'),
  named('tube', 'Tube Tuben', 'tube tubes'),
  named('clove', 'Zehe Zehen', 'clove cloves'),
  named('slice', 'Scheibe Scheiben', 'slice slices'),
  named('pot', 'Topf Töpfe', 'pot pots'),
  named('bag', 'Beutel Beutel', 'bag bags'),
  named('head', 'Kopf Köpfe', 'head heads'),
  named('stick', 'Stange Stangen', 'stick sticks'),
]

const BY_SPELLING = new Map(
  UNITS.flatMap((unit) =>
    unit.spellings.map((spelling) => [spelling.toLowerCase(), unit] as const),
  ),
)

/** The unit a spelling names, case aside; undefined for one the table does not hold. */
export function unitOf(spelling: string): Unit | undefined {
  return BY_SPELLING.get(spelling.trim().toLowerCase())
}

/**
 * A named unit's total in the words of the spelling it was first typed in —
 * one or many by the value: *1 Glas*, *3 Gläser*, *2 jars*.
 */
export function namedTotal(unit: Unit, firstSpelling: string, value: number): string {
  const index = unit.spellings.findIndex((s) => s.toLowerCase() === firstSpelling.toLowerCase())
  const one = index - (index % 2)
  return value === 1 ? unit.spellings[one]! : unit.spellings[one + 1]!
}

/**
 * Every spelling as a pattern, the longest first so *Packung* is not read as
 * *Pck* and a word that only begins like a unit (*Lauch*, *Glasnudeln*)
 * never loses its start: a unit is taken only when a space follows it.
 */
export const UNIT_PATTERN = [...BY_SPELLING.keys()]
  .sort((a, b) => b.length - a.length)
  .map((spelling) => spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')
