package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// G-9 (design review 2026-09-02). Pull's pagination — cursor, limit+1,
// HasMore, NextCursor, compaction, snapshot loop — used to be written out
// once per partition. It is one function now, and what still differs is a
// feed and a filter. These tests pin those two, because they are the only
// places the two partitions can still drift apart.

func TestFeedWhere_TheTwoFeedsSelectDisjointHalvesOfOneChangeLog(t *testing.T) {
	t.Run("the clause", func(t *testing.T) {
		where, args := masterFeed.where()
		if where != "trip_id IS NULL" || len(args) != 0 {
			t.Errorf("masterFeed.where() = %q, %v; want the NULL predicate and no arguments", where, args)
		}
		where, args = tripFeed("trip-1").where()
		if where != "trip_id = ?" || len(args) != 1 || args[0] != "trip-1" {
			t.Errorf("tripFeed().where() = %q, %v; want the equality predicate bound to the trip", where, args)
		}
	})

	// change_log is one table for both partitions, so a feed that reads the
	// wrong half still returns rows and still yields a NextCursor: nothing
	// about the shape of the answer says it came from the wrong feed. Only
	// pushing to both and reading each back does.
	t.Run("the page", func(t *testing.T) {
		s := openTestStore(t)
		ctx := context.Background()

		if _, err := s.ApplyMutation(ctx, testTrip, testUser, upsert("item-1", "mut-trip",
			map[string]any{"trip_id": testTrip, "name": "Socken"},
			sync.HLC("0000000001000-0000-aaaaaaaa"))); err != nil {
			t.Fatalf("ApplyMutation: %v", err)
		}
		applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "master-1", "mut-master",
			map[string]any{"name": "Zahnbürste"}, "0000000002000-0000-aaaaaaaa"))

		tripPage, err := s.Pull(ctx, testTrip, 0, 100)
		if err != nil {
			t.Fatalf("Pull: %v", err)
		}
		assertTables(t, "Pull", tripPage, map[string]bool{TableTripItems: true})

		masterPage, err := s.PullMaster(ctx, testUser, 0, 100)
		if err != nil {
			t.Fatalf("PullMaster: %v", err)
		}
		// trips and trip_members ride the master feed too (they are seeded
		// and stamped there), so the assertion is that trip_items — the row
		// pushed to the *other* feed — is not among them.
		if pageHas(masterPage, TableTripItems) {
			t.Error("PullMaster delivered a trip-partition row; the two feeds must not overlap")
		}
		if !pageHas(masterPage, TableItems) {
			t.Error("PullMaster delivered no master item")
		}
	})
}

func TestHeadSeq_CountsOnlyItsOwnFeed(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "master-1", "mut-master",
		map[string]any{"name": "Zahnbürste"}, "0000000001000-0000-aaaaaaaa"))

	tripHead, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}
	if tripHead != 0 {
		t.Errorf("HeadSeq = %d after a master-only push, want 0 — the hub would report the trip out of sync", tripHead)
	}

	masterHead, err := s.HeadSeqMaster(ctx)
	if err != nil {
		t.Fatalf("HeadSeqMaster: %v", err)
	}
	if masterHead == 0 {
		t.Error("HeadSeqMaster = 0 after a master push")
	}
}

// The filter decides two things, and they are not the same thing: an entry
// the puller may not see is dropped, an entry with no syncable columns is
// delivered without a row. Folding them would either hide a row a client
// needs or ask loadSnapshot for a column list it has not got.
func TestTripVisible_DeliversEverythingInTheFeed_ButOnlyLoadsSyncableRows(t *testing.T) {
	cases := []struct {
		name         string
		table        string
		wantVisible  bool
		wantSnapshot bool
	}{
		{"a syncable trip table", TableTripItems, true, true},
		{"a table with no syncable columns", "audit_scratch", true, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			visible, snapshot, err := tripVisible(context.Background(), tc.table, "id-1")
			if err != nil {
				t.Fatalf("tripVisible: %v", err)
			}
			if visible != tc.wantVisible || snapshot != tc.wantSnapshot {
				t.Errorf("tripVisible(%q) = visible %v, snapshot %v; want %v, %v",
					tc.table, visible, snapshot, tc.wantVisible, tc.wantSnapshot)
			}
		})
	}
}

// A dropped entry was still read, so the cursor has to pass it. Handing it
// back would park the client on a page it can never finish: it re-reads the
// invisible entry, drops it again, and never advances.
func TestPullPage_CursorPassesTheEntriesTheFilterDropped(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seedUserB(t, s)

	// testTrip exists but Berta is no member of it, so the trips row is in
	// the feed she reads and invisible to her.
	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTrips, testTrip, "mut-trip",
		map[string]any{"name": "Samedan 2026", "year": 2026}, "0000000001000-0000-aaaaaaaa"))

	page, err := s.PullMaster(ctx, testUserB, 0, 100)
	if err != nil {
		t.Fatalf("PullMaster: %v", err)
	}
	if pageHas(page, TableTrips) {
		t.Fatal("PullMaster delivered a trip Berta is no member of")
	}
	head, err := s.HeadSeqMaster(ctx)
	if err != nil {
		t.Fatalf("HeadSeqMaster: %v", err)
	}
	if page.NextCursor != head {
		t.Errorf("NextCursor = %d after a page whose entries were all dropped, want %d — "+
			"a cursor that stays put re-reads the same invisible entries forever",
			page.NextCursor, head)
	}
}

func pageHas(page PullPage, table string) bool {
	for _, c := range page.Changes {
		if c.Table == table {
			return true
		}
	}
	return false
}

func assertTables(t *testing.T, name string, page PullPage, want map[string]bool) {
	t.Helper()
	for _, c := range page.Changes {
		if !want[c.Table] {
			t.Errorf("%s delivered a %q row; want only %v", name, c.Table, want)
		}
	}
}
