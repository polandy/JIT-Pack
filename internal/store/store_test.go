package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// Integration tests per CODING_PRINCIPLES §2: repositories are tested
// against a real in-memory SQLite, never database mocks.

const (
	testUser = "user-andy"
	testTrip = "trip-samedan"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES (?, 'auth|andy', 'Andy')`, testUser)
	mustExec(t, s, `INSERT INTO trips (id, name, start_date, end_date) VALUES (?, 'Samedan 2026', '2026-07-10', '2026-07-20')`, testTrip)
	return s
}

func mustExec(t *testing.T, s *Store, query string, args ...any) {
	t.Helper()
	if _, err := s.db.Exec(query, args...); err != nil {
		t.Fatalf("exec %q: %v", query, err)
	}
}

func upsert(id, mutationID string, fields map[string]any, hlc sync.HLC) sync.Mutation {
	return sync.Mutation{
		MutationID: mutationID, Op: sync.OpUpsert, Table: "trip_items",
		ID: id, Fields: fields, HLC: hlc,
	}
}

func TestOpen_MigratesSchemaAndEnforcesForeignKeys(t *testing.T) {
	s := openTestStore(t)

	_, err := s.db.Exec(`INSERT INTO trip_items (id, trip_id, name) VALUES ('x', 'no-such-trip', 'Ghost')`)

	if err == nil {
		t.Fatal("expected foreign key violation, got nil — PRAGMA foreign_keys not active")
	}
}

func TestApplyMutation_InsertCreatesRowAndChangeLogEntry(t *testing.T) {
	s := openTestStore(t)
	m := sync.Mutation{
		MutationID: "mut-1", Op: sync.OpInsert, Table: "trip_items", ID: "item-1",
		Fields: map[string]any{"trip_id": testTrip, "name": "Unterhosen", "quantity": 5},
		HLC:    sync.HLC("0000000001000-0000-aaaaaaaa"),
	}

	res, err := s.ApplyMutation(context.Background(), testTrip, m)
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	if res.Outcome != "applied" {
		t.Errorf("outcome = %q, want applied", res.Outcome)
	}
	if res.Seq == 0 {
		t.Error("expected a change_log seq > 0")
	}
	var name string
	var qty int
	if err := s.db.QueryRow(`SELECT name, quantity FROM trip_items WHERE id = 'item-1'`).Scan(&name, &qty); err != nil {
		t.Fatalf("row not persisted: %v", err)
	}
	if name != "Unterhosen" || qty != 5 {
		t.Errorf("persisted (%q, %d), want (Unterhosen, 5)", name, qty)
	}
}

// NFR-4.2a: the losing side of an LWW merge must be auditable in the
// conflict_log and reported to the pushing client.
func TestApplyMutation_LWWConflict_WritesConflictLog(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seed := upsert("item-1", "mut-1", map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 5}, "0000000002000-0000-bbbbbbbb")
	if _, err := s.ApplyMutation(ctx, testTrip, seed); err != nil {
		t.Fatalf("seed: %v", err)
	}

	stale := upsert("item-1", "mut-2", map[string]any{"quantity": 9}, "0000000001000-0000-aaaaaaaa")
	res, err := s.ApplyMutation(ctx, testTrip, stale)
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	if res.Outcome != "merged" {
		t.Errorf("outcome = %q, want merged", res.Outcome)
	}
	if len(res.Conflicts) != 1 || res.Conflicts[0].Field != "quantity" {
		t.Fatalf("conflicts = %v, want one for quantity", res.Conflicts)
	}
	var qty int
	if err := s.db.QueryRow(`SELECT quantity FROM trip_items WHERE id = 'item-1'`).Scan(&qty); err != nil {
		t.Fatal(err)
	}
	if qty != 5 {
		t.Errorf("quantity = %d, want 5 (stale write must not win)", qty)
	}
	var logged int
	if err := s.db.QueryRow(`SELECT count(*) FROM conflict_log WHERE entity_id = 'item-1' AND field = 'quantity'`).Scan(&logged); err != nil {
		t.Fatal(err)
	}
	if logged != 1 {
		t.Errorf("conflict_log rows = %d, want 1", logged)
	}
}

// Sync-API Spec P-5: replaying a mutation_id returns the recorded result
// without touching the data again.
func TestApplyMutation_DuplicateMutationID_ReturnsRecordedResult(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	m := upsert("item-1", "mut-1", map[string]any{"trip_id": testTrip, "name": "Helm", "quantity": 1}, "0000000001000-0000-aaaaaaaa")
	first, err := s.ApplyMutation(ctx, testTrip, m)
	if err != nil {
		t.Fatalf("first apply: %v", err)
	}

	replay, err := s.ApplyMutation(ctx, testTrip, m)
	if err != nil {
		t.Fatalf("replay: %v", err)
	}

	if replay.Outcome != "duplicate" {
		t.Errorf("outcome = %q, want duplicate", replay.Outcome)
	}
	if replay.Seq != first.Seq {
		t.Errorf("replay seq = %d, want recorded %d", replay.Seq, first.Seq)
	}
	var changes int
	if err := s.db.QueryRow(`SELECT count(*) FROM change_log WHERE entity_id = 'item-1'`).Scan(&changes); err != nil {
		t.Fatal(err)
	}
	if changes != 1 {
		t.Errorf("change_log rows = %d, want 1 (replay must not append)", changes)
	}
}

// Sync-API Spec §4: pull returns full row snapshots after the cursor,
// compacted to the latest state per entity.
func TestPull_ReturnsCompactedSnapshotsAfterCursor(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	s.mustApply(t, testTrip, upsert("item-1", "m1", map[string]any{"trip_id": testTrip, "name": "Unterhosen", "quantity": 5}, "0000000001000-0000-aaaaaaaa"))
	s.mustApply(t, testTrip, upsert("item-2", "m2", map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 4}, "0000000001000-0001-aaaaaaaa"))
	s.mustApply(t, testTrip, upsert("item-1", "m3", map[string]any{"quantity": 6}, "0000000001000-0002-aaaaaaaa"))

	page, err := s.Pull(ctx, testTrip, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}

	if len(page.Changes) != 2 {
		t.Fatalf("changes = %d, want 2 (item-1 compacted)", len(page.Changes))
	}
	byID := map[string]Change{}
	for _, c := range page.Changes {
		byID[c.ID] = c
	}
	if got := byID["item-1"].Row["quantity"]; got != int64(6) {
		t.Errorf("item-1 snapshot quantity = %v, want 6 (latest state)", got)
	}
	if page.NextCursor != 3 {
		t.Errorf("next_cursor = %d, want 3", page.NextCursor)
	}
	if page.HasMore {
		t.Error("has_more = true, want false")
	}
}

func TestPull_CursorSkipsAlreadyAppliedChanges(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	s.mustApply(t, testTrip, upsert("item-1", "m1", map[string]any{"trip_id": testTrip, "name": "A"}, "0000000001000-0000-aaaaaaaa"))
	first, _ := s.Pull(ctx, testTrip, 0, 100)
	s.mustApply(t, testTrip, upsert("item-2", "m2", map[string]any{"trip_id": testTrip, "name": "B"}, "0000000001000-0001-aaaaaaaa"))

	page, err := s.Pull(ctx, testTrip, first.NextCursor, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}

	if len(page.Changes) != 1 || page.Changes[0].ID != "item-2" {
		t.Errorf("changes = %+v, want exactly item-2", page.Changes)
	}
}

func TestPull_DeletedRowAppearsAsTombstone(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	s.mustApply(t, testTrip, upsert("item-1", "m1", map[string]any{"trip_id": testTrip, "name": "Kissen"}, "0000000001000-0000-aaaaaaaa"))
	s.mustApply(t, testTrip, sync.Mutation{
		MutationID: "m2", Op: sync.OpDelete, Table: "trip_items", ID: "item-1",
		HLC: sync.HLC("0000000002000-0000-aaaaaaaa"),
	})

	page, err := s.Pull(ctx, testTrip, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}

	if len(page.Changes) != 1 {
		t.Fatalf("changes = %d, want 1 compacted tombstone", len(page.Changes))
	}
	c := page.Changes[0]
	if !c.Deleted || c.Row != nil {
		t.Errorf("got (deleted=%v, row=%v), want tombstone with nil row", c.Deleted, c.Row)
	}
}

func TestPull_LimitPaginationSignalsHasMore(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	s.mustApply(t, testTrip, upsert("item-1", "m1", map[string]any{"trip_id": testTrip, "name": "A"}, "0000000001000-0000-aaaaaaaa"))
	s.mustApply(t, testTrip, upsert("item-2", "m2", map[string]any{"trip_id": testTrip, "name": "B"}, "0000000001000-0001-aaaaaaaa"))

	page, err := s.Pull(ctx, testTrip, 0, 1)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}

	if !page.HasMore {
		t.Error("has_more = false, want true")
	}
	rest, err := s.Pull(ctx, testTrip, page.NextCursor, 1)
	if err != nil {
		t.Fatalf("Pull rest: %v", err)
	}
	if len(rest.Changes) != 1 || rest.Changes[0].ID != "item-2" {
		t.Errorf("second page = %+v, want item-2", rest.Changes)
	}
}

func TestApplyMutation_RejectsUnknownTableAndColumns(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	cases := []struct {
		name string
		m    sync.Mutation
	}{
		{"unknown table", sync.Mutation{MutationID: "m1", Op: sync.OpUpsert, Table: "users", ID: "x", Fields: map[string]any{"display_name": "hack"}, HLC: "0000000001000-0000-aaaaaaaa"}},
		{"unknown column", upsert("item-1", "m2", map[string]any{"trip_id": testTrip, "name": "A", "evil; DROP TABLE": 1}, "0000000001000-0000-aaaaaaaa")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := s.ApplyMutation(ctx, testTrip, tc.m); err == nil {
				t.Error("expected validation error, got nil")
			}
		})
	}
}

func (s *Store) mustApply(t *testing.T, tripID string, m sync.Mutation) {
	t.Helper()
	if _, err := s.ApplyMutation(context.Background(), tripID, m); err != nil {
		t.Fatalf("ApplyMutation(%s): %v", m.MutationID, err)
	}
}
