import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import {
  PORTABLE_SCHEMA_VERSION,
  type PortableDocument,
  type PortableItem,
} from '@/domain/portable'

/**
 * A ready-made trip to test against, for development only.
 *
 * **Not Demo Mode.** That was removed in Addendum v2.10 and is not coming
 * back: it was a *product* surface — a mode a user entered, with its own
 * reset banner and explanation. This is a dev affordance behind
 * `import.meta.env.DEV`, so the module and its trigger drop out of a
 * production build entirely; nobody running an instance can reach it.
 *
 * It lands through **the M18 portable-import path** (FR-18.4) rather than
 * a creation path of its own. A second way of building a trip is a second
 * thing to keep correct, and it would be the one nobody notices breaking.
 *
 * The data is what is tedious to produce by hand on a fresh install and
 * what the packing screen actually needs to be exercised: several
 * categories for the grouping and the Kategorie facet, both buy modes for
 * Beschaffung and the shopping list, a late packer, two per-person items
 * that render as clusters (FR-25.1), and rows already packed so the
 * FR-25.2 reveal bar and the FR-25.17 stamp have something to show.
 */
type Orchestrator = ReturnType<typeof useSyncOrchestrator>

const TRAVELERS = ['Andy', 'Sia', 'Leonardo']

function row(name: string, category: string, over: Partial<PortableItem> = {}): PortableItem {
  return {
    name,
    quantity: 1,
    assignment: null,
    dedup: null,
    conditions: null,
    default_mode: null,
    late_packer: false,
    mode: 'pack',
    category,
    traveler: null,
    container: null,
    packed_count: 0,
    ...over,
  }
}

/** Today plus `days`, as `YYYY-MM-DD`. */
function isoDay(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function sampleDocument(): PortableDocument {
  return {
    kind: 'trip',
    schema_version: PORTABLE_SCHEMA_VERSION,
    name: 'Samedan Sommer (Beispiel)',
    year: new Date().getFullYear(),
    start_date: isoDay(-2),
    end_date: isoDay(12),
    travelers: TRAVELERS.map((name) => ({ name })),
    containers: [
      { name: 'Koffer', carrier: 'Andy', max_weight_grams: 23000 },
      { name: 'Rucksack', carrier: 'Sia', max_weight_grams: null },
      { name: 'Küchenkiste', carrier: null, max_weight_grams: null },
    ],
    items: [
      row('Wandersocken', 'Kleidung', { quantity: 6, packed_count: 4, container: 'Koffer' }),
      // Per-person: one row each, so M4 shows a named cluster.
      ...TRAVELERS.map((traveler) => row('Regenjacke', 'Kleidung', { traveler })),
      ...['Sia', 'Leonardo'].map((traveler) =>
        row('Sonnenhut', 'Kleidung', { traveler, mode: 'buy_before' }),
      ),
      row('Sonnencreme', 'Bad', { mode: 'buy_local' }),
      row('Taschentücher', 'Bad', { quantity: 4, packed_count: 1, late_packer: true }),
      row('Velohelme', 'Aktivität', { quantity: 2, packed_count: 1 }),
      row('Wanderstöcke', 'Aktivität', { traveler: 'Andy' }),
      row('Mehrfach-Stromstecker', 'Technik', { packed_count: 1, container: 'Rucksack' }),
      row('iPad Pro + Tastatur', 'Technik', { traveler: 'Andy', late_packer: true }),
      row('Pass / ID', 'Dokumente', { quantity: 3, packed_count: 3, container: 'Rucksack' }),
      row('Kaffee', 'Küche', { mode: 'buy_before' }),
      row('Bouillon · Salz · Pfeffer', 'Küche', { container: 'Küchenkiste' }),
    ],
  }
}

/**
 * Creates the sample trip and returns its id. Set **active**, because the
 * status is what decides whether new rows are flagged *Missing* (FR-9.1)
 * and whether M4 offers the archive action at all — a planning trip
 * exercises neither.
 */
export function seedSampleTrip(orchestrator: Orchestrator): string {
  const { id } = orchestrator.commitPortableImport(sampleDocument(), new Map())
  orchestrator.activateTrip(id)
  return id
}
