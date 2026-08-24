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

import ConflictLogPage from '../ConflictLogPage.vue'
import { APIRequestError } from '@/api/client'
import { ERROR_CODE, type ErrorCode } from '@/api/types'
import type { ConflictEntry, LockEvent } from '@/composables/useSyncOrchestrator'

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
  fetchLockEvents: vi.fn<() => Promise<LockEvent[]>>(),
  fetchUsers: vi.fn(() =>
    Promise.resolve([
      { user_id: 'u-sia', display_name: 'Sia' },
      { user_id: 'u-andy', display_name: 'Andy' },
    ]),
  ),
}

function takeover(over: Partial<LockEvent> = {}): LockEvent {
  return {
    id: 'lk-1',
    trip_item_id: 'item-1',
    item_name: 'Zelt',
    from_user_id: 'u-andy',
    to_user_id: 'u-sia',
    created_at: '2026-08-24T10:00:00Z',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  orchestrator.fetchConflicts.mockResolvedValue([entry()])
  orchestrator.fetchMasterConflicts.mockResolvedValue([entry()])
  orchestrator.revertConflict.mockResolvedValue(undefined)
  orchestrator.fetchLockEvents.mockResolvedValue([])
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
 * FR-5.7's record. It is on this page but *not* in the conflict list:
 * that one holds merge losers, and a list carrying two unrelated kinds
 * of event stops being readable (ADR-028).
 */
describe('the takeover record', () => {
  it('names who took what from whom', async () => {
    orchestrator.fetchLockEvents.mockResolvedValue([takeover()])

    const wrapper = await mountPage()

    const rows = wrapper.findAll('[data-testid="lock-event-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Zelt')
    expect(rows[0]!.text()).toContain('Sia')
    expect(rows[0]!.text()).toContain('Andy')
    // The two logs stay two logs: the takeover must not appear as a
    // conflict row, which is what the separate table exists for.
    expect(wrapper.findAll('[data-testid="conflict-row"]')).toHaveLength(1)
  })

  it('is absent on the master log, which belongs to no trip', async () => {
    orchestrator.fetchLockEvents.mockResolvedValue([takeover()])

    const wrapper = await mountPage({})

    expect(orchestrator.fetchLockEvents).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="lock-event-row"]').exists()).toBe(false)
  })

  it('shows nothing at all when no row was ever taken over', async () => {
    // The positive signal for the negative above: the section is absent
    // because the trip has no takeovers, not because it never renders.
    const wrapper = await mountPage()

    expect(orchestrator.fetchLockEvents).toHaveBeenCalledWith('trip-1')
    expect(wrapper.find('[data-testid="lock-event-row"]').exists()).toBe(false)
  })
})
