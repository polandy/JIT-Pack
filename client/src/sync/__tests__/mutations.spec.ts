import { describe, it, expect, vi } from 'vitest'
import { createMutations } from '@/sync/mutations'
import type { HLCGenerator } from '@/sync/hlc'
import { TABLE } from '@/types/tables'

/**
 * The instant an injected clock reports. Deliberately not near "now", so an
 * assertion against it cannot pass against the machine's clock by accident.
 */
const FIXED_ISO = '2026-03-14T15:09:26.535Z'

function mockHLC(): HLCGenerator {
  let counter = 0
  return {
    next: vi.fn(() => `0000000001000-${String(counter++).padStart(4, '0')}-abcd1234`),
    observe: vi.fn(),
  } as unknown as HLCGenerator
}

describe('createMutations', () => {
  // FR-24.9: refiling an item moves its assignment rather than tearing it
  // down and building it again — a delete plus an insert would put a
  // tombstone in the feed for a change that removed nothing (ADR-052).
  it('moveTag upserts the position of the assignment that exists', () => {
    const m = createMutations(mockHLC())
    const mut = m.moveTag('a-sport', -1)

    expect(mut.op).toBe('upsert')
    expect(mut.table).toBe('item_tags')
    expect(mut.id).toBe('a-sport')
    // Only the position: the pairing is what the row already says.
    expect(mut.fields).toEqual({ position: -1 })
  })

  // FR-24.10: the write a merge is made of. Same argument as moveTag — the
  // pairing is all the row is, so nothing is removed and a delete plus an
  // insert would both tombstone a change that removed nothing (ADR-052) and
  // lose the position the item was filed at.
  it('retagAssignment upserts the tag and the position together', () => {
    const m = createMutations(mockHLC())
    const mut = m.retagAssignment('a-sport', 't-kleidung', 3)

    expect(mut.op).toBe('upsert')
    expect(mut.table).toBe('item_tags')
    expect(mut.id).toBe('a-sport')
    // Both, and nothing else. The position has to travel with the tag: a
    // merge that re-points without it files the item under a heading neither
    // tag had.
    expect(mut.fields).toEqual({ tag_id: 't-kleidung', position: 3 })
  })

  // `toEqual` and not `toMatchObject` throughout these three, deliberately:
  // under ADR-022's field-level LWW a partial upsert that writes an extra
  // field overwrites a concurrent edit to it, and a subset assertion is
  // exactly the one that cannot see that.
  it('renameTag writes the name alone', () => {
    const m = createMutations(mockHLC())
    const mut = m.renameTag('t-kleidung', 'Bekleidung')

    expect(mut.op).toBe('upsert')
    expect(mut.table).toBe('tags')
    expect(mut.fields).toEqual({ name: 'Bekleidung' })
  })

  it('setTagMark writes the mark alone (FR-24.13)', () => {
    const m = createMutations(mockHLC())

    expect(m.setTagMark('t-bad', '🧼').fields).toEqual({ icon: '🧼' })
    // Clearing is a write of null, not an absent field — FR-28.1's first-class
    // absence, which a partial upsert without the key would never reach.
    expect(m.setTagMark('t-bad', null).fields).toEqual({ icon: null })
  })

  it('createTag carries a mark only when one was chosen (FR-24.13)', () => {
    const m = createMutations(mockHLC())

    expect(m.createTag('Bad', 3).mutation.fields).toEqual({ name: 'Bad', sort_order: 3 })
    expect(m.createTag('Wasser', 4, '🌊').mutation.fields).toEqual({
      name: 'Wasser',
      sort_order: 4,
      icon: '🌊',
    })
  })

  it('reorderTag writes the axis number alone', () => {
    const m = createMutations(mockHLC())
    const mut = m.reorderTag('t-kleidung', 2)

    // `sort_order`, not `position`: `tags` and `item_tags` spell the same
    // idea differently, and only the latter says position.
    expect(mut.fields).toEqual({ sort_order: 2 })
  })

  it('deleteTag is a delete, carrying no fields', () => {
    const m = createMutations(mockHLC())
    const mut = m.deleteTag('t-kleidung')

    expect(mut.op).toBe('delete')
    expect(mut.table).toBe('tags')
    expect(mut.id).toBe('t-kleidung')
  })

  it('incrementPacked creates upsert with correct count and state', () => {
    const m = createMutations(mockHLC())
    const mut = m.incrementPacked('i1', 2, 5)
    expect(mut.op).toBe('upsert')
    expect(mut.table).toBe('trip_items')
    expect(mut.id).toBe('i1')
    expect(mut.fields).toMatchObject({ packed_count: 3, state: 'partial' })
  })

  it('incrementPacked caps at quantity and sets packed', () => {
    const m = createMutations(mockHLC())
    const mut = m.incrementPacked('i1', 4, 5)
    expect(mut.fields).toMatchObject({ packed_count: 5, state: 'packed' })
  })

  // FR-25.24: the planned amount, and the two fields the schema ties to it.
  it('setQuantity writes the amount, the clamped count and the state it implies', () => {
    const m = createMutations(mockHLC())
    // Four were packed of five; the row is corrected down to two.
    const mut = m.setQuantity('i1', 2, 4, 'partial')
    expect(mut.op).toBe('upsert')
    expect(mut.table).toBe('trip_items')
    // Without the clamp the row violates CHECK (packed_count <= quantity)
    // and the server parks the whole mutation as a refusal.
    expect(mut.fields).toEqual({ quantity: 2, packed_count: 2, state: 'packed' })
  })

  it('setQuantity leaves a count below the new amount where it is', () => {
    const m = createMutations(mockHLC())
    const mut = m.setQuantity('i1', 5, 2, 'partial')
    expect(mut.fields).toEqual({ quantity: 5, packed_count: 2, state: 'partial' })
  })

  it('setQuantity keeps the editor inside its bounds (FR-25.24)', () => {
    const m = createMutations(mockHLC())
    // FR-5.5's zero belongs to the skip control, which also takes an
    // item's companions with it.
    expect(m.setQuantity('i1', 0, 0, 'open').fields).toMatchObject({ quantity: 1 })
    expect(m.setQuantity('i1', 1000, 0, 'open').fields).toMatchObject({ quantity: 99 })
  })

  it('setQuantity does not release a claim somebody is holding (G-3)', () => {
    const m = createMutations(mockHLC())
    const mut = m.setQuantity('i1', 3, 1, 'packing_now')
    // Changing how many are meant to come along is not a pack transition,
    // so it writes no state — and the claim outlives it.
    expect(mut.fields).toEqual({ quantity: 3, packed_count: 1 })
    expect(mut.fields).not.toHaveProperty('state')
  })

  it('decrementPacked goes to zero with open state', () => {
    const m = createMutations(mockHLC())
    const mut = m.decrementPacked('i1', 1, 3)
    expect(mut.fields).toMatchObject({ packed_count: 0, state: 'open' })
  })

  it('decrementPacked does not go below zero', () => {
    const m = createMutations(mockHLC())
    const mut = m.decrementPacked('i1', 0, 3)
    expect(mut.fields?.['packed_count']).toBe(0)
  })

  // C-4: the two cells where the former copies disagreed. A quantity of 0 is
  // FR-5.5's skipped row; `incrementPacked` clamped the count to 0 and read
  // `0 >= 0` as packed, `releasePackingNow` did the same.
  it('incrementPacked on a quantity-0 row stays skipped, never packed with a count of 0', () => {
    const m = createMutations(mockHLC())
    const mut = m.incrementPacked('i1', 0, 0)
    expect(mut.fields).toMatchObject({ packed_count: 0, state: 'skipped' })
  })

  it('releasePackingNow on a quantity-0 row hands back a skipped row (FR-5.3, FR-5.5)', () => {
    const m = createMutations(mockHLC())
    const mut = m.releasePackingNow('i1', 0, 0)
    expect(mut.fields).toMatchObject({ state: 'skipped', packing_now_by: null })
  })

  it('completePacked sets packed to quantity', () => {
    const m = createMutations(mockHLC())
    const mut = m.completePacked('i1', 5)
    expect(mut.fields).toMatchObject({ packed_count: 5, state: 'packed' })
  })

  it('zeroPacked resets to 0/open', () => {
    const m = createMutations(mockHLC())
    const mut = m.zeroPacked('i1')
    expect(mut.fields).toMatchObject({ packed_count: 0, state: 'open' })
  })

  it('togglePacked flips between packed and open for qty=1', () => {
    const m = createMutations(mockHLC())
    const pack = m.togglePacked('i1', 0)
    expect(pack.fields).toMatchObject({ packed_count: 1, state: 'packed' })
    const unpack = m.togglePacked('i1', 1)
    expect(unpack.fields).toMatchObject({ packed_count: 0, state: 'open' })
  })

  it('skipItem sets quantity 0 and skipped state', () => {
    const m = createMutations(mockHLC())
    const mut = m.skipItem('i1')
    expect(mut.fields).toEqual({ quantity: 0, packed_count: 0, state: 'skipped' })
  })

  it('restoreSkipped writes back the three fields a skip changed, and records no packing (FR-5.5)', () => {
    // An undo of "do not pack this" must not leave a packing record
    // behind — which is what going through packItem would have done.
    const m = createMutations(mockHLC())
    const mut = m.restoreSkipped('i1', 3, 2, 'partial')
    expect(mut.fields).toEqual({ quantity: 3, packed_count: 2, state: 'partial' })
  })

  // FR-5.10. The close reaches rows the row menu is not offered on — a row
  // somebody else holds — so it releases the claim the menu's own skip leaves
  // standing. A decided row that still reads „Sonja packt gerade" is the
  // defect this field pair exists to prevent.
  it('closeRowUnpacked skips the row and releases the claim (FR-5.10)', () => {
    const m = createMutations(mockHLC())
    const mut = m.closeRowUnpacked('i1')
    expect(mut.fields).toEqual({
      quantity: 0,
      packed_count: 0,
      state: 'skipped',
      packing_now_by: null,
      packing_now_at: null,
    })
  })

  // Variant P1: the amount shrinks to what is in the bag, so four of six
  // socks read as packed instead of being denied by a quantity of zero. And
  // `packed_at` is deliberately absent — nothing was packed at this moment,
  // so the row keeps saying when the four actually went in.
  it('closeRowPartlyPacked shrinks the amount to the count and stamps no packing (FR-5.10)', () => {
    const m = createMutations(mockHLC(), () => FIXED_ISO)
    const mut = m.closeRowPartlyPacked('i1', 4)
    expect(mut.fields).toEqual({
      quantity: 4,
      packed_count: 4,
      state: 'packed',
      packing_now_by: null,
      packing_now_at: null,
    })
  })

  // One field, both ways: NFR-4.2a merges it alone, so a status another
  // device set meanwhile survives the stamp.
  it('setPackingClosed writes the moment alone, and null reopens (FR-5.10)', () => {
    const m = createMutations(mockHLC())
    expect(m.setPackingClosed('t1', FIXED_ISO).fields).toEqual({ packing_closed_at: FIXED_ISO })
    expect(m.setPackingClosed('t1', null).fields).toEqual({ packing_closed_at: null })
    expect(m.setPackingClosed('t1', null).table).toBe(TABLE.trips)
  })

  it('unskipItem restores to qty 1 open', () => {
    const m = createMutations(mockHLC())
    const mut = m.unskipItem('i1')
    expect(mut.fields).toEqual({ quantity: 1, packed_count: 0, state: 'open' })
  })

  it('setItemMode creates mode upsert', () => {
    const m = createMutations(mockHLC())
    const mut = m.setItemMode('i1', 'buy_before')
    expect(mut.fields).toEqual({ mode: 'buy_before' })
  })

  // FR-25.11j: buying a row records the list it left *in the same upsert*
  // that changes the mode. Two mutations would leave a window — and, offline,
  // a landing order — in which the row has left the shopping side with no
  // record of where from, and the purchase is then irreversible.
  it('buyItem records the list a BUY_BEFORE row left as it moves to packing (FR-25.11j)', () => {
    const m = createMutations(mockHLC(), () => FIXED_ISO)
    const mut = m.buyItem('i1', 'buy_before', 3)
    expect(mut.op).toBe('upsert')
    expect(mut.table).toBe('trip_items')
    // FR-30.4: the tap's time travels with the purchase; who is the server's.
    expect(mut.fields).toEqual({ bought_from: 'buy_before', bought_at: FIXED_ISO, mode: 'pack' })
  })

  it('buyItem marks a BUY_LOCAL row packed and records the list too (FR-25.11j)', () => {
    const m = createMutations(mockHLC(), () => FIXED_ISO)
    const mut = m.buyItem('i1', 'buy_local', 3)
    expect(mut.fields).toEqual({
      bought_from: 'buy_local',
      bought_at: FIXED_ISO,
      packed_count: 3,
      state: 'packed',
      packed_at: FIXED_ISO,
      packing_now_by: null,
      packing_now_at: null,
    })
  })

  it('unbuyItem puts a BUY_BEFORE row back on the list it was bought from (FR-25.11j)', () => {
    const m = createMutations(mockHLC())
    const mut = m.unbuyItem('i1', 'buy_before')
    // FR-30.4: the purchase record goes with the purchase.
    expect(mut.fields).toEqual({
      bought_from: null,
      bought_at: null,
      bought_by_user_id: null,
      mode: 'buy_before',
    })
  })

  it('unbuyItem unpacks a BUY_LOCAL row without touching its mode (FR-25.11j)', () => {
    const m = createMutations(mockHLC())
    const mut = m.unbuyItem('i1', 'buy_local')
    expect(mut.fields).toEqual({
      bought_from: null,
      bought_at: null,
      bought_by_user_id: null,
      packed_count: 0,
      state: 'open',
      packed_at: null,
      packing_now_by: null,
      packing_now_at: null,
    })
  })

  it('addTripItem creates insert with unique id', () => {
    const m = createMutations(mockHLC())
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

  it('addTripItem writes the quantity it was given, and one where nobody said', () => {
    const m = createMutations(mockHLC())

    expect(m.addTripItem('t1', 'Ersatzakku', { quantity: 2 }).mutation.fields?.['quantity']).toBe(2)
    expect(m.addTripItem('t1', 'Towel', {}).mutation.fields?.['quantity']).toBe(1)
  })

  it('a skip-add is a quantity of zero whatever was asked for (FR-5.5)', () => {
    // The two rules meet here: a companion brings its dependency's quantity,
    // and a decided *skipped* row is the statement that none are coming.
    const m = createMutations(mockHLC())

    expect(
      m.addTripItem('t1', 'Ersatzakku', { quantity: 2, decided: 'skipped' }).mutation.fields?.[
        'quantity'
      ],
    ).toBe(0)
  })

  it('createTrip creates insert with planning status', () => {
    const m = createMutations(mockHLC())
    const { mutation, id } = m.createTrip('Beach', 2026, '2026-08-01', '2026-08-07')
    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('trips')
    expect(mutation.fields?.['name']).toBe('Beach')
    expect(mutation.fields?.['status']).toBe('planning')
    expect(id).toBeTruthy()
  })

  it('every mutation gets a unique mutation_id and hlc', () => {
    const m = createMutations(mockHLC())
    const a = m.skipItem('i1')
    const b = m.skipItem('i2')
    expect(a.mutation_id).not.toBe(b.mutation_id)
    expect(a.hlc).not.toBe(b.hlc)
  })

  it('assignTraveler and assignContainer', () => {
    const m = createMutations(mockHLC())
    expect(m.assignTraveler('i1', 'tv1').fields).toEqual({ assigned_traveler_id: 'tv1' })
    expect(m.assignContainer('i1', 'c1').fields).toEqual({ container_id: 'c1' })
  })

  it('createMasterItem', () => {
    const m = createMutations(mockHLC())
    const { mutation } = m.createMasterItem('Soap', { weightGrams: 40 })
    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('items')
    expect(mutation.fields?.['name']).toBe('Soap')
  })

  // --- Preparation Todos (FR-7.3) ---

  it('addTodo creates insert on comments table', () => {
    const m = createMutations(mockHLC())
    const { mutation, id } = m.addTodo('t1', 'i1', 'u1', 'Charge battery', 'before')
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
      // FR-7.7: every task is written with a phase, so no reader has to guess
      // at one — the composer it was typed into knows which. The creation
      // moment is named here too, because Local Mode has no database server
      // to default the column and the task's line would otherwise say nothing.
      phase: 'before',
      created_at: expect.any(String),
    })
  })

  /*
   * FR-7.7: the resolution carries the moment of the tap, the way `packItem`
   * carries `packed_at` — a task is ticked off away from a network and the
   * push can land days later. The *who* is absent on purpose: the server
   * stamps it (invariant 3), and in Local Mode there is nobody to name.
   */
  it('resolveTodo sets task_state to resolved and names the tap', () => {
    const m = createMutations(mockHLC())
    const mut = m.resolveTodo('todo1')
    expect(mut.op).toBe('upsert')
    expect(mut.table).toBe('comments')
    expect(mut.id).toBe('todo1')
    expect(mut.fields).toEqual({ task_state: 'resolved', resolved_at: expect.any(String) })
    expect(mut.fields?.['resolved_by_user_id']).toBeUndefined()
  })

  it('reopenTodo sets task_state to open and clears the record with it', () => {
    const m = createMutations(mockHLC())
    const mut = m.reopenTodo('todo1')
    expect(mut.fields).toEqual({ task_state: 'open', resolved_at: null })
  })

  /*
   * FR-7.7's crossing: one field, because it is the only thing that changes.
   * The task keeps its words, its state, its assignee and the day it was
   * written — a move that rewrote any of those would be a different act.
   */
  it('setTaskPhase writes the phase alone', () => {
    const m = createMutations(mockHLC())
    expect(m.setTaskPhase('todo1', 'during').fields).toEqual({ phase: 'during' })
    // Null is a legal value, not an omission: it is what a task written
    // before FR-7.7 carries, and an undo has to be able to put it back.
    expect(m.setTaskPhase('todo1', null).fields).toEqual({ phase: null })
  })

  /*
   * FR-7.8's filing, on the same terms as the phase above: one field, and
   * `null` is a value rather than a gap — the person took the task out of
   * its group, and the task then reads under the group named after where it
   * came from. An omission here would leave every other device on the old
   * tag, because a field that is not sent is a field that does not merge.
   */
  it('setTaskTag writes the tag alone, and can write it away', () => {
    const m = createMutations(mockHLC())
    expect(m.setTaskTag('todo1', 'tt-apotheke').fields).toEqual({ task_tag_id: 'tt-apotheke' })
    expect(m.setTaskTag('todo1', null).fields).toEqual({ task_tag_id: null })
    // The task's own table, not the tag's: the row being changed is the task.
    expect(m.setTaskTag('todo1', null).table).toBe(TABLE.comments)
  })

  // The vocabulary is the tasks' own (ADR-072), so the row goes to task_tags
  // and never to the inventory's `tags` — where it would appear in the item
  // picker as a word no item uses.
  it('createTaskTag inserts into the tasks’ own vocabulary', () => {
    const m = createMutations(mockHLC())
    const { mutation, id } = m.createTaskTag('Apotheke')

    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe(TABLE.taskTags)
    expect(mutation.id).toBe(id)
    // No mark unless one was asked for: writing `icon: null` would be a
    // statement, and a tag created in passing makes none.
    expect(mutation.fields).toEqual({ name: 'Apotheke', sort_order: 0 })
    expect(m.createTaskTag('Bahn', 2, '🚆').mutation.fields).toEqual({
      name: 'Bahn',
      sort_order: 2,
      icon: '🚆',
    })
  })

  it('deleteTodo creates delete mutation', () => {
    const m = createMutations(mockHLC())
    const mut = m.deleteTodo('todo1')
    expect(mut.op).toBe('delete')
    expect(mut.table).toBe('comments')
    expect(mut.id).toBe('todo1')
  })

  it('addItemDependency inserts a master-partition relation (FR-20.1)', () => {
    const m = createMutations(mockHLC())
    const { mutation } = m.addItemDependency('battery', 'camera', {
      mode: 'suggested',
      quantity: 2,
    })
    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('item_dependencies')
    expect(mutation.fields).toEqual({
      item_id: 'battery',
      depends_on_item_id: 'camera',
      mode: 'suggested',
      quantity: 2,
    })
  })

  it('addItemDependency defaults to required without a quantity', () => {
    const m = createMutations(mockHLC())
    const { mutation } = m.addItemDependency('battery', 'camera')
    expect(mutation.fields).toMatchObject({ mode: 'required', quantity: null })
  })

  it('updateItemDependency and deleteItemDependency target the relation row', () => {
    const m = createMutations(mockHLC())
    const upd = m.updateItemDependency('dep1', { mode: 'required' })
    expect(upd.op).toBe('upsert')
    expect(upd.table).toBe('item_dependencies')
    expect(upd.fields).toEqual({ mode: 'required' })
    const del = m.deleteItemDependency('dep1')
    expect(del.op).toBe('delete')
    expect(del.id).toBe('dep1')
  })

  // C-10: an update mutation takes the domain shape and renders the columns
  // itself. Before this, the two views below spelled the wire value — one
  // JSON.stringify in a template sheet, one dbBool in the same file — so the
  // encoding of a column lived wherever it happened to be written.
  it('an update mutation encodes the columns its edit names (C-10)', () => {
    const m = createMutations(mockHLC())

    expect(m.updateTrip('t1', { name: 'Elba', attributes: { season: 'summer' } }).fields).toEqual({
      name: 'Elba',
      attributes: JSON.stringify({ season: 'summer' }),
    })
    expect(m.updateSeries('s1', { default_attributes: null }).fields).toEqual({
      default_attributes: null,
    })
    expect(
      m.updateTemplateItem('ti1', { conditions: { season: 'winter' }, late_packer: true }).fields,
    ).toEqual({ conditions: JSON.stringify({ season: 'winter' }), late_packer: 1 })
    expect(m.updateGeneratedTripItem('i1', { late_packer: false, quantity: 2 }).fields).toEqual({
      late_packer: 0,
      quantity: 2,
    })
  })

  // C-5: every instant a mutation writes comes from the clock it was given.
  // Before the seam these four could only be asserted `expect.any(String)`,
  // which is green whether the value is right, wrong or a decade off.
  it('every stamped instant comes from the injected clock (C-5)', () => {
    const m = createMutations(mockHLC(), () => FIXED_ISO)

    expect(m.buyItem('i1', 'buy_local', 1).fields!.packed_at).toBe(FIXED_ISO)
    expect(m.startPackingNow('i1').fields!.packing_now_at).toBe(FIXED_ISO)
    expect(m.addTripItem('t1', 'Zelt', { decided: 'packed' }).mutation.fields!.packed_at).toBe(
      FIXED_ISO,
    )
    expect(
      m.logAppliedChange({
        trip_id: 't1',
        source_template_id: 'tpl-1',
        source_template_name: 'Ferien',
        kind: 'added',
        item_name: 'Zelt',
        detail: null,
      }).mutation.fields!.created_at,
    ).toBe(FIXED_ISO)
  })

  // The default is real time, so a caller that supplies no clock is not
  // silently stamping the epoch.
  it('an unsupplied clock is real time, not a fixed value', () => {
    const before = Date.now()
    const stamped = createMutations(mockHLC()).startPackingNow('i1').fields!
      .packing_now_at as string
    expect(Date.parse(stamped)).toBeGreaterThanOrEqual(before)
  })
})
