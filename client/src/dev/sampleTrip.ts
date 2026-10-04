import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { localIsoDate } from '@/domain/trips'
import { readTrack } from '@/domain/track'
import {
  PORTABLE_SCHEMA_VERSION,
  type PortableDocument,
  type PortableItem,
} from '@/domain/portable'
import {
  ITEM_MODE_BUY_BEFORE,
  ITEM_MODE_BUY_LOCAL,
  IDEA_STATE_DROPPED,
  IDEA_STATE_SHORTLISTED,
  IDEA_VOTE_UP,
  ITEM_MODE_PACK,
  MEAL_KIND_COOK,
  MEAL_KIND_OUT,
  TASK_PHASE_BEFORE,
  TASK_PHASE_DURING,
  type Excursion,
  type Idea,
  type IdeaState,
  type IdeaTag,
  type MealSlot,
} from '@/types/domain'
import { createPlannerActions, usePlannerStore, voteTally } from '@/planner'
import { samplePicture } from './samplePictures'
import { SAMPLE_EXCURSION_ROUTE, SAMPLE_ROUTES, sampleGpx } from './sampleTracks'
import { createShoppingActions, useShoppingStore } from '@/shopping'
import { createMealActions, useMealStore } from '@/meals'

/**
 * A ready-made trip to test against, for development only.
 *
 * **Not Demo Mode.** That was removed in Addendum v2.10 and is not coming
 * back: it was a *product* surface — a mode a user entered, with its own
 * reset banner and explanation. This is a dev affordance behind
 * `import.meta.env.DEV` **at the import** — the guard that actually prunes it,
 * as opposed to a `v-if` on the button, which hides the trigger while Rollup
 * keeps emitting this module for every instance to download.
 * `scripts/dev-code-gate.mjs` holds it.
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

/** Today plus `days` as a local calendar day — what a due date is (FR-7.11). */
function localDay(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localIsoDate(date.getTime())
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
  seedTripNotes(id, orchestrator)
  seedExcursions(id, orchestrator)
  seedIdeas(id, orchestrator)
  seedMeals(id, orchestrator)
  return id
}

/** One meal of the seed: its day from today, its slot, its dish and its ingredients. */
interface SeedMeal {
  day: number
  slot: MealSlot
  title: string
  out?: string
  /** The picnic goes on the hut tour (FR-33.6). */
  hut?: boolean
  ingredients?: { name: string; amount: string; bought?: boolean }[]
}

/**
 * §3.33: M31 opens on a plan worth reading — yesterday's dinner folded above,
 * today's lunch eaten out and dinner half bought, tomorrow's breakfast and the
 * picnic taken on the hut tour, and a dinner after it with nothing bought.
 */
export const SEED_MEALS: SeedMeal[] = [
  {
    day: -1,
    slot: 'dinner',
    title: 'Spaghetti Bolognese',
    ingredients: [
      { name: 'Spaghetti', amount: '500 g', bought: true },
      { name: 'Hackfleisch', amount: '400 g', bought: true },
    ],
  },
  { day: 0, slot: 'lunch', title: 'Pizza im Dorf', out: 'Pizzeria Mulin, Pontresina' },
  {
    day: 0,
    slot: 'dinner',
    title: 'Raclette',
    ingredients: [
      { name: 'Raclettekäse', amount: '600 g', bought: true },
      { name: 'Kartoffeln', amount: '1 kg' },
      { name: 'Essiggurken', amount: '1 Glas' },
      { name: 'Silberzwiebeln', amount: '1 Glas', bought: true },
    ],
  },
  {
    day: 1,
    slot: 'breakfast',
    title: 'Zmorge',
    ingredients: [
      { name: 'Zopf', amount: '1' },
      { name: 'Butter', amount: '250 g' },
      { name: 'Konfitüre', amount: '1 Glas' },
    ],
  },
  {
    day: 1,
    slot: 'lunch',
    title: 'Picknick auf der Hütte',
    hut: true,
    ingredients: [
      { name: 'Bürli', amount: '4' },
      { name: 'Salami', amount: '1' },
      { name: 'Äpfel', amount: '4' },
    ],
  },
  {
    day: 2,
    slot: 'dinner',
    title: 'Älplermagronen',
    ingredients: [
      { name: 'Hörnli', amount: '500 g' },
      { name: 'Kartoffeln', amount: '400 g' },
      { name: 'Rahm', amount: '2 dl' },
      { name: 'Bergkäse', amount: '200 g' },
    ],
  },
]

function seedMeals(tripId: string, orchestrator: Orchestrator): void {
  const mealStore = useMealStore()
  const actions = createMealActions(orchestrator.moduleHost, mealStore)
  const hut = useTripStore()
    .getExcursions(tripId)
    .find((excursion) => excursion.starts_on !== null)
  for (const seed of SEED_MEALS) {
    actions.saveMeal(
      tripId,
      null,
      {
        day: isoDay(seed.day),
        slot: seed.slot,
        title: seed.title,
        kind: seed.out ? MEAL_KIND_OUT : MEAL_KIND_COOK,
        time: null,
        note: null,
        place: seed.out ?? null,
        cookUserId: null,
        excursionId: seed.hut ? (hut?.id ?? null) : null,
      },
      (seed.ingredients ?? []).map((ingredient) => ({
        id: null,
        name: ingredient.name,
        amount: ingredient.amount,
        list: ITEM_MODE_BUY_LOCAL,
        bought: ingredient.bought ?? false,
        fresh: null,
      })),
    )
  }
}

/**
 * §3.29: M28 opens with a board worth reading — ideas in three of the four
 * segments, every tag but one and a rain-proof one for the chips, a link, a
 * note, a vote, a comment, and pictures — one, two and four, so each of the
 * mosaic's shapes is on the board (FR-29.5) — and an idea with two GPX
 * tracks and no picture, a hike and a bike tour, so the board shows a line
 * as a banner and the map has two to choose between (FR-29.17). On the
 * shortlist one is planned on tomorrow and one waits without a day, so M29
 * has a line and a pool (FR-29.14). Written without an identity, as Local Mode
 * writes; on a server the push stamps the account that seeded. Through the
 * module's own actions, for the reason `buyOneShoppingRow` gives.
 */
export const SEED_IDEAS: ReadonlyArray<{
  title: string
  tag: IdeaTag | null
  link?: string
  note?: string
  rainProof?: boolean
  state?: IdeaState
  voted?: boolean
  comment?: string
  pictures?: number
  /** FR-29.14: planned this many days from today, at this time. */
  plannedIn?: number
  plannedAt?: string
  tracks?: boolean
}> = [
  {
    title: 'Bernina Express nach Tirano',
    tag: 'outing',
    link: 'https://www.rhb.ch/de/panoramazuege/bernina-express',
    state: IDEA_STATE_SHORTLISTED,
    voted: true,
    pictures: 1,
  },
  {
    title: 'Segantini-Museum in St. Moritz',
    tag: 'culture',
    link: 'https://www.segantini-museum.ch',
    rainProof: true,
    comment: 'Montags geschlossen.',
  },
  { title: 'Capuns im Gasthaus probieren', tag: 'food', rainProof: true },
  {
    title: 'Oberengadin zu Fuss oder mit dem Velo',
    tag: 'hiking',
    note: 'Höhenweg mit Blick auf die Seen, oder gemütlich dem Inn entlang.',
    tracks: true,
  },
  { title: 'Baden im Lej da Staz', tag: 'swimming', pictures: 2 },
  {
    title: 'Muottas Muragl – Alp Languard',
    tag: 'hiking',
    note: 'Mit der Standseilbahn hoch, dann gut drei Stunden Höhenweg.',
    state: IDEA_STATE_SHORTLISTED,
    pictures: 4,
    plannedIn: 1,
    plannedAt: '09:00',
  },
  { title: 'Gleitschirm-Tandemflug', tag: null, state: IDEA_STATE_DROPPED },
]

function seedIdeas(tripId: string, orchestrator: Orchestrator): void {
  const plannerStore = usePlannerStore()
  const actions = createPlannerActions(orchestrator.moduleHost, plannerStore)
  for (const seed of SEED_IDEAS) {
    const id = actions.addIdea(
      tripId,
      {
        title: seed.title,
        note: seed.note ?? null,
        link: seed.link ?? null,
        tag: seed.tag,
        rainProof: seed.rainProof ?? false,
      },
      null,
    )
    const idea = id === null ? undefined : plannerStore.getIdea(id)
    if (!idea) continue
    if (seed.state) actions.setState(idea, seed.state)
    const current = plannerStore.getIdea(idea.id)
    if (current && seed.plannedIn !== undefined) {
      actions.planIdea(current, isoDay(seed.plannedIn), seed.plannedAt ?? null)
    }
    if (seed.voted) {
      actions.vote(
        tripId,
        idea.id,
        voteTally(idea.id, plannerStore.getVotes(tripId), null),
        IDEA_VOTE_UP,
        null,
      )
    }
    if (seed.comment) actions.addComment(tripId, idea.id, seed.comment, null)
    if (seed.pictures) void seedPictures(idea, seed.pictures, actions)
    if (seed.tracks) void seedTracks(idea, actions)
  }
  // FR-29.15: an entry of the day plan's own, tonight.
  actions.addDayEntry(
    tripId,
    isoDay(0),
    { title: 'Tisch im Gasthaus Bernina', note: '4 Personen', time: '19:30' },
    null,
  )
}

/** For the reason `seedPictures` gives, a failed upload is said, not thrown. */
async function seedExcursionTrack(excursion: Excursion, orchestrator: Orchestrator) {
  try {
    const gpx = sampleGpx(SAMPLE_EXCURSION_ROUTE)
    const read = readTrack(gpx, SAMPLE_EXCURSION_ROUTE.fileName, gpx.length)
    if (read.ok) await orchestrator.addTrack(excursion, read.upload)
  } catch (error) {
    console.warn(`dev seed: no track for „${excursion.name}"`, error)
  }
}

/** One after another, for the reason `seedPictures` gives. */
async function seedTracks(
  idea: Idea,
  actions: ReturnType<typeof createPlannerActions>,
): Promise<void> {
  try {
    for (const route of SAMPLE_ROUTES) {
      const gpx = sampleGpx(route)
      const read = readTrack(gpx, route.fileName, gpx.length)
      if (read.ok) await actions.addTrack(idea, read.upload)
    }
  } catch (error) {
    console.warn(`dev seed: no tracks for „${idea.title}"`, error)
  }
}

/**
 * One after another: each picture's position is read off the ones already
 * there, and in Server Mode those arrive only with the drain after an upload.
 * A device that cannot paint or scale one — no canvas under a unit test, no
 * connection for the upload — seeds the rest of the trip without pictures and
 * says so in the console rather than failing the seed.
 */
async function seedPictures(
  idea: Idea,
  count: number,
  actions: ReturnType<typeof createPlannerActions>,
): Promise<void> {
  try {
    for (let i = 0; i < count; i++) {
      await actions.addPicture(idea, await samplePicture(i))
    }
  } catch (error) {
    console.warn(`dev seed: no pictures for „${idea.title}"`, error)
  }
}

/**
 * FR-31: M27 opens with two excursions — a hut tour tomorrow for two of the
 * three, started from the *Hüttentour* group and carrying its round as a
 * GPX track (FR-31.15), and an undated boat trip with one thing
 * to buy on the spot. The trip is active, so its suitcase is closed
 * and the hut tour shows *nicht im Gepäck* on what the luggage lacks (FR-31.7)
 * beside the lines it borrows. Through the orchestrator's own actions.
 */
export const SEED_EXCURSION_GROUP = 'Hüttentour'

function seedExcursions(tripId: string, orchestrator: Orchestrator): void {
  const group = useMasterStore().activeTemplateList.find((t) => t.name === SEED_EXCURSION_GROUP)
  const goes = useTripStore()
    .getTravelers(tripId)
    .filter((traveler) => traveler.name !== TRAVELERS[2])
    .map((traveler) => traveler.id)
  const hut = orchestrator.createExcursion(tripId, {
    name: 'Hüttentour Supramonte',
    startsOn: localDay(1),
    endsOn: localDay(2),
    travelerIds: goes,
    templateId: group?.id ?? null,
  })
  const hutTour = useTripStore()
    .getExcursions(tripId)
    .find((excursion) => excursion.id === hut?.excursionId)
  if (hutTour) void seedExcursionTrack(hutTour, orchestrator)
  const boat = orchestrator.createExcursion(tripId, {
    name: 'Bootsausflug',
    startsOn: null,
    endsOn: null,
    travelerIds: null,
    templateId: null,
  })
  if (boat) {
    orchestrator.addLines(tripId, boat.excursionId, [
      {
        source_item_id: null,
        name: 'Sonnenhut',
        category_name: null,
        assigned_traveler_id: null,
        quantity: 1,
        mode: ITEM_MODE_BUY_LOCAL,
        for_all_participants: false,
        weight_grams: null,
        value_cents: null,
        source_template_id: null,
      },
    ])
  }
}

/**
 * FR-7.9/FR-7.13: M26 opens with threads rather than the empty state — an
 * untitled quick number, and a titled thread with two replies, so the
 * collapsed card's count and the expanded order both have something to show.
 * Every entry is written under the same `SEED_AUTHOR_ID` placeholder (the
 * server stamps the pusher anyway): a fresh device has only ever the one
 * identity, so this shows the shape only. "New for me", the tick and the
 * reply push need a genuine second traveller, which is what `E2E-M26-11`
 * (server, two real identities) exercises.
 */
const SEED_QUICK_NOTE = 'Pizzakurier: 044 555 01 00, ab 18 Uhr'
const SEED_THREAD = {
  title: 'Schlüsselbox',
  body: 'Code 4711, links neben der Haustür',
  replies: ['Klemmt etwas, fest drücken', 'Parkplatz ist Nr. 12'],
} as const

function seedTripNotes(tripId: string, orchestrator: Orchestrator): void {
  orchestrator.addComment(tripId, null, SEED_AUTHOR_ID, SEED_QUICK_NOTE)
  const root = orchestrator.addComment(tripId, null, SEED_AUTHOR_ID, SEED_THREAD.body, {
    title: SEED_THREAD.title,
  })
  for (const reply of SEED_THREAD.replies) {
    orchestrator.addComment(tripId, null, SEED_AUTHOR_ID, reply, { parentId: root })
  }
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
  // FR-7.11: `due` is days from today, or null — one overdue (its group moves
  // up, red), one due tomorrow, and the rest undated, which is most tasks.
  { body: 'Briefkasten leeren lassen', phase: TASK_PHASE_BEFORE, tag: 'Haus', due: -1 },
  { body: 'Kühlschrank leeren', phase: TASK_PHASE_BEFORE, tag: null, due: null },
  { body: 'Pass verlängern', phase: TASK_PHASE_BEFORE, tag: null, due: 1 },
  {
    body: 'Am Bahnhof die Zugverbindung nach Pontresina abklären',
    phase: TASK_PHASE_DURING,
    tag: 'Bahn',
    due: null,
  },
] as const

function seedTripTodos(tripId: string, orchestrator: Orchestrator): void {
  const tags = new Map(useMasterStore().taskTagList.map((tag) => [tag.name, tag.id]))
  for (const { body, phase, tag, due } of SEED_TRIP_TODOS) {
    const id = orchestrator.addTripTodo(tripId, SEED_AUTHOR_ID, body, phase)
    const live = () =>
      useTripStore()
        .getTripTodos(tripId)
        .find((row) => row.id === id)
    const tagId = tag === null ? null : (tags.get(tag) ?? null)
    const tagged = live()
    if (tagId !== null && tagged) orchestrator.setTaskTag(tripId, tagged, tagId)
    const dated = live()
    if (due !== null && dated) orchestrator.setTaskDueDate(tripId, dated, localDay(due))
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
 *
 * FR-30.10: `due` is days from today, or null, as for the tasks — one due
 * today (its tag moves up) and one later, the rest undated.
 */
export const SEED_SHOPPING_ENTRIES = [
  { name: 'Brot', tag: 'Supermarkt', due: null },
  { name: 'Milch', tag: 'Supermarkt', due: 5 },
  { name: 'Pasta', tag: 'Supermarkt', due: null },
  { name: 'Mückenspray', tag: 'Apotheke', due: 0 },
  { name: 'Mineralwasser', tag: null, due: null },
] as const
const SEED_BOUGHT_ENTRY = 'Mineralwasser'

function seedShoppingEntries(tripId: string, orchestrator: Orchestrator): void {
  const actions = createShoppingActions(orchestrator.moduleHost, useShoppingStore())
  for (const { name, tag, due } of SEED_SHOPPING_ENTRIES) {
    actions.addEntry(tripId, ITEM_MODE_BUY_LOCAL, name, tag, due === null ? null : localDay(due))
  }
  const bought = useShoppingStore()
    .getEntries(tripId)
    .find((entry) => entry.name === SEED_BOUGHT_ENTRY)
  if (bought) actions.setBought(bought, true)
}

/**
 * A second, *planned* trip, generated from the sample Ferien-Vorlage and
 * registered against it (FR-27.4). The active trip above is imported rather
 * than generated, so it follows nothing and can never show the refresh — that
 * is the reason, not its status. Without this one a dev cannot see a group
 * edit reach a trip, which is the whole feature: edit a position in M8, open
 * the trip, and answer the card it carries.
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
