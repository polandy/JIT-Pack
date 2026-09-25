// @vitest-environment jsdom
/**
 * M26's thread view (FR-7.13) — one conversation, read top to bottom.
 *
 * What this pins: the first note on top, then the replies in the order they
 * were written; the reply field at the bottom sending a reply that names its
 * thread; the *neu* divider above the first reply I have not seen; *Gelesen*
 * reaching the orchestrator as the tick through the newest entry; an entry's
 * menu offering edit to its author only and a delete that names the replies
 * it takes; who has seen the thread; and a deleted thread leaving the view.
 */
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { IonInput, IonTextarea } from '@ionic/vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TripNoteThreadPage from '../TripNoteThreadPage.vue'
import { identityStub } from '@/composables/__tests__/identityStub'
import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const router = { replace: vi.fn(), push: vi.fn() }
vi.mock('vue-router', () => ({ useRouter: () => router }))

const copied = vi.fn(async (_text: string) => true)
vi.mock('@/lib/clipboard', () => ({ copyText: (text: string) => copied(text) }))
vi.mock('@/lib/toast', () => ({ presentToast: vi.fn(async () => ({})) }))

/** Every action sheet the view opened, newest last. */
const sheets: { buttons: { text: string; handler?: () => void }[] }[] = []
vi.mock('@ionic/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/vue')>()
  return {
    ...actual,
    actionSheetController: {
      create: async (opts: { buttons: { text: string; handler?: () => void }[] }) => {
        sheets.push({ buttons: opts.buttons })
        return { present: async () => {} }
      },
    },
  }
})

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
  addComment: vi.fn(() => 'new-reply'),
  editNote: vi.fn(),
  deleteComment: vi.fn(),
  toggleNoteTick: vi.fn(),
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

function reply(id: string, authorId: string, body: string, at: string) {
  seedNote(id, authorId, body, { parent_id: 'n1', created_at: at })
}

function seedAck(userId: string, seenThrough: string) {
  useTripStore().applyChange({
    seq: 0,
    table: TABLE.noteAcks,
    id: `ack-n1-${userId}`,
    deleted: false,
    row: { trip_id: 't1', comment_id: 'n1', user_id: userId, acked: 1, seen_through: seenThrough },
  })
}

async function mounted(threadId = 'n1') {
  const page = mount(TripNoteThreadPage, {
    props: { tripId: 't1', threadId },
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
    },
  })
  await flushPromises()
  return page
}

/** The labels of the last menu the view opened. */
function lastMenu(): string[] {
  return sheets.at(-1)?.buttons.map((b) => b.text) ?? []
}

async function choose(label: string) {
  sheets
    .at(-1)
    ?.buttons.find((b) => b.text === label)
    ?.handler?.()
  await flushPromises()
}

enableAutoUnmount(afterEach)

// jsdom lays nothing out, so it has no scrollIntoView — recorded instead.
const scrolled = vi.fn()
Element.prototype.scrollIntoView = scrolled

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  sheets.length = 0
  meAnswer = ME
  tripScreen.loadedTrips.clear()
  tripScreen.loadedTrips.add('t1')
})

describe('M26 thread view — reading (FR-7.13)', () => {
  it('shows the first note, then the replies in the order they were written', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711', { title: 'Schlüsselbox' })
    reply('r2', 'u-sia', 'Zweite Antwort', '2026-09-20T12:00:00Z')
    reply('r1', 'u-max', 'Erste Antwort', '2026-09-20T11:00:00Z')

    const page = await mounted()

    const order = page
      .findAll('[data-testid^="note-entry-words-"]')
      .map((e) => e.attributes('data-testid'))
    expect(order).toEqual(['note-entry-words-n1', 'note-entry-words-r1', 'note-entry-words-r2'])
  })

  it('puts my own replies on the other side, without my name', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    reply('r1', 'u-andy', 'Danke', '2026-09-20T11:00:00Z')
    reply('r2', 'u-max', 'Gern', '2026-09-20T12:00:00Z')

    const page = await mounted()

    expect(page.get('[data-testid="note-entry-r1"]').classes()).toContain('mine')
    expect(page.get('[data-testid="note-entry-r2"]').classes()).not.toContain('mine')
    expect(page.get('[data-testid="note-entry-r2"]').text()).toContain('Max')
  })

  it('makes a code a chip that copies itself', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Schlüsselbox: 4711, links')

    const page = await mounted()
    await page.get('[data-testid="note-code"]').trigger('click')
    await flushPromises()

    expect(copied).toHaveBeenCalledWith('4711')
    // The chip is its own control — the entry's menu does not open behind it.
    expect(sheets).toHaveLength(0)
  })

  it('names who has seen the thread on its first note', async () => {
    seedTrip()
    seedNote('n1', 'u-andy', 'Code 4711')
    seedAck('u-sia', '2026-09-20T10:00:00Z')
    seedAck('u-max', '2026-09-20T10:00:00Z')

    const page = await mounted()

    expect(page.get('[data-testid="note-entry-seen-by"]').text()).toBe('Seen by Max, Sia')
  })

  it('names an edited entry as edited', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4712', { edited_at: '2026-09-21T08:00:00Z' })

    const page = await mounted()

    expect(page.get('[data-testid="note-entry-meta-n1"]').text()).toContain('edited')
  })
})

describe('M26 thread view — new for me, and saying I read it (FR-7.13)', () => {
  it('stands the divider above the first reply I have not seen, and scrolls there', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    reply('r1', 'u-max', 'Klemmt', '2026-09-20T11:00:00Z')
    seedAck('u-andy', '2026-09-20T11:00:00Z')
    reply('r2', 'u-sia', 'Parkplatz 12', '2026-09-20T12:00:00Z')

    const page = await mounted()

    const html = page.get('[data-testid="note-thread-replies"]').html()
    const divider = html.indexOf('note-thread-divider')
    expect(divider).toBeGreaterThan(html.indexOf('note-entry-r1'))
    expect(divider).toBeLessThan(html.indexOf('note-entry-r2'))
    expect(scrolled).toHaveBeenCalledTimes(1)
  })

  it('says *read* as the tick through the newest entry', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    reply('r1', 'u-max', 'Parkplatz 12', '2026-09-21T09:00:00Z')

    const page = await mounted()
    await page.get('[data-testid="note-thread-read"]').trigger('click')

    expect(acts.toggleNoteTick).toHaveBeenCalledWith('t1', 'n1', expect.any(String), null, {
      ticked: false,
      seenThrough: '2026-09-21T09:00:00Z',
    })
  })

  it('offers no *read* when nothing is new — nor on a thread only I wrote in', async () => {
    seedTrip()
    seedNote('n1', 'u-andy', 'Code 4711')

    const page = await mounted()

    expect(page.find('[data-testid="note-thread-read"]').exists()).toBe(false)
    expect(page.find('[data-testid="note-thread-divider"]').exists()).toBe(false)
  })
})

describe('M26 thread view — writing (FR-7.13)', () => {
  it('sends a reply from the bottom field, naming its thread', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')

    const page = await mounted()
    await page
      .get('[data-testid="note-thread-composer"]')
      .findComponent(IonInput)
      .setValue('Parkplatz ist Nr. 12')
    await page.get('[data-testid="note-thread-reply-send"]').trigger('click')

    expect(acts.addComment).toHaveBeenCalledWith(
      't1',
      null,
      expect.any(String),
      'Parkplatz ist Nr. 12',
      { parentId: 'n1' },
    )
  })

  it('offers edit in the menu of my own entries only, and saves an edit with its title', async () => {
    seedTrip()
    seedNote('n1', 'u-andy', 'Code 4711', { title: 'Box' })
    reply('r1', 'u-sia', 'Danke', '2026-09-20T11:00:00Z')

    const page = await mounted()

    await page.get('[data-testid="note-entry-open-r1"]').trigger('click')
    await flushPromises()
    expect(lastMenu()).toEqual(['Copy text', 'Delete reply', 'Cancel'])

    await page.get('[data-testid="note-entry-open-n1"]').trigger('click')
    await flushPromises()
    expect(lastMenu()).toEqual(['Copy text', 'Edit', 'Delete note, with 1 reply', 'Cancel'])

    await choose('Edit')
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

  // G-8: Local Mode has no identity, and one writer — every entry keeps its edit.
  it('offers edit on every entry where there is no identity to tell writers apart', async () => {
    seedTrip()
    seedNote('n1', 'local-author', 'Code 4711')
    meAnswer = null

    const page = await mounted()
    await page.get('[data-testid="note-entry-open-n1"]').trigger('click')
    await flushPromises()

    expect(lastMenu()).toContain('Edit')
  })

  it('copies an entry’s words from its menu', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711, links')

    const page = await mounted()
    await page.get('[data-testid="note-entry-open-n1"]').trigger('click')
    await flushPromises()
    await choose('Copy text')

    expect(copied).toHaveBeenCalledWith('Code 4711, links')
  })
})

describe('M26 thread view — removing (FR-7.13)', () => {
  it('deletes a reply on its own', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    reply('r1', 'u-max', 'Danke', '2026-09-20T11:00:00Z')

    const page = await mounted()
    await page.get('[data-testid="note-entry-open-r1"]').trigger('click')
    await flushPromises()
    await choose('Delete reply')

    expect(acts.deleteComment).toHaveBeenCalledWith('t1', 'r1')
  })

  it('deletes the first note with its replies, and leaves for the list once it is gone', async () => {
    seedTrip()
    seedNote('n1', 'u-sia', 'Code 4711')
    reply('r1', 'u-max', 'Danke', '2026-09-20T11:00:00Z')
    reply('r2', 'u-andy', 'Super', '2026-09-20T12:00:00Z')

    const page = await mounted()
    await page.get('[data-testid="note-entry-open-n1"]').trigger('click')
    await flushPromises()
    await choose('Delete note, with 2 replies')
    expect(acts.deleteComment).toHaveBeenCalledWith('t1', 'n1')

    // The orchestrator is a stub: the delete lands as the store would see it.
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.comments,
      id: 'n1',
      deleted: true,
      row: null,
    })
    await flushPromises()

    expect(router.replace).toHaveBeenCalledWith('/trips/t1/notes')
  })
})
