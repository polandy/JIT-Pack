import { describe, it, expect, vi } from 'vitest'
import { useMutations } from '../useMutations'
import type { HLCGenerator } from '@/sync/hlc'

function mockHLC(): HLCGenerator {
  let counter = 0
  return {
    next: vi.fn(() => `0000000001000-${String(counter++).padStart(4, '0')}-abcd1234`),
    observe: vi.fn(),
  } as unknown as HLCGenerator
}

describe('useMutations', () => {
  it('incrementPacked creates upsert with correct count and state', () => {
    const m = useMutations(mockHLC())
    const mut = m.incrementPacked('i1', 2, 5)
    expect(mut.op).toBe('upsert')
    expect(mut.table).toBe('trip_items')
    expect(mut.id).toBe('i1')
    expect(mut.fields).toMatchObject({ packed_count: 3, state: 'partial' })
  })

  it('incrementPacked caps at quantity and sets packed', () => {
    const m = useMutations(mockHLC())
    const mut = m.incrementPacked('i1', 4, 5)
    expect(mut.fields).toMatchObject({ packed_count: 5, state: 'packed' })
  })

  it('decrementPacked goes to zero with open state', () => {
    const m = useMutations(mockHLC())
    const mut = m.decrementPacked('i1', 1)
    expect(mut.fields).toMatchObject({ packed_count: 0, state: 'open' })
  })

  it('decrementPacked does not go below zero', () => {
    const m = useMutations(mockHLC())
    const mut = m.decrementPacked('i1', 0)
    expect(mut.fields?.['packed_count']).toBe(0)
  })

  it('completePacked sets packed to quantity', () => {
    const m = useMutations(mockHLC())
    const mut = m.completePacked('i1', 5)
    expect(mut.fields).toMatchObject({ packed_count: 5, state: 'packed' })
  })

  it('zeroPacked resets to 0/open', () => {
    const m = useMutations(mockHLC())
    const mut = m.zeroPacked('i1')
    expect(mut.fields).toMatchObject({ packed_count: 0, state: 'open' })
  })

  it('togglePacked flips between packed and open for qty=1', () => {
    const m = useMutations(mockHLC())
    const pack = m.togglePacked('i1', 0)
    expect(pack.fields).toMatchObject({ packed_count: 1, state: 'packed' })
    const unpack = m.togglePacked('i1', 1)
    expect(unpack.fields).toMatchObject({ packed_count: 0, state: 'open' })
  })

  it('skipItem sets quantity 0 and skipped state', () => {
    const m = useMutations(mockHLC())
    const mut = m.skipItem('i1')
    expect(mut.fields).toEqual({ quantity: 0, packed_count: 0, state: 'skipped' })
  })

  it('unskipItem restores to qty 1 open', () => {
    const m = useMutations(mockHLC())
    const mut = m.unskipItem('i1')
    expect(mut.fields).toEqual({ quantity: 1, packed_count: 0, state: 'open' })
  })

  it('setItemMode creates mode upsert', () => {
    const m = useMutations(mockHLC())
    const mut = m.setItemMode('i1', 'buy_before')
    expect(mut.fields).toEqual({ mode: 'buy_before' })
  })

  it('addTripItem creates insert with unique id', () => {
    const m = useMutations(mockHLC())
    const { mutation, id } = m.addTripItem('t1', 'Towel', {
      weightGrams: 300,
      flagMissing: true,
    })
    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('trip_items')
    expect(mutation.id).toBe(id)
    expect(id).toBeTruthy()
    expect(mutation.fields?.['name']).toBe('Towel')
    expect(mutation.fields?.['trip_id']).toBe('t1')
    expect(mutation.fields?.['weight_grams']).toBe(300)
    expect(mutation.fields?.['flag_missing']).toBe(1)
  })

  it('createTrip creates insert with planning status', () => {
    const m = useMutations(mockHLC())
    const { mutation, id } = m.createTrip('Beach', '2026-08-01', '2026-08-07')
    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('trips')
    expect(mutation.fields?.['name']).toBe('Beach')
    expect(mutation.fields?.['status']).toBe('planning')
    expect(id).toBeTruthy()
  })

  it('every mutation gets a unique mutation_id and hlc', () => {
    const m = useMutations(mockHLC())
    const a = m.skipItem('i1')
    const b = m.skipItem('i2')
    expect(a.mutation_id).not.toBe(b.mutation_id)
    expect(a.hlc).not.toBe(b.hlc)
  })

  it('assignTraveler and assignContainer', () => {
    const m = useMutations(mockHLC())
    expect(m.assignTraveler('i1', 'tv1').fields).toEqual({ assigned_traveler_id: 'tv1' })
    expect(m.assignContainer('i1', 'c1').fields).toEqual({ container_id: 'c1' })
  })

  it('createMasterItem', () => {
    const m = useMutations(mockHLC())
    const { mutation } = m.createMasterItem('Soap', { categoryId: 'c1', unit: 'pieces' })
    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('items')
    expect(mutation.fields?.['name']).toBe('Soap')
  })

  // --- Preparation Todos (FR-7.3) ---

  it('addTodo creates insert on comments table', () => {
    const m = useMutations(mockHLC())
    const { mutation, id } = m.addTodo('t1', 'i1', 'u1', 'Charge battery')
    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('comments')
    expect(mutation.id).toBe(id)
    expect(mutation.fields).toEqual({
      trip_id: 't1',
      trip_item_id: 'i1',
      author_id: 'u1',
      body: 'Charge battery',
      is_task: 1,
      task_state: 'open',
    })
  })

  it('resolveTodo sets task_state to resolved', () => {
    const m = useMutations(mockHLC())
    const mut = m.resolveTodo('todo1')
    expect(mut.op).toBe('upsert')
    expect(mut.table).toBe('comments')
    expect(mut.id).toBe('todo1')
    expect(mut.fields).toEqual({ task_state: 'resolved' })
  })

  it('reopenTodo sets task_state to open', () => {
    const m = useMutations(mockHLC())
    const mut = m.reopenTodo('todo1')
    expect(mut.fields).toEqual({ task_state: 'open' })
  })

  it('deleteTodo creates delete mutation', () => {
    const m = useMutations(mockHLC())
    const mut = m.deleteTodo('todo1')
    expect(mut.op).toBe('delete')
    expect(mut.table).toBe('comments')
    expect(mut.id).toBe('todo1')
  })
})
