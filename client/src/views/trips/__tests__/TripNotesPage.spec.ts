// @vitest-environment jsdom
/**
 * M26 — a trip's notes as threads (FR-7.13).
 *
 * What this pins is the screen: threads collapsed with their *neu* count,
 * the one with the latest activity first; a thread expanded in place with
 * the reply field under its first note and the replies newest first; a
 * reply, an edit and a tick reaching the orchestrator in the shape the
 * server expects; the ✎ only on my own entries; the delete naming the
 * replies it takes; and a link naming a thread opening it.
 *
 * The rules themselves are pure and tested without a screen
 * (`domain/__tests__/tripNotes.spec.ts`).
 */
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { IonInput, IonTextarea } from '@ionic/vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { reactive } from 'vue'

import TripNotesPage from '../TripNotesPage.vue'
import { identityStub } from '@/composables/__tests__/identityStub'
import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const route = reactive<{ query: Record<string, string> }>({ query: {} })
vi.mock('vue-router', () => ({ useRoute: () => route }))

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

// Every page watches the one shared route; an earlier spec's page left
// mounted would answer a later spec's link too.
enableAutoUnmount(afterEach)

// jsdom lays nothing out, so it has no scrollIntoView — recorded instead.
const scrolled = vi.fn()
Element.prototype.scrollIntoView = scrolled

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  route.query = {}
  meAnswer = ME
  tripScreen.loadedTrips.clear()
  tripScreen.loadedTrips.add('t1')
})

describe('M26 — the threads, collapsed (FR-7.13)', () => {
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
    // Collapsed: the words of the first note and the reply are not shown.
    expect(page.text()).not.toContain('Parkplatz Nr. 12')
  })

  it('marks a thread by somebody else as new with its count, and offers the tick', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    seedNote('r1', 'u-max', 'Danke', { parent_id: 'n1', created_at: '2026-09-20T11:00:00Z' })

    const page = await mounted()

    const thread = page.get('[data-testid="note-thread-n1"]')
    expect(thread.get('[data-testid="note-thread-new"]').text()).toBe('New 2')
    expect(thread.find('[data-testid="note-thread-tick-n1"]').exists()).toBe(true)
  })

  it('never marks or ticks a thread only I wrote in (FR-7.9 decision 4)', async () => {
    seedTrip()
    seedNote('n1', 'u-andy', 'Code 4711')

    const page = await mounted()

    const thread = page.get('[data-testid="note-thread-n1"]')
    expect(thread.find('[data-testid="note-thread-new"]').exists()).toBe(false)
    expect(thread.find('[data-testid="note-thread-tick-n1"]').exists()).toBe(false)
  })

  it('ticks through the newest entry, and a reply after it makes the thread new again', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    seedAck('n1', 'u-andy', '2026-09-20T10:00:00Z')
    seedNote('r1', 'u-max', 'Parkplatz 12', { parent_id: 'n1', created_at: '2026-09-21T09:00:00Z' })

    const page = await mounted()

    const thread = page.get('[data-testid="note-thread-n1"]')
    expect(thread.get('[data-testid="note-thread-new"]').text()).toBe('New')
    await thread.get('[data-testid="note-thread-tick-n1"]').trigger('ionChange')

    expect(acts.toggleNoteTick).toHaveBeenCalledWith(
      't1',
      'n1',
      expect.any(String),
      expect.objectContaining({ comment_id: 'n1', acked: true }),
      { ticked: false, seenThrough: '2026-09-21T09:00:00Z' },
    )
  })
})

describe('M26 — a thread, expanded (FR-7.13)', () => {
  it('shows the first note, the reply field under it, then the replies newest first', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    seedNote('r1', 'u-max', 'Erste Antwort', {
      parent_id: 'n1',
      created_at: '2026-09-20T11:00:00Z',
    })
    seedNote('r2', 'u-sia', 'Zweite Antwort', {
      parent_id: 'n1',
      created_at: '2026-09-20T12:00:00Z',
    })

    const page = await mounted()
    await page.get('[data-testid="note-thread-toggle-n1"]').trigger('click')

    const body = page.get('[data-testid="note-thread-body-n1"]')
    const order = body
      .findAll('[data-testid^="note-entry-"]')
      .map((e) => e.attributes('data-testid'))
      .filter((id) => /^note-entry-(n1|r1|r2)$/.test(id ?? ''))
    expect(order).toEqual(['note-entry-n1', 'note-entry-r2', 'note-entry-r1'])
    // The reply field stands between the first note and the replies.
    const html = body.html()
    expect(html.indexOf('note-thread-reply-input-n1')).toBeGreaterThan(
      html.indexOf('note-entry-n1'),
    )
    expect(html.indexOf('note-thread-reply-input-n1')).toBeLessThan(html.indexOf('note-entry-r2'))
  })

  it('sends a reply naming its thread, and offers no reply field on a reply', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    seedNote('r1', 'u-max', 'Danke', { parent_id: 'n1', created_at: '2026-09-20T11:00:00Z' })

    const page = await mounted()
    await page.get('[data-testid="note-thread-toggle-n1"]').trigger('click')

    // One field per thread — a reply is never itself a thread.
    expect(page.findAll('[data-testid^="note-thread-reply-input-"]')).toHaveLength(1)
    expect(page.find('[data-testid="note-thread-reply-input-r1"]').exists()).toBe(false)

    await page
      .get('[data-testid="note-thread-body-n1"]')
      .findComponent(IonInput)
      .setValue('Parkplatz ist Nr. 12')
    await page.get('[data-testid="note-thread-reply-send-n1"]').trigger('click')

    expect(acts.addComment).toHaveBeenCalledWith(
      't1',
      null,
      expect.any(String),
      'Parkplatz ist Nr. 12',
      {
        parentId: 'n1',
      },
    )
  })

  it('offers ✎ only on my own entries, and saves an edit with its title', async () => {
    seedTrip()
    seedNote('n1', 'u-andy', 'Code 4711', { title: 'Box' })
    seedNote('r1', 'u-sia', 'Danke', { parent_id: 'n1', created_at: '2026-09-20T11:00:00Z' })

    const page = await mounted()
    await page.get('[data-testid="note-thread-toggle-n1"]').trigger('click')

    expect(page.find('[data-testid="note-entry-edit-n1"]').exists()).toBe(true)
    expect(page.find('[data-testid="note-entry-edit-r1"]').exists()).toBe(false)

    await page.get('[data-testid="note-entry-edit-n1"]').trigger('click')
    const editor = page.get('[data-testid="note-entry-editor-n1"]')
    await editor.findComponent(IonInput).setValue('Schlüsselbox')
    await editor.findComponent(IonTextarea).setValue('Code 4712')
    await editor.get('[data-testid="note-edit-save"]').trigger('click')

    expect(acts.editNote).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'n1' }),
      'Code 4712',
      'Schlüsselbox',
    )
  })

  // G-8: Local Mode has no identity, and one writer — the scratchpad keeps its ✎.
  it('offers ✎ on every entry where there is no identity to tell writers apart', async () => {
    seedTrip()
    seedNote('n1', 'local-author', 'Code 4711')
    meAnswer = null

    const page = await mounted()
    await page.get('[data-testid="note-thread-toggle-n1"]').trigger('click')

    expect(page.find('[data-testid="note-entry-edit-n1"]').exists()).toBe(true)
    expect(page.find('[data-testid="note-thread-tick-n1"]').exists()).toBe(false)
  })

  it('names an edited entry as edited', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4712', { edited_at: '2026-09-21T08:00:00Z' })

    const page = await mounted()
    await page.get('[data-testid="note-thread-toggle-n1"]').trigger('click')

    expect(page.get('[data-testid="note-entry-meta-n1"]').text()).toContain('edited')
  })

  it('opens a link naming a thread already expanded', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    seedNote('n2', 'u-sia', 'Fähre um 8', { created_at: '2026-09-20T12:00:00Z' })
    route.query = { thread: 'n1' }

    const page = await mounted()

    expect(page.find('[data-testid="note-thread-body-n1"]').exists()).toBe(true)
    expect(page.find('[data-testid="note-thread-body-n2"]').exists()).toBe(false)
    expect(scrolled).toHaveBeenCalledTimes(1)
  })
})

describe('M26 — writing and removing (FR-7.13)', () => {
  it('writes a note with a title behind + Title', async () => {
    seedTrip()
    const page = await mounted()

    expect(page.find('[data-testid="m26-title-input"]').exists()).toBe(false)
    await page.get('[data-testid="m26-add-title"]').trigger('click')
    await page.get('[data-testid="m26-composer"]').findComponent(IonInput).setValue('Schlüsselbox')
    await page.get('[data-testid="m26-composer"]').findComponent(IonTextarea).setValue('Code 4711')
    await page.get('[data-testid="m26-add"]').trigger('click')

    expect(acts.addComment).toHaveBeenCalledWith('t1', null, expect.any(String), 'Code 4711', {
      title: 'Schlüsselbox',
    })
  })

  it('writes a quick note in one field, without a title', async () => {
    seedTrip()
    const page = await mounted()

    await page
      .get('[data-testid="m26-composer"]')
      .findComponent(IonTextarea)
      .setValue('Pizza 079 555 12 34')
    await page.get('[data-testid="m26-add"]').trigger('click')

    expect(acts.addComment).toHaveBeenCalledWith(
      't1',
      null,
      expect.any(String),
      'Pizza 079 555 12 34',
      {
        title: null,
      },
    )
  })

  it('deleting a first note says how many replies go with it', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    seedNote('r1', 'u-max', 'Danke', { parent_id: 'n1', created_at: '2026-09-20T11:00:00Z' })
    seedNote('r2', 'u-andy', 'Super', { parent_id: 'n1', created_at: '2026-09-20T12:00:00Z' })

    const page = await mounted()
    await page.get('[data-testid="note-thread-toggle-n1"]').trigger('click')
    await page.get('[data-testid="note-entry-open-n1"]').trigger('click')
    await flushPromises()

    const remove = page.get('[data-testid="note-sheet-remove"]')
    expect(remove.text()).toContain('Delete note, with 2 replies')
    await remove.trigger('click')

    expect(acts.deleteComment).toHaveBeenCalledWith('t1', 'n1')
  })

  it('deletes a reply on its own', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    seedNote('r1', 'u-max', 'Danke', { parent_id: 'n1', created_at: '2026-09-20T11:00:00Z' })

    const page = await mounted()
    await page.get('[data-testid="note-thread-toggle-n1"]').trigger('click')
    await page.get('[data-testid="note-entry-open-r1"]').trigger('click')
    await flushPromises()

    const remove = page.get('[data-testid="note-sheet-remove"]')
    expect(remove.text()).toContain('Delete reply')
    await remove.trigger('click')

    expect(acts.deleteComment).toHaveBeenCalledWith('t1', 'r1')
  })
})
