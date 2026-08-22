package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// A constraint the database refuses is a refusal, not a server fault. The
// master partition has always answered `rejected` for one (master.go); the
// trip partition returned the raw error, which the handler turns into a 500
// — and a 5xx is the one answer the client's outbox keeps retrying, because
// a failing server is expected to recover. The mutation therefore stayed at
// the head of its queue and took every later mutation for that trip with
// it: the partition stops syncing for good over one bad row (Sync-API §5).
//
// Every case here is ordinary offline traffic, not a malformed client.

func TestApplyMutation_ConstraintViolation_RejectedNotErrored(t *testing.T) {
	ctx := context.Background()

	cases := []struct {
		name string
		// seed runs before the mutation under test.
		seed func(t *testing.T, s *Store)
		mut  sync.Mutation
	}{
		{
			// Two devices, one roster: A assigns the row to a container that
			// B deleted while A was offline.
			name: "foreign key: the container was deleted elsewhere",
			seed: func(t *testing.T, s *Store) {
				m := upsert("item-1", "seed-1", map[string]any{"trip_id": testTrip, "name": "Socken"}, "0000000001000-0000-aaaaaaaa")
				if _, err := s.ApplyMutation(ctx, testTrip, m); err != nil {
					t.Fatalf("seed: %v", err)
				}
			},
			mut: upsert("item-1", "mut-1", map[string]any{"container_id": "gone-container"}, "0000000002000-0000-bbbbbbbb"),
		},
		{
			// A packed all three offline; B had meanwhile cut the quantity to
			// one. Field-level LWW applies the new quantity beside the old
			// packed_count, and CHECK (packed_count <= quantity) refuses it.
			name: "check: the quantity drops below what is already packed",
			seed: func(t *testing.T, s *Store) {
				m := upsert("item-1", "seed-1", map[string]any{
					"trip_id": testTrip, "name": "Socken", "quantity": 3, "packed_count": 3,
				}, "0000000001000-0000-aaaaaaaa")
				if _, err := s.ApplyMutation(ctx, testTrip, m); err != nil {
					t.Fatalf("seed: %v", err)
				}
			},
			mut: upsert("item-1", "mut-1", map[string]any{"quantity": 1}, "0000000002000-0000-bbbbbbbb"),
		},
		{
			// A partial upsert whose row was deleted on another device: the
			// merge treats it as an insert, and the columns the partial write
			// never carried are missing.
			name: "not null: a partial upsert lands on a row that is gone",
			seed: func(t *testing.T, s *Store) {},
			mut: upsert("item-gone", "mut-1", map[string]any{
				"trip_id": testTrip, "state": "packed",
			}, "0000000002000-0000-bbbbbbbb"),
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := openTestStore(t)
			c.seed(t, s)

			res, err := s.ApplyMutation(ctx, testTrip, c.mut)

			if err != nil {
				t.Fatalf("ApplyMutation returned an error, want a rejected result: %v", err)
			}
			if res.Outcome != OutcomeRejected {
				t.Errorf("outcome = %q, want rejected", res.Outcome)
			}

			// The refusal is recorded, so the retry the client will make
			// answers from the memo instead of failing all over again.
			replay, err := s.ApplyMutation(ctx, testTrip, c.mut)
			if err != nil {
				t.Fatalf("replay: %v", err)
			}
			if replay.Outcome != OutcomeDuplicate {
				t.Errorf("replayed outcome = %q, want duplicate", replay.Outcome)
			}
		})
	}
}

// The refusal must not take the rest of the batch with it: the transaction
// is per mutation, so a later, valid mutation still applies.
func TestApplyMutation_AfterAConstraintRefusal_TheNextMutationStillApplies(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seed := upsert("item-1", "seed-1", map[string]any{"trip_id": testTrip, "name": "Socken"}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, seed); err != nil {
		t.Fatalf("seed: %v", err)
	}

	bad := upsert("item-1", "mut-1", map[string]any{"container_id": "gone-container"}, "0000000002000-0000-bbbbbbbb")
	if res, err := s.ApplyMutation(ctx, testTrip, bad); err != nil || res.Outcome != OutcomeRejected {
		t.Fatalf("bad mutation: outcome %q err %v, want rejected", res.Outcome, err)
	}

	good := upsert("item-1", "mut-2", map[string]any{"quantity": 4}, "0000000003000-0000-cccccccc")
	res, err := s.ApplyMutation(ctx, testTrip, good)
	if err != nil {
		t.Fatalf("good mutation: %v", err)
	}
	if res.Outcome != "applied" {
		t.Errorf("outcome = %q, want applied", res.Outcome)
	}
	var qty int
	if err := s.db.QueryRow(`SELECT quantity FROM trip_items WHERE id = 'item-1'`).Scan(&qty); err != nil {
		t.Fatal(err)
	}
	if qty != 4 {
		t.Errorf("quantity = %d, want 4 — the refusal blocked a later write", qty)
	}
}
