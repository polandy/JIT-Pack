package store_test

import (
	"context"
	"testing"

	"jitpack/internal/store"
	"jitpack/internal/sync"
)

// The fixtures the external test package shares. They lived in
// headseq_test.go, which is where nobody looked for them, and the file they
// were named after uses two of the three.

// openEmptyStore opens a schema-only store.
//
// The name differs from the internal package's openTestStore on purpose:
// that one seeds a user and a trip, this one seeds nothing, and two helpers
// that open a store must not share a name while promising different rows.
// Whether a test is inside or outside `package store` is not something the
// reader of the call site can see.
func openEmptyStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

// seedTrip adds the owner and trip that pushItem's mutations belong to.
func seedTrip(t *testing.T, st *store.Store) {
	t.Helper()
	seeds := []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-a', 'auth|a', 'Andy')`,
		`INSERT INTO trips (id, name, year, start_date, end_date) VALUES ('trip-1', 'Test', 2026, '2026-01-01', '2026-01-10')`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip-1', 'user-a', 'owner')`,
	}
	for _, q := range seeds {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
}

// pushItem applies one trip_items insert through the real push path, so a
// test asserting on the change log sees the rows the server would write.
func pushItem(t *testing.T, st *store.Store, tripID, itemID, mutID string, fields map[string]any, hlc string) {
	t.Helper()
	_, err := st.ApplyMutation(context.Background(), tripID, "user-a", sync.Mutation{
		MutationID: mutID, Op: sync.OpInsert, Table: "trip_items",
		ID: itemID, Fields: fields, HLC: sync.HLC(hlc),
	})
	if err != nil {
		t.Fatalf("push %s: %v", itemID, err)
	}
}

// TestOpenEmptyStore_SeedsNothing holds the helper to its name. The internal
// package's openTestStore seeds a user and a trip, and the two are one edit
// apart; a seed added here would give every external test rows it never
// inserted, and the tests that count rows would be the ones to find out.
func TestOpenEmptyStore_SeedsNothing(t *testing.T) {
	st := openEmptyStore(t)

	for _, table := range []string{"users", "trips", "trip_members", "trip_items"} {
		var n int
		if err := st.DB().QueryRow(`SELECT count(*) FROM ` + table).Scan(&n); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if n != 0 {
			t.Fatalf("%s holds %d rows in a store this helper calls empty", table, n)
		}
	}
}
