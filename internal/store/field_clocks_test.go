package store

import (
	"context"
	"fmt"
	"testing"

	"jitpack/internal/sync"
)

const (
	clockEarly = sync.HLC("0000000001000-0000-aaaaaaaa")
	clockMid   = sync.HLC("0000000002000-0000-bbbbbbbb")
	clockLate  = sync.HLC("0000000003000-0000-cccccccc")
)

// NFR-4.2a is field-level LWW, and the per-field record has to survive the
// round trip through SQLite for that to be true on the server: a pack made
// offline at 10:00 and a container assigned at 10:30 never competed, so
// the pack pushed at 11:00 applies.
func TestApplyMutation_FieldClocks_UnrelatedNewerEditDoesNotDisplaceOfflinePack(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO containers (id, trip_id, name) VALUES ('bag-1', ?, 'Rucksack')`, testTrip)

	seed := upsert("item-1", "fc-1", map[string]any{"trip_id": testTrip, "name": "Zelt", "quantity": 1}, clockEarly)
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatal(err)
	}
	container := upsert("item-1", "fc-2", map[string]any{"container_id": "bag-1"}, clockLate)
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, container); err != nil {
		t.Fatal(err)
	}

	pack := upsert("item-1", "fc-3", map[string]any{"state": "packed", "packed_count": 1}, clockMid)
	res, err := s.ApplyMutation(ctx, testTrip, testUser, pack)
	if err != nil {
		t.Fatal(err)
	}

	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("outcome = %q, want applied; conflicts %v", res.Outcome, res.Conflicts)
	}
	var state, containerID string
	if err := s.db.QueryRow(`SELECT state, container_id FROM trip_items WHERE id = 'item-1'`).Scan(&state, &containerID); err != nil {
		t.Fatal(err)
	}
	if state != "packed" || containerID != "bag-1" {
		t.Errorf("row = (%s, %s), want both writes kept", state, containerID)
	}
}

// The narrow terminal rule, through the store: a stale offline pack loses
// to a later deliberate skip, and the log names the push and the pusher —
// without those two columns nothing could tell the author or revert the
// pair as one.
func TestApplyMutation_StalePackLosesToLaterSkip_LoggedWithMutationAndActor(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-sia', 'auth|sia', 'Sia')`)

	seed := upsert("item-1", "sp-1", map[string]any{"trip_id": testTrip, "name": "Zelt", "quantity": 1}, clockEarly)
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatal(err)
	}
	skip := upsert("item-1", "sp-2", map[string]any{"state": "skipped", "packed_count": 0, "quantity": 0}, clockLate)
	if _, err := s.ApplyMutation(ctx, testTrip, "user-sia", skip); err != nil {
		t.Fatal(err)
	}

	stalePack := upsert("item-1", "sp-3", map[string]any{"state": "packed", "packed_count": 1}, clockMid)
	res, err := s.ApplyMutation(ctx, testTrip, testUser, stalePack)
	if err != nil {
		t.Fatal(err)
	}
	if res.Outcome != sync.OutcomeMerged {
		t.Fatalf("outcome = %q, want merged", res.Outcome)
	}

	conflicts, err := s.ListConflicts(ctx, testTrip)
	if err != nil {
		t.Fatal(err)
	}
	if len(conflicts) != 2 {
		t.Fatalf("conflicts = %d, want state and packed_count", len(conflicts))
	}
	for _, c := range conflicts {
		if c.MutationID != "sp-3" || c.ActorUserID != testUser {
			t.Errorf("conflict %s names (%q, %q), want (sp-3, %s)", c.Field, c.MutationID, c.ActorUserID, testUser)
		}
		if c.Reverted {
			t.Errorf("conflict %s reverted on arrival", c.Field)
		}
	}
}

// A row written by a path that does not merge carries no per-field record;
// its fields are then exactly as old as the row, so an older write is still
// dropped rather than let through a hole.
func TestApplyMutation_RowWithoutFieldClocks_FallsBackToRowHLC(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name, quantity, updated_hlc) VALUES ('item-legacy', ?, 'Zelt', 1, ?)`, testTrip, string(clockMid))

	res, err := s.ApplyMutation(ctx, testTrip, testUser, upsert("item-legacy", "lg-1", map[string]any{"name": "Iglu"}, clockEarly))
	if err != nil {
		t.Fatal(err)
	}
	if res.Outcome != sync.OutcomeMerged {
		t.Errorf("outcome = %q, want merged", res.Outcome)
	}
}

// Every table the push endpoints may write carries the per-field record;
// a synced table without it would silently fall back to row-level LWW
// for every one of its rows (ADR-022's revisit trigger, caught here first).
func TestSchema_EverySyncableTableCarriesFieldClocks(t *testing.T) {
	s := openTestStore(t)
	for table := range syncableColumns {
		t.Run(table, func(t *testing.T) {
			rows, err := s.db.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, table))
			if err != nil {
				t.Fatal(err)
			}
			defer rows.Close()
			found := false
			for rows.Next() {
				var cid int
				var name, typ string
				var notnull, pk int
				var dflt any
				if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
					t.Fatal(err)
				}
				if name == fieldClocksColumn {
					found = true
				}
			}
			if !found {
				t.Errorf("%s has no %s column", table, fieldClocksColumn)
			}
		})
	}
}

// A corrupt record is refused, never read as "no clocks": falling back
// silently would turn one bad row into row-level LWW without a trace.
func TestApplyMutation_CorruptFieldClocks_IsAnError(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name, quantity, updated_hlc, field_hlcs) VALUES ('item-bad', ?, 'Zelt', 1, ?, 'not json')`, testTrip, string(clockMid))

	_, err := s.ApplyMutation(context.Background(), testTrip, testUser, upsert("item-bad", "cb-1", map[string]any{"name": "Iglu"}, clockLate))
	if err == nil {
		t.Fatal("expected an error for a corrupt field_hlcs record")
	}
}
