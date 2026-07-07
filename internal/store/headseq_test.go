package store_test

import (
	"context"
	"testing"

	"jitpack/internal/store"
	"jitpack/internal/sync"
)

func TestHeadSeq_EmptyTrip_ReturnsZero(t *testing.T) {
	st := openTestStore(t)

	seq, err := st.HeadSeq(context.Background(), "nonexistent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if seq != 0 {
		t.Errorf("seq = %d, want 0", seq)
	}
}

func TestHeadSeq_AfterPush_ReturnsLatest(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	seedTrip(t, st)
	pushItem(t, st, "trip-1", "item-1", "m-1",
		map[string]any{"trip_id": "trip-1", "name": "Socken"}, "0000000001000-0000-aaaaaaaa")
	pushItem(t, st, "trip-1", "item-2", "m-2",
		map[string]any{"trip_id": "trip-1", "name": "Hosen"}, "0000000002000-0000-aaaaaaaa")

	seq, err := st.HeadSeq(ctx, "trip-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if seq < 2 {
		t.Errorf("seq = %d, want >= 2", seq)
	}
}

func openTestStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

func seedTrip(t *testing.T, st *store.Store) {
	t.Helper()
	seeds := []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-a', 'auth|a', 'Andy')`,
		`INSERT INTO trips (id, name, start_date, end_date) VALUES ('trip-1', 'Test', '2026-01-01', '2026-01-10')`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip-1', 'user-a', 'owner')`,
	}
	for _, q := range seeds {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
}

func pushItem(t *testing.T, st *store.Store, tripID, itemID, mutID string, fields map[string]any, hlc string) {
	t.Helper()
	_, err := st.ApplyMutation(context.Background(), tripID, sync.Mutation{
		MutationID: mutID, Op: sync.OpInsert, Table: "trip_items",
		ID: itemID, Fields: fields, HLC: sync.HLC(hlc),
	})
	if err != nil {
		t.Fatalf("push %s: %v", itemID, err)
	}
}
