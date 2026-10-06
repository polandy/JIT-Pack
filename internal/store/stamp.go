// Package store — stamp.go is invariant 3's step in the write pipeline: the
// columns the server owns are taken out of every mutation before anything
// reads it, and written back from the authenticated actor alone. Which
// columns those are is declared once per table, as tableSpec.serverOwned, so
// "which columns does the server own?" has one answer, and a push and a
// conflict revert (NFR-4.2a) both pass through it.
package store

import (
	"time"

	"jitpack/internal/sync"
)

// Server-owned column names that more than one table's rule writes.
const (
	// columnUserID is whose row a note_acks tick or an idea_votes vote is.
	columnUserID    = "user_id"
	columnCreatedBy = "created_by"
	columnOwnerID   = "owner_id"
	// Purchase record (FR-30.4), shared by trip_items, shopping_entries and
	// meal_ingredients.
	columnBoughtBy = "bought_by_user_id"
	columnBoughtAt = "bought_at"
)

// The columns the trip_items rule reads or writes. The packing pair and the
// claim pair are sync's stateRecord: they follow the state's merge verdict.
const (
	columnBought       = "bought"
	columnBoughtFrom   = "bought_from"
	columnPackedBy     = "packed_by_user_id"
	columnPackedAt     = "packed_at"
	columnPackingNowBy = "packing_now_by"
	columnPackingNowAt = "packing_now_at"
	columnTaskState    = "task_state"
	columnResolvedBy   = "resolved_by_user_id"
	columnResolvedAt   = "resolved_at"
	taskStateResolved  = "resolved"
)

// serverOwned is one table's part of invariant 3: the columns a client may
// never decide, and the rule that writes them back.
type serverOwned struct {
	// columns are removed from every mutation of the table, whatever its op,
	// before the scope rule, the merge or anything else reads them.
	columns map[string]bool
	// stamp writes back what the server decides those columns hold.
	stamp stampRule
}

// stampRule writes a table's server-owned columns into m. It may set only
// columns its serverOwned declares (TestServerOwned_StampWritesOnlyItsColumns).
type stampRule func(m *sync.Mutation, in stampInput)

// stampInput is what a stampRule may read besides the mutation itself.
type stampInput struct {
	actorID string
	// row is the server's row before the write; whether it exists decides a
	// column that is written when the row comes into being.
	row sync.Row
	// sent is what the client put into the server-owned columns, already
	// removed from the mutation. A rule may take a clock from it — when a row
	// was packed is not an identity claim (FR-25.17) — and nothing else.
	sent map[string]any
	now  Now
}

// stampServerOwned is the pipeline step: it strips m's server-owned columns
// and lets the table's rule write them back for actorID.
func stampServerOwned(m *sync.Mutation, row sync.Row, actorID string, now Now) {
	owned := tableSpecs[m.Table].serverOwned
	in := stampInput{actorID: actorID, row: row, sent: map[string]any{}, now: now}
	for column := range owned.columns {
		if v, sent := m.Fields[column]; sent {
			in.sent[column] = v
			delete(m.Fields, column)
		}
	}
	if owned.stamp != nil {
		owned.stamp(m, in)
	}
}

// stampedOnInsert owns an actor column that is decided once, by the insert
// that creates the row: a later op may not move the row to somebody else.
// An upsert that creates such a row is left without the column, and the
// NOT NULL refuses it — the one shape no client produces.
func stampedOnInsert(column string) serverOwned {
	return serverOwned{
		columns: toSet(column),
		stamp: func(m *sync.Mutation, in stampInput) {
			if m.Op == sync.OpInsert {
				m.Set(column, in.actorID)
			}
		},
	}
}

// stampedOnCreate owns a creator column of the master partition, written
// when the write finds no row and never afterwards — the master partition
// creates rows by upsert as readily as by insert.
func stampedOnCreate(column string) serverOwned {
	return serverOwned{
		columns: toSet(column),
		stamp: func(m *sync.Mutation, in stampInput) {
			if !in.row.Exists && m.Op != sync.OpDelete {
				m.Set(column, in.actorID)
			}
		},
	}
}

// commentOwned is a comment's: authorship, decided once like
// stampedOnInsert's, and FR-7.7's resolution record following the task
// state the way the purchase follows its flag. `phase` stays the client's —
// when a task is due is a statement, not an identity claim.
var commentOwned = serverOwned{
	columns: toSet(columnAuthorID, columnResolvedBy, columnResolvedAt),
	stamp: func(m *sync.Mutation, in stampInput) {
		stampedOnInsert(columnAuthorID).stamp(m, in)
		state, known := m.Fields[columnTaskState].(string)
		stampRecord(m, in, recordColumns{by: columnResolvedBy, at: columnResolvedAt}, known, state == taskStateResolved)
	},
}

// boughtFlagOwned is the purchase record (FR-30.4/FR-33.3) of a table whose
// `bought` flag decides it, sent as a JSON number or boolean.
var boughtFlagOwned = serverOwned{
	columns: toSet(columnBoughtBy, columnBoughtAt),
	stamp: func(m *sync.Mutation, in stampInput) {
		bought, known := m.Fields[columnBought]
		stampRecord(m, in, purchaseColumns, known, sync.IsTruthy(bought))
	},
}

// tripItemOwned is a packing row's three records.
//
// FR-30.4: the purchase record follows `bought_from`, the list the row was
// bought from (FR-25.11j) — set on the purchase, cleared when it is taken
// back. `bought_from` itself, like `packer_user_id` (the FR-25.19
// assignment), is a decision the person made and stays the client's.
//
// FR-25.19/FR-5.7: who packed the row and who holds its packing_now claim.
// The claim *is* the state, so only the state may name a holder; a mutation
// carrying no state carries neither record. Un-packed in any way (open,
// partial, skipped), both are cleared with the state they described
// (FR-25.17/FR-5.3), never left to outlive it.
var tripItemOwned = serverOwned{
	columns: toSet(columnBoughtBy, columnBoughtAt, columnPackedBy, columnPackedAt, columnPackingNowBy, columnPackingNowAt),
	stamp: func(m *sync.Mutation, in stampInput) {
		from, known := m.Fields[columnBoughtFrom]
		stampRecord(m, in, purchaseColumns, known, from != nil)

		state, hasState := m.Fields[sync.FieldState].(string)
		packing := recordColumns{by: columnPackedBy, at: columnPackedAt}
		claim := recordColumns{by: columnPackingNowBy, at: columnPackingNowAt}
		stampRecord(m, in, packing, hasState, state == sync.StatePacked)
		stampRecord(m, in, claim, hasState, state == sync.StatePackingNow)
	},
}

// recordColumns names one who-and-when pair — the shape four records in the
// schema share (FR-25.17's packing, FR-5.7's claim, FR-30.4's purchase,
// FR-7.7's resolution).
type recordColumns struct {
	by string
	at string
}

// purchaseColumns is FR-30.4's record, on every table that carries one.
var purchaseColumns = recordColumns{by: columnBoughtBy, at: columnBoughtAt}

// stampRecord writes who did a thing and when, for a record whose truth is
// decided by a state the same mutation carries.
//
// The person is the actor and never a client value (invariant 3), while the
// time may be the client's tap, because packing, shopping and ticking a task
// off all happen away from a network and the push lands later; a value that
// is not an instant is replaced rather than trusted.
//
// `known` says whether this mutation speaks about the record's state at all.
// One that does not carries no record — not even a null, which would erase
// what another device already recorded (NFR-4.2a's field-level merge has no
// way to tell an erasure from an absence once it is written).
func stampRecord(m *sync.Mutation, in stampInput, cols recordColumns, known, done bool) {
	switch {
	case !known:
	case done:
		tapped, _ := in.sent[cols.at].(string)
		m.Set(cols.by, in.actorID)
		m.Set(cols.at, tapTime(tapped, in.now))
	default:
		m.Set(cols.by, nil)
		m.Set(cols.at, nil)
	}
}

// tapTime keeps the client's tap time when it is a real instant and falls
// back to now otherwise, so an offline row keeps the moment it was actually
// packed or claimed instead of the moment its push arrived.
func tapTime(tapped string, now Now) string {
	if _, err := time.Parse(timestampSeconds, tapped); err == nil {
		return tapped
	}
	return now().UTC().Format(timestampSeconds)
}
