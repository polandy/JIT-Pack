/**
 * FR-24.3 — bringing a retired row back, and the one thing that can stop it.
 *
 * Retiring *frees the name*: `idx_items_active_name` and
 * `idx_templates_active_name` range over the active rows only, deliberately,
 * because re-creating what you just deleted is the common case. The cost is
 * that the name can be gone by the time the restore is asked for, and two
 * active rows of one name is what FR-16.3/FR-1.6 exist to prevent. So the
 * restore is the write that loses — and it loses *before* it is enqueued, so
 * the user meets a sentence instead of watching an optimistic row reverse
 * itself (ADR-031).
 */
import { describe, it, expect } from 'vitest'

import { RETIRED_FIELD } from '../masterDeletion'
import {
  RESTORE_NAME_MISSING,
  RESTORE_NAME_TAKEN,
  RESTORE_READY,
  restoreFields,
  restoreVerdict,
  retiredOnly,
} from '../masterRestore'

interface Row {
  id: string
  name: string
  retired_at?: string | null
}

const RETIRED = '2026-08-25T09:00:00Z'

describe('retiredOnly', () => {
  it('is the exact complement of the active list', () => {
    const rows: Row[] = [
      { id: 'a', name: 'Zelt' },
      { id: 'b', name: 'Kamera', retired_at: RETIRED },
      { id: 'c', name: 'Hut', retired_at: null },
    ]
    expect(retiredOnly(rows).map((r) => r.id)).toEqual(['b'])
  })

  it('keeps the order it was given', () => {
    const rows: Row[] = [
      { id: 'b', name: 'B', retired_at: RETIRED },
      { id: 'a', name: 'A', retired_at: RETIRED },
    ]
    expect(retiredOnly(rows).map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('restoreVerdict', () => {
  const retired: Row = { id: 'old', name: 'Sonnencreme', retired_at: RETIRED }

  it('is ready while nothing active holds the name', () => {
    const active: Row[] = [{ id: 'other', name: 'Zelt' }]
    expect(restoreVerdict(retired, active)).toEqual({ kind: RESTORE_READY, name: 'Sonnencreme' })
  })

  it('names the row that took the name while it was hidden', () => {
    const active: Row[] = [{ id: 'new', name: 'Sonnencreme' }]
    const verdict = restoreVerdict(retired, active)
    expect(verdict.kind).toBe(RESTORE_NAME_TAKEN)
    expect(verdict.kind === RESTORE_NAME_TAKEN && verdict.holder.id).toBe('new')
  })

  it('folds case the way the name space does', () => {
    // findNameCollision's rule, not a second one: the database would hold
    // "Sonnencreme" and "sonnencreme" as two rows no screen can tell apart.
    expect(restoreVerdict(retired, [{ id: 'new', name: ' sonnencreme ' }]).kind).toBe(
      RESTORE_NAME_TAKEN,
    )
  })

  it('does not fold diacritics — those are two names the database accepts', () => {
    expect(
      restoreVerdict({ id: 'o', name: 'Frühling', retired_at: RETIRED }, [
        { id: 'n', name: 'Fruhling' },
      ]).kind,
    ).toBe(RESTORE_READY)
  })

  it('never collides with itself, even if the caller passes the whole list', () => {
    // The retired row is not in the active list today; asserting it anyway
    // is what stops a future caller from handing over `itemList`.
    expect(restoreVerdict(retired, [retired]).kind).toBe(RESTORE_READY)
  })

  it('accepts a replacement name and reports it as what would be written', () => {
    const active: Row[] = [{ id: 'new', name: 'Sonnencreme' }]
    expect(restoreVerdict(retired, active, ' Sonnencreme 2024 ')).toEqual({
      kind: RESTORE_READY,
      name: 'Sonnencreme 2024',
    })
  })

  it('refuses a replacement name that is taken as well', () => {
    const active: Row[] = [
      { id: 'new', name: 'Sonnencreme' },
      { id: 'other', name: 'Zelt' },
    ]
    const verdict = restoreVerdict(retired, active, 'Zelt')
    expect(verdict.kind).toBe(RESTORE_NAME_TAKEN)
    expect(verdict.kind === RESTORE_NAME_TAKEN && verdict.holder.id).toBe('other')
  })

  it('refuses a blank replacement as its own verdict, naming no holder', () => {
    // Reporting it as "taken" would have to invent a holder for a name
    // nothing holds, and the sentence built from it would be nonsense.
    expect(restoreVerdict(retired, [], '   ')).toEqual({ kind: RESTORE_NAME_MISSING })
  })

  it('sees the row that a previous restore of a same-named twin just activated', () => {
    // Two *retired* rows may share a name — the partial index does not
    // range over them — so restoring one takes the name from the other.
    const twin: Row = { id: 'twin', name: 'Sonnencreme' }
    expect(restoreVerdict(retired, [twin]).kind).toBe(RESTORE_NAME_TAKEN)
  })
})

describe('restoreFields', () => {
  it('clears the marker and nothing else when the name is kept', () => {
    expect(restoreFields(null)).toEqual({ [RETIRED_FIELD]: null })
  })

  it('carries the rename in the same write', () => {
    // Two mutations — clear, then rename — leave a moment where the index
    // is violated, and the second one can be the one the outbox drops.
    expect(restoreFields('Sonnencreme 2024')).toEqual({
      [RETIRED_FIELD]: null,
      name: 'Sonnencreme 2024',
    })
  })
})
