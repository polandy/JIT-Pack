package store

import (
	"testing"
)

// G-1 (design review 2026-09-02). The two partitions used to be two copies
// of one pipeline, so "how do they differ" could only be answered by
// diffing two functions — and twice already a rule fixed in one had to be
// remembered in the other (ADR-031's re-log, FR-24.3's retire).
//
// Now the difference is four fields, and this is where it is declared. A
// fifth difference, or a flag that drifts to the other side, is a red test
// rather than a reading exercise.
func TestPartitions_DifferInExactlyTheFourWaysTheyDeclare(t *testing.T) {
	trip := tripPartition("trip-1", "user-1")
	master := masterPartition("user-1")

	t.Run("each accepts only its own tables", func(t *testing.T) {
		if !trip.tables[TableTripItems] || trip.tables[TableItems] {
			t.Errorf("trip partition tables = %v, want the trip set", trip.tables)
		}
		if !master.tables[TableItems] || master.tables[TableTripItems] {
			t.Errorf("master partition tables = %v, want the master set", master.tables)
		}
	})

	t.Run("the trip feed names its trip and the master feed names none", func(t *testing.T) {
		if trip.feed.tripID != "trip-1" {
			t.Errorf("trip feed = %v, want %q", trip.feed.tripID, "trip-1")
		}
		if master.feed.tripID != nil {
			t.Errorf("master feed = %v, want nil — the master change_log carries no trip", master.feed.tripID)
		}
	})

	// The one asymmetry that is easy to lose: `out_of_scope` means the row
	// is not this partition's, so re-delivering it would hand the pusher a
	// foreign row's snapshot (Sync-API P-3). Pinned end-to-end by
	// TestPull_AfterAnOutOfScopeRefusal_OffersNothing; pinned as a *property
	// of the partition* here, where the flag is written.
	t.Run("only the master partition re-logs a scope refusal (ADR-031, P-3)", func(t *testing.T) {
		if trip.relogScopeRefusal {
			t.Error("the trip partition must not re-log an out-of-scope refusal")
		}
		if !master.relogScopeRefusal {
			t.Error("the master partition must re-log an authorization refusal")
		}
	})

	// FR-24.3 is a master-data rule: an item or a Vorlage that history still
	// resolves against is kept and marked. Nothing on a trip is kept instead
	// of deleted, and a trip partition that grew a retirable table would
	// silently stop deleting rows.
	t.Run("only the master partition retires instead of deleting (FR-24.3)", func(t *testing.T) {
		for table := range lifecycleTables {
			if trip.retirable[table] {
				t.Errorf("the trip partition retires %q; nothing there is kept instead of deleted", table)
			}
			if !master.retirable[table] {
				t.Errorf("the master partition does not retire %q", table)
			}
		}
		if len(trip.retirable) != 0 {
			t.Errorf("trip retirable = %v, want empty", trip.retirable)
		}
	})

	t.Run("only the master partition owes extra change_log entries", func(t *testing.T) {
		if trip.afterChange != nil {
			t.Error("the trip partition declares a change hook; it owes no extra entries")
		}
		if master.afterChange == nil {
			t.Error("the master partition owes the creator membership, the member touch and the retire re-log")
		}
	})
}
