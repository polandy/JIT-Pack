/**
 * FR-24.3 — the restore the FR called free, and the one thing that is not.
 *
 * The orchestrator's half: a restore is an ordinary master mutation that
 * clears the marker, and it is *refused before it is enqueued* when an
 * active row holds the name — because retiring frees the name on purpose
 * (partial unique indexes), so it can be gone by the time the row is wanted
 * back. Letting the push refuse it would replay ADR-031's repair as a
 * restore that visibly reverses itself, and in Local Mode there is no push
 * to refuse it at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { RESTORE_NAME_TAKEN, RESTORE_READY } from '@/domain/masterRestore'
import { DELETION_REMOVE } from '@/domain/masterDeletion'
import type { PushResponse } from '@/api/types'
import { installHarness } from '@/__tests__/harness'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;({ fetch: fetchMock } = installHarness())
})

function mockDrain() {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } } satisfies PushResponse),
      { status: 200 },
    ),
  )
}

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

const RETIRED = '2026-08-25T09:00:00Z'

function seedRetiredItem(id = 'it-1', name = 'Sonnencreme') {
  const master = useMasterStore()
  master.applyChange({
    seq: 0,
    table: 'items',
    id,
    deleted: false,
    row: { name, retired_at: RETIRED },
  })
  return master
}

/** Every mutation that actually reached a push body, in order. */
function pushedMutations(): { id: string; op: string; fields: Record<string, unknown> }[] {
  return fetchMock.mock.calls
    .filter((call) => call[1]?.body)
    .flatMap((call) => JSON.parse(String(call[1].body)).mutations ?? [])
}

/** The last mutation the push carried, decoded. */
function lastMutation() {
  const all = pushedMutations()
  return all[all.length - 1]!
}

describe('FR-24.3 — restoring a retired master item', () => {
  it('clears the marker and puts the item back on the active list', async () => {
    const orch = newOrch()
    const master = seedRetiredItem()
    mockDrain()

    expect(orch.masterItemRestoreVerdict('it-1')).toEqual({
      kind: RESTORE_READY,
      name: 'Sonnencreme',
    })
    expect(orch.restoreMasterItem('it-1')).toBe(true)

    expect(master.getItem('it-1')?.retired_at).toBeNull()
    expect(master.activeItemList.map((i) => i.id)).toContain('it-1')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const mutation = lastMutation()
    expect(mutation.op).toBe('upsert')
    expect(mutation.fields.retired_at).toBeNull()
    // The name is not rewritten when it did not have to change.
    expect(mutation.fields.name).toBeUndefined()
  })

  it('refuses the restore while an active item holds the name, and enqueues nothing', async () => {
    const orch = newOrch()
    const master = seedRetiredItem()
    // Somebody re-created what they thought they had lost. Allowed, and the
    // whole reason the unique index is partial.
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'it-new',
      deleted: false,
      row: { name: 'Sonnencreme' },
    })
    // A second retired row, so the "nothing was pushed" assertion below has
    // a positive counterpart: this one restores and is pushed.
    seedRetiredItem('it-other', 'Zelt')
    mockDrain()

    const verdict = orch.masterItemRestoreVerdict('it-1')
    expect(verdict?.kind).toBe(RESTORE_NAME_TAKEN)
    expect(verdict && verdict.kind === RESTORE_NAME_TAKEN && verdict.holder.id).toBe('it-new')

    expect(orch.restoreMasterItem('it-1')).toBe(false)

    // Still hidden, and still exactly one active row of that name.
    expect(master.getItem('it-1')?.retired_at).toBe(RETIRED)
    expect(master.activeItemList.filter((i) => i.name === 'Sonnencreme')).toHaveLength(1)

    expect(orch.restoreMasterItem('it-other')).toBe(true)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    // One push, for the restore that was allowed — the refused one never
    // reached the outbox.
    expect(lastMutation().id).toBe('it-other')
    expect(pushedMutations().map((m) => m.id)).toEqual(['it-other'])
  })

  it('takes a replacement name and writes it in the same mutation as the marker', async () => {
    const orch = newOrch()
    const master = seedRetiredItem()
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'it-new',
      deleted: false,
      row: { name: 'Sonnencreme' },
    })
    mockDrain()

    expect(orch.restoreMasterItem('it-1', 'Sonnencreme 2024')).toBe(true)

    expect(master.getItem('it-1')?.name).toBe('Sonnencreme 2024')
    expect(master.getItem('it-1')?.retired_at).toBeNull()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const mutation = lastMutation()
    expect(mutation.fields).toMatchObject({ retired_at: null, name: 'Sonnencreme 2024' })
  })

  it('refuses a replacement name that is taken as well', () => {
    const orch = newOrch()
    const master = seedRetiredItem()
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'it-new',
      deleted: false,
      row: { name: 'Sonnencreme' },
    })
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'it-z',
      deleted: false,
      row: { name: 'Zelt' },
    })
    mockDrain()

    expect(orch.restoreMasterItem('it-1', 'Zelt')).toBe(false)
    expect(master.getItem('it-1')?.retired_at).toBe(RETIRED)
  })

  it('lists the retired rows, and only those', () => {
    newOrch()
    const master = seedRetiredItem()
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'it-active',
      deleted: false,
      row: { name: 'Zelt' },
    })
    expect(master.retiredItemList.map((i) => i.id)).toEqual(['it-1'])
  })
})

describe('FR-24.3 — restoring a retired Vorlage', () => {
  function seedRetiredTemplate(id = 'tpl-1', name = 'Kulturbeutel') {
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'templates',
      id,
      deleted: false,
      row: { name, kind: 'group', owner_id: 'u', retired_at: RETIRED },
    })
    return master
  }

  it('clears the marker and puts the group back on the active list', async () => {
    const orch = newOrch()
    const master = seedRetiredTemplate()
    mockDrain()

    expect(orch.restoreTemplate('tpl-1')).toBe(true)
    expect(master.getTemplate('tpl-1')?.retired_at).toBeNull()
    expect(master.activeTemplateList.map((t) => t.id)).toContain('tpl-1')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastMutation().fields.retired_at).toBeNull()
  })

  it('refuses while an active Vorlage of either scope holds the name', () => {
    const orch = newOrch()
    const master = seedRetiredTemplate()
    // `templates.name` is UNIQUE instance-wide and across both scopes, so a
    // Ferien-Vorlage can be what blocks a group's restore.
    master.applyChange({
      seq: 0,
      table: 'templates',
      id: 'tpl-new',
      deleted: false,
      row: { name: 'Kulturbeutel', kind: 'template', owner_id: 'u' },
    })

    const verdict = orch.templateRestoreVerdict('tpl-1')
    expect(verdict?.kind).toBe(RESTORE_NAME_TAKEN)
    expect(verdict && verdict.kind === RESTORE_NAME_TAKEN && verdict.holder.kind).toBe('template')
    expect(orch.restoreTemplate('tpl-1')).toBe(false)
    expect(master.getTemplate('tpl-1')?.retired_at).toBe(RETIRED)
  })

  it('lists the retired Vorlagen, and only those', () => {
    newOrch()
    const master = seedRetiredTemplate()
    master.applyChange({
      seq: 0,
      table: 'templates',
      id: 'tpl-live',
      deleted: false,
      row: { name: 'Ferien', kind: 'template', owner_id: 'u' },
    })
    expect(master.retiredTemplateList.map((t) => t.id)).toEqual(['tpl-1'])
  })
})

describe('FR-24.3 — a retired row does not become undeletable', () => {
  it('removes it for good once nothing references it any more', async () => {
    const orch = newOrch()
    const master = seedRetiredItem()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 'trip-1',
      deleted: false,
      row: { name: 'Engadin', year: 2026, status: 'archived' },
    })
    mockDrain()

    // The trip that had kept it alive is gone, so FR-24.3's second branch
    // now applies to the same row.
    expect(orch.masterItemDeletionOutlook('it-1').kind).toBe(DELETION_REMOVE)

    orch.deleteMasterItem('it-1')

    expect(master.getItem('it-1')).toBeUndefined()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastMutation().op).toBe('delete')
  })
})
