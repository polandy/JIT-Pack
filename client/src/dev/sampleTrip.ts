import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import {
  PORTABLE_SCHEMA_VERSION,
  type PortableDocument,
  type PortableItem,
} from '@/domain/portable'
import {
  ITEM_MODE_BUY_BEFORE,
  ITEM_MODE_BUY_LOCAL,
  ITEM_MODE_PACK,
  TASK_PHASE_BEFORE,
  TASK_PHASE_DURING,
} from '@/types/domain'
import { createShoppingActions, useShoppingStore } from '@/shopping'

/**
 * A ready-made trip to test against, for development only.
 *
 * **Not Demo Mode.** That was removed in Addendum v2.10 and is not coming
 * back: it was a *product* surface — a mode a user entered, with its own
 * reset banner and explanation. This is a dev affordance behind
 * `import.meta.env.DEV` **at the import** — the guard that actually prunes it,
 * as opposed to the `v-if` on the button, which for weeks hid the trigger
 * while Rollup kept emitting this module for every instance to download
 * (found 2026-08-16). `scripts/dev-code-gate.mjs` holds it now.
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
 * FR-25.2 reveal bar and the FR-25.17 stamp have something to show. One
 * shopping row is already bought (FR-25.11j), so M6's own reveal has
 * something to show as well — without it the affordance is invisible on a
 * fresh device until somebody buys something.
 */
type Orchestrator = ReturnType<typeof useSyncOrchestrator>

const TRAVELERS = ['Andy', 'Sia', 'Leonardo']

function row(name: string, category: string, over: Partial<PortableItem> = {}): PortableItem {
  return {
    name,
    // FR-28.7: a trip row inherits the master item's mark, so the document
    // that seeds it carries none of its own.
    icon: null,
    quantity: 1,
    tasks: [],
    // The seed links its rows to the inventory through the merge decisions in
    // `seedSampleTrip`, which resolve before this flag is consulted — so it
    // stays neutral here rather than stating a second, weaker truth. Tags
    // likewise belong to the master item `sampleMaster` already filed.
    tags: [],
    from_inventory: false,
    assignment: null,
    dedup: null,
    conditions: null,
    default_mode: null,
    late_packer: false,
    mode: ITEM_MODE_PACK,
    category,
    traveler: null,
    container: null,
    packed_count: 0,
    bought_from: null,
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
    // FR-28.8 is a template field; a trip has no mark of its own.
    icon: null,
    trip_tasks: [],
    // Null rather than a value: the seed's trip becomes active through
    // `activateTrip` below, exactly as it did before the field existed.
    status: null,
    // A trip is the result of a composition, never one (FR-27.1).
    includes: [],
    // The sample trip is typed, not generated: it follows no group, so it
    // carries no FR-27.4 refresh state.
    follows: [],
    generated: [],
    applied_changes: [],
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
        row('Sonnenhut', 'Kleidung', { traveler, mode: ITEM_MODE_BUY_BEFORE }),
      ),
      row('Sonnencreme', 'Bad', { mode: ITEM_MODE_BUY_LOCAL }),
      row('Taschentücher', 'Bad', { quantity: 4, packed_count: 1, late_packer: true }),
      row('Velohelme', 'Aktivität', { quantity: 2, packed_count: 1 }),
      row('Wanderstöcke', 'Aktivität', { traveler: 'Andy' }),
      row('Mehrfach-Stromstecker', 'Technik', { packed_count: 1, container: 'Rucksack' }),
      row('iPad Pro + Tastatur', 'Technik', { traveler: 'Andy', late_packer: true }),
      row('Pass / ID', 'Dokumente', { quantity: 3, packed_count: 3, container: 'Rucksack' }),
      row('Kaffee', 'Küche', { mode: ITEM_MODE_BUY_BEFORE }),
      row('Bouillon · Salz · Pfeffer', 'Küche', { container: 'Küchenkiste' }),
    ],
  }
}

/**
 * Creates the sample trip and returns its id, linking the rows the inventory
 * already has (see below). Set **active**, because the
 * status is what decides whether new rows are flagged *Missing* (FR-9.1)
 * and whether M4 offers the archive action at all — a planning trip
 * exercises neither.
 */
export function seedSampleTrip(
  orchestrator: Orchestrator,
  masterItems: Record<string, string>,
): string {
  // Link every row whose name the inventory already knows. Not cosmetic: a
  // trip row resolves its photo and its FR-28.7 mark through
  // `source_item_id`, so a seed that imported everything as ad-hoc handed a
  // fresh device a packing list on which neither could ever appear.
  const merges = new Map<string, string>()
  for (const item of sampleDocument().items) {
    const id = masterItems[item.name]
    if (id) merges.set(item.name, id)
  }
  const { id } = orchestrator.commitPortableImport(sampleDocument(), merges)
  orchestrator.activateTrip(id)
  buyOneShoppingRow(id, orchestrator)
  seedShoppingEntries(id, orchestrator)
  seedItemComment(id, orchestrator)
  seedTripTodos(id, orchestrator)
  seedPreparations(id, orchestrator)
  return id
}

/**
 * FR-7.4 with FR-7.7's phases: three chores on the trip itself, one already
 * done and one for the road — so M1's *Aufgaben* section shows its open rows
 * and its folded *erledigt* line, and M25 opens with something in both of its
 * sections. Through the orchestrator's own actions, like the comment below.
 */
const SEED_TRIP_TODOS = [
  // FR-7.8: `tag` names one of `sampleMaster`'s task tags, or none — so a
  // fresh device shows the grouping with something in it *and* the two
  // untagged headings, which are the halves a reader has to tell apart.
  { body: 'Briefkasten leeren lassen', phase: TASK_PHASE_BEFORE, tag: 'Haus' },
  { body: 'Kühlschrank leeren', phase: TASK_PHASE_BEFORE, tag: null },
  {
    body: 'Am Bahnhof die Zugverbindung nach Pontresina abklären',
    phase: TASK_PHASE_DURING,
    tag: 'Bahn',
  },
] as const

function seedTripTodos(tripId: string, orchestrator: Orchestrator): void {
  const tags = new Map(useMasterStore().taskTagList.map((tag) => [tag.name, tag.id]))
  for (const { body, phase, tag } of SEED_TRIP_TODOS) {
    const id = orchestrator.addTripTodo(tripId, SEED_AUTHOR_ID, body, phase)
    const tagId = tag === null ? null : (tags.get(tag) ?? null)
    if (tagId === null) continue
    const todo = useTripStore()
      .getTripTodos(tripId)
      .find((row) => row.id === id)
    if (todo) orchestrator.setTaskTag(tripId, todo, tagId)
  }
  const done = useTripStore()
    .getTripTodos(tripId)
    .find((todo) => todo.body === SEED_TRIP_TODOS[1].body)
  if (done) orchestrator.resolveTripTodo(done)
}

/**
 * FR-7.3/7.6: two preparations on one row, so a fresh device's task list
 * shows the item-bound kind — the chip that names its row, and the row badge
 * that counts it — beside the trip's own chores above. Both are for before
 * the trip (FR-7.7), which is what M4's window shows.
 */
const SEED_PREPARED_ROW = 'iPad Pro + Tastatur'
const SEED_PREPARATIONS = ['Akku laden', 'Filme herunterladen'] as const

function seedPreparations(tripId: string, orchestrator: Orchestrator): void {
  const row = useTripStore()
    .getItems(tripId)
    .find((item) => item.name === SEED_PREPARED_ROW)
  if (!row) return
  for (const body of SEED_PREPARATIONS) {
    orchestrator.addPrepTodo(tripId, row.id, SEED_AUTHOR_ID, body)
  }
}

/**
 * One remark on a row that came from the inventory, so FR-27.9's section on
 * M10 has something to aggregate. It has to hang off a row with a
 * `source_item_id` — a comment on an ad-hoc row reaches no item, which is the
 * rule the section is built on.
 */
const SEED_COMMENTED_ROW = 'Wanderstöcke'
const SEED_COMMENT = 'Die Spitzen sind stumpf — vor der nächsten Tour ersetzen'

function seedItemComment(tripId: string, orchestrator: Orchestrator): void {
  const row = useTripStore()
    .getItems(tripId)
    .find((item) => item.name === SEED_COMMENTED_ROW && item.source_item_id !== null)
  if (row) orchestrator.addComment(tripId, row.id, SEED_AUTHOR_ID, SEED_COMMENT)
}

/**
 * The server stamps the real author on insert (invariant 3); in Local Mode
 * nothing does, and the seed's own placeholder is what the M10 section then
 * fails to name — which is the correct Local Mode rendering, not a defect.
 */
const SEED_AUTHOR_ID = 'dev-seed'

/**
 * FR-25.11j: one row is bought before departure, through the same action the
 * screen calls. The portable document could carry `bought_from` since the
 * backup learned it, but a seed that wrote the row directly would be a second
 * way of buying something, which is the one that would drift.
 */
const SEED_BOUGHT_ROW = 'Kaffee'

function buyOneShoppingRow(tripId: string, orchestrator: Orchestrator): void {
  const item = useTripStore()
    .getItems(tripId)
    .find((row) => row.name === SEED_BOUGHT_ROW)
  if (item) orchestrator.buyItem(tripId, item, ITEM_MODE_BUY_BEFORE)
}

/**
 * FR-30.1: groceries typed into the shopping list itself, most under a tag (FR-30.9), one already bought,
 * so M6 shows its own section beside the packing list's buy rows and its
 * reveal holds an entry as well as a packing row. Through the module's own
 * actions, for the reason `buyOneShoppingRow` gives.
 */
const SEED_SHOPPING_ENTRIES = [
  { name: 'Brot', tag: 'Supermarkt' },
  { name: 'Milch', tag: 'Supermarkt' },
  { name: 'Pasta', tag: 'Supermarkt' },
  { name: 'Mückenspray', tag: 'Apotheke' },
  { name: 'Mineralwasser', tag: null },
] as const
const SEED_BOUGHT_ENTRY = 'Mineralwasser'

function seedShoppingEntries(tripId: string, orchestrator: Orchestrator): void {
  const actions = createShoppingActions(orchestrator.moduleHost)
  for (const { name, tag } of SEED_SHOPPING_ENTRIES) {
    actions.addEntry(tripId, ITEM_MODE_BUY_LOCAL, name, tag)
  }
  const bought = useShoppingStore()
    .getEntries(tripId)
    .find((entry) => entry.name === SEED_BOUGHT_ENTRY)
  if (bought) actions.setBought(bought, true)
}

/**
 * A second, *planned* trip, generated from the sample Ferien-Vorlage and
 * registered against it (FR-27.4). The active trip above is imported rather
 * than generated, so it follows nothing and can never show the refresh —
 * since 2026-08-18 that is the reason, not its status. Without this one a dev
 * cannot see a group edit reach a trip, which is the whole feature: edit a
 * position in M8, open the trip, and answer the card it carries.
 */
export function seedPlannedTrip(orchestrator: Orchestrator, vacationTemplateId: string): string {
  return orchestrator.createTripFromWizard({
    name: 'Sommerferien 2027',
    year: 2027,
    startDate: null,
    endDate: null,
    attributes: { season: 'summer' },
    travelers: [{ name: 'Andy' }, { name: 'Sia' }],
    // Deliberately no generated rows, unlike the real M3 path: the refresh
    // fills the trip instead, so the seed demonstrates M2's log as well. The
    // cost is that the log opens with a line per row, which a wizard-created
    // trip never has — there the rows are already on the trip and the first
    // refresh silently adopts them (groupRefresh.spec.ts pins that).
    items: [],
    sourceTemplateIds: [vacationTemplateId],
  })
}
