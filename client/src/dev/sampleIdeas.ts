import { readTrack } from '@/domain/shared/track'
import { newId } from '@/lib/ids'
import {
  IDEA_STATE_DROPPED,
  IDEA_STATE_SHORTLISTED,
  IDEA_VOTE_UP,
  LINK_NEW,
  createPlannerActions,
  usePlannerStore,
  voteTally,
  type Idea,
  type IdeaState,
  type IdeaTag,
} from '@/planner'
import { useTripStore } from '@/stores/tripStore'
import { TASK_PHASE_BEFORE } from '@/types/domain'
import { ANCHOR_KIND } from '@/domain/shared/taskAnchor'
import { samplePicture } from './samplePictures'
import { SAMPLE_ROUTES, sampleGpx } from './sampleTracks'
import { SEED_AUTHOR_ID, TRAVELERS, isoDay, type Orchestrator } from './seedBasics'

/**
 * §3.29: M28 opens with a board worth reading — ideas in three of the four
 * segments, every tag but one and a rain-proof one for the chips, a link, a
 * note, a vote, a comment, and pictures — one, two and four, so each of the
 * mosaic's shapes is on the board (FR-29.5) — and an idea with two GPX
 * tracks and no picture, a hike and a bike tour, so the board shows a line
 * as a banner and the map has two to choose between (FR-29.17). On the
 * shortlist one is planned on tomorrow and one waits without a day, so M29
 * has a line and a pool (FR-29.14). Both carry preparation (FR-29.21): the
 * unplanned one a step that waits for its day, the planned one a step due
 * today and one whose lead has already passed. Written without an identity, as Local Mode
 * writes; on a server the push stamps the account that seeded. Through the
 * module's own actions, for the reason `buyOneShoppingRow` gives.
 */
export const SEED_IDEAS: ReadonlyArray<{
  title: string
  tag: IdeaTag | null
  /** FR-29.22: its links in their order, a label where the seed gives one. */
  links?: ReadonlyArray<{ url: string; label?: string }>
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
  /** FR-29.21: steps to take ahead of it, each with its lead in days. */
  preparation?: ReadonlyArray<{ title: string; leadDays: number }>
}> = [
  {
    title: 'Bernina Express nach Tirano',
    tag: 'outing',
    links: [
      { url: 'https://www.rhb.ch/de/panoramazuege/bernina-express' },
      { url: 'https://www.sbb.ch/de/fahrplan', label: 'Fahrplan Pontresina–Tirano' },
      { url: 'https://www.tirano.it', label: 'Tirano entdecken' },
    ],
    state: IDEA_STATE_SHORTLISTED,
    voted: true,
    pictures: 1,
    preparation: [{ title: 'Sitzplätze reservieren', leadDays: 14 }],
  },
  {
    title: 'Segantini-Museum in St. Moritz',
    tag: 'culture',
    links: [{ url: 'https://www.segantini-museum.ch' }],
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
    preparation: [
      { title: 'Bergbahn-Tickets online kaufen', leadDays: 1 },
      { title: 'Hüttenplatz telefonisch anmelden', leadDays: 3 },
    ],
  },
  { title: 'Gleitschirm-Tandemflug', tag: null, state: IDEA_STATE_DROPPED },
]

export function seedIdeas(tripId: string, orchestrator: Orchestrator): void {
  const plannerStore = usePlannerStore()
  const actions = createPlannerActions(orchestrator.moduleHost, plannerStore)
  for (const seed of SEED_IDEAS) {
    const id = actions.addIdea(
      tripId,
      {
        title: seed.title,
        note: seed.note ?? null,
        links: (seed.links ?? []).map((link) => ({
          kind: LINK_NEW,
          id: newId(),
          url: link.url,
          label: link.label ?? null,
        })),
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
    for (const step of seed.preparation ?? []) {
      orchestrator.comments.addOwnTask(tripId, SEED_AUTHOR_ID, step.title, TASK_PHASE_BEFORE, {
        ideaId: idea.id,
        anchor: { kind: ANCHOR_KIND.idea, leadDays: step.leadDays },
      })
    }
  }
  // FR-29.15: an entry of the day plan's own, tonight.
  actions.addDayEntry(
    tripId,
    isoDay(0),
    { title: 'Tisch im Gasthaus Bernina', note: '4 Personen', time: '19:30' },
    null,
  )
  // FR-29.15: and one for the child alone, tomorrow morning.
  const child = useTripStore()
    .getTravelers(tripId)
    .find((traveler) => traveler.name === TRAVELERS[2])
  actions.addDayEntry(
    tripId,
    isoDay(1),
    {
      title: 'Kinderclub',
      note: 'Abholen 12:00',
      time: '09:00',
      travelerIds: child ? [child.id] : null,
    },
    null,
  )
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
