// @vitest-environment jsdom
/**
 * M26 — a trip's notes as threads (FR-7.13).
 *
 * What this pins is the list: each thread a card with its *neu* count, the
 * one with the latest activity first, showing the first note's words and
 * the newest reply; a card opening its thread view; and the FAB's sheet
 * writing a note with or without a title. The thread view is
 * `TripNoteThreadPage.spec.ts`'s; the rules are pure and tested without a
 * screen (`domain/__tests__/tripNotes.spec.ts`).
 */
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { IonInput, IonTextarea } from '@ionic/vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TripNotesPage from '../TripNotesPage.vue'
import { identityStub } from '@/composables/__tests__/identityStub'
import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const router = { push: vi.fn() }
vi.mock('vue-router', () => ({ useRouter: () => router }))

const tripScreen = tripScreenStub()

const people = [
  { user_id: 'u-andy', display_name: 'Andy' },
  { user_id: 'u-sia', display_name: 'Sia' },
  { user_id: 'u-max', display_name: 'Max' },
]

/** Who `fetchMe` answers; null is Local Mode's „nobody" (G-8). */
const ME = { user_id: 'u-andy', display_name: 'Andy', is_instance_admin: false }
let meAnswer: typeof ME | null = ME

const acts = {
  addComment: vi.fn(() => 'new-note'),
  editNote: vi.fn(),
  deleteComment: vi.fn(),
  toggleNoteTick: vi.fn(),
}

/** `fetchMe` answers `u-andy`: a note by `u-sia` is new, one by `u-andy` is mine. */
function mountPage() {
  return mount(TripNotesPage, {
    props: { tripId: 't1' },
    global: {
      provide: {
        [ORCHESTRATOR]: {
          ...identityStub(),
          fetchUsers: async () => people,
          fetchMe: async () => meAnswer,
          ...tripScreen,
          ...acts,
        },
      },
      // The real `ion-modal` renders an empty element under jsdom.
      stubs: { RouterLink: RouterLinkStub, SheetModal: { template: '<div><slot /></div>' } },
    },
  })
}

function seedTrip() {
  const trips = useTripStore()
  trips.applyChange({
    seq: 0,
    table: TABLE.trips,
    id: 't1',
    deleted: false,
    row: { name: 'Dänemark', year: 2026, status: 'active' },
  })
  for (const [i, userId] of ['u-andy', 'u-sia', 'u-max'].entries()) {
    trips.applyChange({
      seq: 0,
      table: TABLE.tripMembers,
      id: `mem-${i}`,
      deleted: false,
      row: { trip_id: 't1', user_id: userId, role: i === 0 ? 'owner' : 'member' },
    })
  }
}

function seedNote(id: string, authorId: string, body: string, row: Record<string, unknown> = {}) {
  useTripStore().applyChange({
    seq: 0,
    table: TABLE.comments,
    id,
    deleted: false,
    row: {
      trip_id: 't1',
      trip_item_id: null,
      author_id: authorId,
      body,
      is_task: 0,
      created_at: '2026-09-20T10:00:00Z',
      ...row,
    },
  })
}

function seedAck(commentId: string, userId: string, seenThrough: string) {
  useTripStore().applyChange({
    seq: 0,
    table: TABLE.noteAcks,
    id: `ack-${commentId}-${userId}`,
    deleted: false,
    row: {
      trip_id: 't1',
      comment_id: commentId,
      user_id: userId,
      acked: 1,
      seen_through: seenThrough,
    },
  })
}

async function mounted() {
  const page = mountPage()
  await flushPromises()
  return page
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  meAnswer = ME
  tripScreen.loadedTrips.clear()
  tripScreen.loadedTrips.add('t1')
})

describe('M26 — the list of threads (FR-7.13)', () => {
  it('says so when the trip has no notes yet', async () => {
    seedTrip()
    const page = await mounted()
    expect(page.find('[data-testid="m26-empty"]').exists()).toBe(true)
  })

  it('orders threads by latest activity and names each by its title or first line', async () => {
    seedTrip()
    seedNote('old', 'u-sia', 'Code 4711\nhinten links', {
      title: 'Schlüsselbox',
      created_at: '2026-09-18T08:00:00Z',
    })
    seedNote('new', 'u-sia', 'Pizza Bella 079 555 12 34\nab 18 Uhr', {
      created_at: '2026-09-20T08:00:00Z',
    })
    seedNote('r1', 'u-max', 'Parkplatz Nr. 12', {
      parent_id: 'old',
      created_at: '2026-09-21T08:00:00Z',
    })

    const page = await mounted()

    const names = page.findAll('[data-testid="note-thread-name"]').map((n) => n.text())
    expect(names).toEqual(['Schlüsselbox', 'Pizza Bella 079 555 12 34'])
    expect(
      page.get('[data-testid="note-thread-old"]').get('[data-testid="note-thread-meta"]').text(),
    ).toContain('1 reply')
  })

  it('shows what is in a thread — the first note’s words and the newest reply with its writer', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711, links neben der Tür', { title: 'Schlüsselbox' })
    seedNote('r1', 'u-max', 'Klemmt etwas', { parent_id: 'n1', created_at: '2026-09-20T11:00:00Z' })
    seedNote('r2', 'u-sia', 'Parkplatz ist Nr. 12', {
      parent_id: 'n1',
      created_at: '2026-09-20T12:00:00Z',
    })
    seedNote('q', 'u-sia', 'Pizza 079 555 12 34\nab 18 Uhr', {
      created_at: '2026-09-19T08:00:00Z',
    })

    const page = await mounted()

    const box = page.get('[data-testid="note-thread-n1"]')
    expect(box.get('[data-testid="note-thread-preview"]').text()).toBe(
      'Code 4711, links neben der Tür',
    )
    // The code is marked, not live: the card is a button already.
    expect(box.get('[data-testid="note-thread-preview"]').find('button').exists()).toBe(false)
    expect(box.get('[data-testid="note-thread-last"] .last-text').text()).toBe(
      'Sia: Parkplatz ist Nr. 12',
    )

    // Without a title the first line is the name, and only the rest is quoted.
    const quick = page.get('[data-testid="note-thread-q"]')
    expect(quick.get('[data-testid="note-thread-preview"]').text()).toBe('ab 18 Uhr')
    expect(quick.find('[data-testid="note-thread-last"]').exists()).toBe(false)
  })

  it('marks a thread by somebody else as new with its count, and has no checkbox', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    seedNote('r1', 'u-max', 'Danke', { parent_id: 'n1', created_at: '2026-09-20T11:00:00Z' })

    const page = await mounted()

    const thread = page.get('[data-testid="note-thread-n1"]')
    expect(thread.get('[data-testid="note-thread-new"]').text()).toBe('New 2')
    expect(thread.find('ion-checkbox').exists()).toBe(false)
  })

  it('never marks a thread only I wrote in (FR-7.9 decision 4)', async () => {
    seedTrip()
    seedNote('n1', 'u-andy', 'Code 4711')

    const page = await mounted()

    expect(page.find('[data-testid="note-thread-new"]').exists()).toBe(false)
  })

  it('a reply after my tick makes the thread new again', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    seedAck('n1', 'u-andy', '2026-09-20T10:00:00Z')
    seedNote('r1', 'u-max', 'Parkplatz 12', { parent_id: 'n1', created_at: '2026-09-21T09:00:00Z' })

    const page = await mounted()

    expect(page.get('[data-testid="note-thread-new"]').text()).toBe('New')
  })

  it('opens a thread’s own view from its card', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')

    const page = await mounted()
    await page.get('[data-testid="note-thread-n1"]').trigger('click')

    expect(router.push).toHaveBeenCalledWith('/trips/t1/notes/n1')
  })
})

describe('M26 — writing a note (FR-7.13)', () => {
  it('writes a note with a title from the FAB’s sheet', async () => {
    seedTrip()
    const page = await mounted()

    await page.get('[data-testid="m26-fab"]').trigger('click')
    expect(page.find('[data-testid="m26-composer-title"]').exists()).toBe(true)
    await page
      .get('[data-testid="m26-title-input"]')
      .findComponent(IonInput)
      .setValue('Schlüsselbox')
    await page.findComponent(IonTextarea).setValue('Code 4711')
    await page.get('[data-testid="m26-add"]').trigger('click')

    expect(acts.addComment).toHaveBeenCalledWith('t1', null, expect.any(String), 'Code 4711', {
      title: 'Schlüsselbox',
    })
  })

  it('writes a quick note without a title', async () => {
    seedTrip()
    const page = await mounted()

    await page.get('[data-testid="m26-fab"]').trigger('click')
    await page.findComponent(IonTextarea).setValue('Pizza 079 555 12 34')
    await page.get('[data-testid="m26-add"]').trigger('click')

    expect(acts.addComment).toHaveBeenCalledWith(
      't1',
      null,
      expect.any(String),
      'Pizza 079 555 12 34',
      { title: null },
    )
  })

  it('says who reads the note before it is shared', async () => {
    seedTrip()
    const page = await mounted()
    expect(page.text()).toContain('Everyone on the trip sees the note.')
  })

  it('says nothing about readers where nobody else can read it (Local Mode, G-8)', async () => {
    seedTrip()
    meAnswer = null
    const page = await mounted()
    expect(page.find('[data-testid="m26-add"]').exists()).toBe(true)
    expect(page.text()).not.toContain('Everyone on the trip sees the note.')
  })
})
