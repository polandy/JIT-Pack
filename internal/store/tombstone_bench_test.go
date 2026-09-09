package store

import (
	"context"
	"fmt"
	"testing"

	"jitpack/internal/sync"
)

// The price of ADR-052's tombstone lookup, kept runnable because the
// decision's revisit trigger is a number: the lookup scans the feed it asks
// about, and only the master feed grows without a bound.
//
//	go test ./internal/store/ -run XXX -bench Tombstone -benchtime 200x
//
// Measured 2026-09-09 (i5-7300U): master 0.84 ms at an empty log, 3.7 ms at
// 5k entries, 9.7 ms at 20k — the whole growth is this lookup, since the
// same benchmark with the guard disabled stays flat at ~0.7 ms. The trip
// feed stays flat at ~1.2 ms through the same 20k, because
// idx_change_log_trip bounds it to one trip's own entries.

// seedMasterFeed fills the instance-wide feed, which carries every trip,
// item and Vorlage the instance has ever logged.
func seedMasterFeed(b *testing.B, s *Store, n int) {
	b.Helper()
	for i := 0; i < n; i++ {
		if _, err := s.db.Exec(`INSERT INTO change_log (trip_id, entity_table, entity_id, deleted, hlc)
		           VALUES (NULL, 'items', ?, 0, '0000000001000-0000-aaaaaaaa')`, fmt.Sprintf("seed-%d", i)); err != nil {
			b.Fatalf("seed change_log: %v", err)
		}
	}
}

func benchStore(b *testing.B, feedSize int) *Store {
	b.Helper()
	s, err := OpenForTest(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() { s.Close() })
	if _, err := s.db.Exec(
		`INSERT INTO users (id, oidc_subject, display_name) VALUES (?, 'auth|andy', 'Andy')`, testUser); err != nil {
		b.Fatalf("seed user: %v", err)
	}
	if _, err := s.db.Exec(
		`INSERT INTO trips (id, name, year) VALUES (?, 'Samedan', 2026)`, testTrip); err != nil {
		b.Fatalf("seed trip: %v", err)
	}
	seedMasterFeed(b, s, feedSize)
	return s
}

var tombstoneFeedSizes = []int{0, 5000, 20000}

// BenchmarkTombstoneLookup_MasterInsert is the case that scales: the master
// feed has no index the lookup's predicate can use.
func BenchmarkTombstoneLookup_MasterInsert(b *testing.B) {
	for _, size := range tombstoneFeedSizes {
		b.Run(fmt.Sprintf("feed=%d", size), func(b *testing.B) {
			s := benchStore(b, size)
			ctx := context.Background()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if _, err := s.ApplyMasterMutation(ctx, testUser, sync.Mutation{
					MutationID: fmt.Sprintf("m-%d", i), Op: sync.OpInsert, Table: TableItems,
					ID: fmt.Sprintf("new-%d", i), Fields: map[string]any{"name": "Zelt"},
					HLC: sync.HLC(fmt.Sprintf("00000000%05d-0000-aaaaaaaa", i+30000)),
				}); err != nil {
					b.Fatalf("master insert: %v", err)
				}
			}
		})
	}
}

// BenchmarkTombstoneLookup_TripInsert is the high-volume case — a trip
// creation writes about a hundred of these — and it is the one already
// bounded by idx_change_log_trip.
func BenchmarkTombstoneLookup_TripInsert(b *testing.B) {
	for _, size := range tombstoneFeedSizes {
		b.Run(fmt.Sprintf("feed=%d", size), func(b *testing.B) {
			s := benchStore(b, size)
			ctx := context.Background()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if _, err := s.ApplyMutation(ctx, testTrip, testUser, sync.Mutation{
					MutationID: fmt.Sprintf("t-%d", i), Op: sync.OpInsert, Table: TableTripItems,
					ID: fmt.Sprintf("ti-%d", i), Fields: map[string]any{"trip_id": testTrip, "name": "Socken"},
					HLC: sync.HLC(fmt.Sprintf("00000000%05d-0000-aaaaaaaa", i+30000)),
				}); err != nil {
					b.Fatalf("trip insert: %v", err)
				}
			}
		})
	}
}
