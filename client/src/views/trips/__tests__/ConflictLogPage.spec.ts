// @vitest-environment jsdom
/**
 * G-2's conflict log and its revert control (NFR-4.2a, ADR-023). The
 * reachable happy path is E2E-G2-07; what is pinned here is the half a
 * green e2e run says nothing about — the four refusals the server
 * distinguishes, each of which has to reach the reader as its own
 * sentence, on the row it belongs to.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import ConflictLogPage from '../ConflictLogPage.vue'
import { APIRequestError } from '@/api/client'
import { ERROR_CODE, type ErrorCode } from '@/api/types'
import type { ConflictEntry } from '@/composables/useSyncOrchestrator'
import { setLocale } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { Trip } from '@/types/domain'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

function entry(over: Partial<ConflictEntry> = {}): ConflictEntry {
  return {
    id: 'cf-1',
    entity_table: 'trip_items',
    entity_id: 'item-1',
    field: 'quantity',
    losing_value: '9',
    winning_value: '5',
    resolved_at: '2026-08-22T10:00:00Z',
    reverted: false,
    ...over,
  } as ConflictEntry
}

const orchestrator = {
  fetchConflicts: vi.fn<() => Promise<ConflictEntry[]>>(),
  fetchMasterConflicts: vi.fn<() => Promise<ConflictEntry[]>>(),
  revertConflict: vi.fn<() => Promise<void>>(),
}

beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('en')
  vi.clearAllMocks()
  orchestrator.fetchConflicts.mockResolvedValue([entry()])
  orchestrator.fetchMasterConflicts.mockResolvedValue([entry()])
  orchestrator.revertConflict.mockResolvedValue(undefined)
})

async function mountPage(props: { tripId?: string } = { tripId: 'trip-1' }) {
  const wrapper = mount(ConflictLogPage, {
    props,
    global: { provide: { orchestrator } },
  })
  await flushPromises()
  return wrapper
}

describe('the revert control', () => {
  it('reverts the entry through its own partition and re-reads the log', async () => {
    const wrapper = await mountPage()

    await wrapper.find('[data-testid="conflict-revert"]').trigger('click')
    await flushPromises()

    expect(orchestrator.revertConflict).toHaveBeenCalledWith('cf-1', 'trip-1')
    // Re-read, not patched: the server owns whether the entry is spent.
    expect(orchestrator.fetchConflicts).toHaveBeenCalledTimes(2)
  })

  it('reverts a master entry without naming a trip', async () => {
    const wrapper = await mountPage({})

    await wrapper.find('[data-testid="conflict-revert"]').trigger('click')
    await flushPromises()

    expect(orchestrator.revertConflict).toHaveBeenCalledWith('cf-1', undefined)
    expect(orchestrator.fetchMasterConflicts).toHaveBeenCalledTimes(2)
  })

  it('offers no revert on an entry that is already spent', async () => {
    orchestrator.fetchConflicts.mockResolvedValue([entry({ reverted: true })])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-revert"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="conflict-reverted"]').text()).toBe('Reverted')
  })
})

describe('each refusal reaches the reader as its own sentence', () => {
  const refusals: { code: ErrorCode | ''; says: string }[] = [
    { code: ERROR_CODE.already_reverted, says: 'This conflict has already been reverted.' },
    { code: ERROR_CODE.row_deleted, says: 'That entry has since been deleted.' },
    { code: ERROR_CODE.revert_refused, says: 'Cannot revert: the item has since been packed.' },
    { code: ERROR_CODE.forbidden, says: 'You may not change this entry.' },
    // A network failure is not an API refusal and must not borrow one of
    // their sentences — it says the one true thing instead.
    { code: '', says: 'Revert failed — offline?' },
  ]

  for (const { code, says } of refusals) {
    it(`says "${says}" for ${code || 'a failure with no code'}`, async () => {
      orchestrator.revertConflict.mockRejectedValue(
        code ? new APIRequestError(409, { code, message: 'x' }) : new Error('network down'),
      )
      const wrapper = await mountPage()

      await wrapper.find('[data-testid="conflict-revert"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="conflict-revert-error"]').text()).toBe(says)
    })
  }

  it('re-reads after a stale entry, so the button becomes the reverted note', async () => {
    orchestrator.revertConflict.mockRejectedValue(
      new APIRequestError(409, { code: 'already_reverted', message: 'x' }),
    )
    orchestrator.fetchConflicts
      .mockResolvedValueOnce([entry()])
      .mockResolvedValueOnce([entry({ reverted: true })])
    const wrapper = await mountPage()

    await wrapper.find('[data-testid="conflict-revert"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="conflict-revert"]').exists()).toBe(false)
  })
})

/**
 * The log is read by a person, not by the wire it stores (NFR-4.2a). Its first
 * rendered row said `trips · year — 2026 → 2026`: a table name, a column name,
 * and a value still wearing its JSON quotes.
 */
describe('a row says what it is about in words', () => {
  it('names the trip and the column, not the table and the field', async () => {
    const trips = useTripStore()
    trips.setTrip({ id: 'trip-1', name: 'Sommerferien Sardinien', year: 2026 } as Trip)
    orchestrator.fetchConflicts.mockResolvedValue([
      entry({ entity_table: 'trips', entity_id: 'trip-1', field: 'start_date' }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-subject"]').text()).toBe('Sommerferien Sardinien')
    expect(wrapper.find('[data-testid="conflict-field"]').text()).toContain('Start date')
    expect(wrapper.find('[data-testid="conflict-field"]').text()).not.toContain('trips')
  })

  it('names a packing position by the item on it', async () => {
    const trips = useTripStore()
    trips.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'ti-1',
      deleted: false,
      row: { trip_id: 'trip-1', name: 'Sonnencreme', quantity: 1 },
    })
    orchestrator.fetchConflicts.mockResolvedValue([
      entry({ entity_table: 'trip_items', entity_id: 'ti-1', field: 'quantity' }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-subject"]').text()).toBe('Sonnencreme')
  })

  it('names an inventory item from the master partition', async () => {
    const master = useMasterStore()
    master.items.set('it-1', { id: 'it-1', name: 'Zahnbürste' } as never)
    orchestrator.fetchMasterConflicts.mockResolvedValue([
      entry({ entity_table: 'items', entity_id: 'it-1', field: 'weight_grams' }),
    ])

    const wrapper = await mountPage({})

    expect(wrapper.find('[data-testid="conflict-subject"]').text()).toBe('Zahnbürste')
  })

  it('falls back to the kind of thing when this device does not know the row', async () => {
    // A row deleted since, or one this device has never pulled: an id says
    // nothing, and the entry is still evidence of what was overwritten.
    orchestrator.fetchConflicts.mockResolvedValue([
      entry({ entity_table: 'trip_items', entity_id: 'gone', field: 'quantity' }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-subject"]').text()).toBe('Item')
  })

  it('keeps a column it has no word for rather than inventing one', async () => {
    orchestrator.fetchConflicts.mockResolvedValue([entry({ field: 'image_hash' })])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-field"]').text()).toContain('image_hash')
  })
})

describe('a value is shown, not its encoding', () => {
  it('drops the JSON quotes from a name', async () => {
    orchestrator.fetchConflicts.mockResolvedValue([
      entry({ field: 'name', losing_value: '"Sardinien"', winning_value: '"Sizilien"' }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-losing"]').text()).toBe('Sardinien')
    expect(wrapper.find('[data-testid="conflict-winning"]').text()).toBe('Sizilien')
  })

  it('reads a flag as a word', async () => {
    orchestrator.fetchConflicts.mockResolvedValue([
      entry({ field: 'flag_missing', losing_value: 'true', winning_value: 'false' }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-losing"]').text()).toBe('Yes')
    expect(wrapper.find('[data-testid="conflict-winning"]').text()).toBe('No')
  })

  it('shows an absent value as the em dash, whether it is null or empty', async () => {
    orchestrator.fetchConflicts.mockResolvedValue([
      entry({ field: 'end_date', losing_value: 'null', winning_value: '' }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-losing"]').text()).toBe('—')
    expect(wrapper.find('[data-testid="conflict-winning"]').text()).toBe('—')
  })
})

describe('a foreign key is shown as the thing it points at', () => {
  it('names the travelers an assignment moved between', async () => {
    const trips = useTripStore()
    for (const { id, name } of [
      { id: 'tr-1', name: 'Mia' },
      { id: 'tr-2', name: 'Andy' },
    ]) {
      trips.applyChange({
        seq: 1,
        table: 'travelers',
        id,
        deleted: false,
        row: { trip_id: 'trip-1', name },
      })
    }
    orchestrator.fetchConflicts.mockResolvedValue([
      entry({ field: 'assigned_traveler_id', losing_value: '"tr-1"', winning_value: '"tr-2"' }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-field"]').text()).toContain('Assigned to')
    expect(wrapper.find('[data-testid="conflict-losing"]').text()).toBe('Mia')
    expect(wrapper.find('[data-testid="conflict-winning"]').text()).toBe('Andy')
  })

  it('keeps the id when this device cannot name it', async () => {
    orchestrator.fetchConflicts.mockResolvedValue([
      entry({ field: 'container_id', losing_value: '"c-gone"', winning_value: 'null' }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="conflict-losing"]').text()).toBe('c-gone')
    expect(wrapper.find('[data-testid="conflict-winning"]').text()).toBe('—')
  })
})

describe('the timestamp follows the language (NFR-4.12)', () => {
  it('is not the American default when the app speaks German', async () => {
    setLocale('de')
    const wrapper = await mountPage()

    const shown = wrapper.findAll('[data-testid="conflict-time"]').map((n) => n.text())
    // 22.08.2026 in German; the American default puts the month first and
    // adds an AM/PM the catalogue has no word for.
    expect(shown.some((s) => s.includes('22.08.2026'))).toBe(true)
    expect(shown.some((s) => /Aug 22, 2026|PM/.test(s))).toBe(false)
  })
})
