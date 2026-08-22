package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// The trip partition is confined to the trip its endpoint names (Sync-API
// P-3). Membership is checked for the trip in the URL, so a mutation that
// reaches past it — targeting a row of another trip, or naming another trip
// in its own fields — would let any member of any trip read, change, delete
// and seed rows of every other trip, with the change_log entry landing under
// the *endpoint's* trip so the real owners are never told.

const otherTrip = "trip-other"

// foreignRow describes one trip-partition table: how to seed a row that
// belongs to otherTrip, and which syncable field a mutation would change.
type foreignRow struct {
	table  string
	seed   string
	field  string
	before string
}

func foreignRows() []foreignRow {
	return []foreignRow{
		{
			table:  TableTripItems,
			seed:   `INSERT INTO trip_items (id, trip_id, name) VALUES (?, ?, 'Fremde Zeile')`,
			field:  "name",
			before: "Fremde Zeile",
		},
		{
			table:  TableTravelers,
			seed:   `INSERT INTO travelers (id, trip_id, name) VALUES (?, ?, 'Fremde Zeile')`,
			field:  "name",
			before: "Fremde Zeile",
		},
		{
			table:  TableContainers,
			seed:   `INSERT INTO containers (id, trip_id, name) VALUES (?, ?, 'Fremde Zeile')`,
			field:  "name",
			before: "Fremde Zeile",
		},
		{
			table:  TableComments,
			seed:   `INSERT INTO comments (id, trip_id, author_id, body) VALUES (?, ?, '` + testUser + `', 'Fremde Zeile')`,
			field:  "body",
			before: "Fremde Zeile",
		},
		{
			table: TableTripGeneratedPositions,
			seed: `INSERT INTO trip_generated_positions
			       (id, trip_id, trip_item_id, source_template_id, source_item_id, name, quantity, mode)
			       VALUES (?, ?, 'ti-x', 'tpl-x', 'it-x', 'Fremde Zeile', 1, 'pack')`,
			field:  "name",
			before: "Fremde Zeile",
		},
	}
}

// seedForeignTrip creates the second trip and one row of the given table
// inside it, and returns that row's id.
func seedForeignTrip(t *testing.T, s *Store, r foreignRow) string {
	t.Helper()
	mustExec(t, s, `INSERT OR IGNORE INTO trips (id, name, year) VALUES (?, 'Fremde Reise', 2026)`, otherTrip)
	id := "foreign-" + r.table
	mustExec(t, s, r.seed, id, otherTrip)
	return id
}

func fieldValue(t *testing.T, s *Store, r foreignRow, id string) string {
	t.Helper()
	var got string
	if err := s.db.QueryRow(`SELECT `+r.field+` FROM `+r.table+` WHERE id = ?`, id).Scan(&got); err != nil {
		t.Fatalf("%s %s: %v", r.table, id, err)
	}
	return got
}

func TestApplyMutation_UpsertOfAnotherTripsRow_RejectedAndRowUntouched(t *testing.T) {
	for _, r := range foreignRows() {
		t.Run(r.table, func(t *testing.T) {
			s := openTestStore(t)
			id := seedForeignTrip(t, s, r)

			m := sync.Mutation{
				MutationID: "mut-1", Op: sync.OpUpsert, Table: r.table, ID: id,
				Fields: map[string]any{r.field: "GEKAPERT"},
				HLC:    sync.HLC("0000000009000-0000-aaaaaaaa"),
			}
			res, err := s.ApplyMutation(context.Background(), testTrip, m)
			if err != nil {
				t.Fatalf("ApplyMutation: %v", err)
			}

			if res.Outcome != "rejected" {
				t.Errorf("outcome = %q, want rejected", res.Outcome)
			}
			if got := fieldValue(t, s, r, id); got != r.before {
				t.Errorf("%s.%s = %q, want %q — a foreign trip's row was written", r.table, r.field, got, r.before)
			}
			// The read half of the leak: a change_log entry under the
			// endpoint's trip makes Pull hand the foreign row's full
			// snapshot to everyone in this trip.
			var logged int
			if err := s.db.QueryRow(
				`SELECT count(*) FROM change_log WHERE entity_id = ?`, id).Scan(&logged); err != nil {
				t.Fatal(err)
			}
			if logged != 0 {
				t.Errorf("change_log entries for the foreign row = %d, want 0", logged)
			}
		})
	}
}

func TestApplyMutation_DeleteOfAnotherTripsRow_RejectedAndRowSurvives(t *testing.T) {
	for _, r := range foreignRows() {
		t.Run(r.table, func(t *testing.T) {
			s := openTestStore(t)
			id := seedForeignTrip(t, s, r)

			m := sync.Mutation{
				MutationID: "mut-1", Op: sync.OpDelete, Table: r.table, ID: id,
				HLC: sync.HLC("0000000009000-0000-aaaaaaaa"),
			}
			res, err := s.ApplyMutation(context.Background(), testTrip, m)
			if err != nil {
				t.Fatalf("ApplyMutation: %v", err)
			}

			if res.Outcome != "rejected" {
				t.Errorf("outcome = %q, want rejected", res.Outcome)
			}
			var alive int
			if err := s.db.QueryRow(
				`SELECT count(*) FROM `+r.table+` WHERE id = ?`, id).Scan(&alive); err != nil {
				t.Fatal(err)
			}
			if alive != 1 {
				t.Errorf("rows left = %d, want 1 — a foreign trip's row was deleted", alive)
			}
		})
	}
}

func TestApplyMutation_InsertNamingAnotherTrip_RejectedAndNothingSeeded(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES (?, 'Fremde Reise', 2026)`, otherTrip)

	m := sync.Mutation{
		MutationID: "mut-1", Op: sync.OpInsert, Table: TableTripItems, ID: "injected",
		Fields: map[string]any{"trip_id": otherTrip, "name": "Geschmuggelt"},
		HLC:    sync.HLC("0000000009000-0000-aaaaaaaa"),
	}
	res, err := s.ApplyMutation(context.Background(), testTrip, m)
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	if res.Outcome != "rejected" {
		t.Errorf("outcome = %q, want rejected", res.Outcome)
	}
	var rows int
	if err := s.db.QueryRow(`SELECT count(*) FROM trip_items WHERE id = 'injected'`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Error("a row was seeded into another trip")
	}
}

func TestApplyMutation_UpsertMovingItsRowToAnotherTrip_Rejected(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES (?, 'Fremde Reise', 2026)`, otherTrip)
	seed := upsert("item-1", "mut-1", map[string]any{"trip_id": testTrip, "name": "Socken"}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, seed); err != nil {
		t.Fatalf("seed: %v", err)
	}

	move := upsert("item-1", "mut-2", map[string]any{"trip_id": otherTrip}, "0000000009000-0000-bbbbbbbb")
	res, err := s.ApplyMutation(ctx, testTrip, move)
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	if res.Outcome != "rejected" {
		t.Errorf("outcome = %q, want rejected", res.Outcome)
	}
	var trip string
	if err := s.db.QueryRow(`SELECT trip_id FROM trip_items WHERE id = 'item-1'`).Scan(&trip); err != nil {
		t.Fatal(err)
	}
	if trip != testTrip {
		t.Errorf("trip_id = %q, want %q — a row was moved out of its trip", trip, testTrip)
	}
}

// A mutation for an unknown row that names no trip cannot be placed in any
// trip. It is refused with `rejected` rather than a failed transaction: the
// client parks a refusal, while an error fails the whole push batch and the
// outbox retries it forever.
func TestApplyMutation_UpsertOfUnknownRowWithoutTrip_RejectedNotErrored(t *testing.T) {
	s := openTestStore(t)

	m := upsert("never-seen", "mut-1", map[string]any{"name": "Waise"}, "0000000009000-0000-aaaaaaaa")
	res, err := s.ApplyMutation(context.Background(), testTrip, m)

	if err != nil {
		t.Fatalf("ApplyMutation returned an error, want a rejected result: %v", err)
	}
	if res.Outcome != "rejected" {
		t.Errorf("outcome = %q, want rejected", res.Outcome)
	}
}

// The positive counterpart: the confinement must reject foreign trips only,
// never the ordinary traffic of the trip it guards.
func TestApplyMutation_OwnTripTraffic_StillApplies(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	insert := sync.Mutation{
		MutationID: "mut-1", Op: sync.OpInsert, Table: TableTripItems, ID: "item-1",
		Fields: map[string]any{"trip_id": testTrip, "name": "Socken"},
		HLC:    sync.HLC("0000000001000-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, insert); err != nil || res.Outcome != "applied" {
		t.Fatalf("insert: outcome %q err %v, want applied", res.Outcome, err)
	}

	// A partial upsert carries no trip_id at all — the common shape, and it
	// must stay applied because the existing row already names the trip.
	partial := upsert("item-1", "mut-2", map[string]any{"quantity": 3}, "0000000002000-0000-bbbbbbbb")
	if res, err := s.ApplyMutation(ctx, testTrip, partial); err != nil || res.Outcome != "applied" {
		t.Fatalf("partial upsert: outcome %q err %v, want applied", res.Outcome, err)
	}

	// Naming its own trip is fine as well.
	explicit := upsert("item-1", "mut-3", map[string]any{"trip_id": testTrip, "quantity": 4}, "0000000003000-0000-cccccccc")
	if res, err := s.ApplyMutation(ctx, testTrip, explicit); err != nil || res.Outcome != "applied" {
		t.Fatalf("explicit upsert: outcome %q err %v, want applied", res.Outcome, err)
	}

	del := sync.Mutation{
		MutationID: "mut-4", Op: sync.OpDelete, Table: TableTripItems, ID: "item-1",
		HLC: sync.HLC("0000000004000-0000-dddddddd"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, del); err != nil || res.Outcome != "applied" {
		t.Fatalf("delete: outcome %q err %v, want applied", res.Outcome, err)
	}
}

// The refusal is memoised like every other outcome — a retry of the same
// mutation_id reports `duplicate` and, above all, does not write the row on
// the second attempt.
func TestApplyMutation_RejectedForeignMutation_IsNotAppliedOnReplay(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	r := foreignRows()[0]
	id := seedForeignTrip(t, s, r)

	m := sync.Mutation{
		MutationID: "mut-1", Op: sync.OpUpsert, Table: r.table, ID: id,
		Fields: map[string]any{r.field: "GEKAPERT"},
		HLC:    sync.HLC("0000000009000-0000-aaaaaaaa"),
	}
	if _, err := s.ApplyMutation(ctx, testTrip, m); err != nil {
		t.Fatalf("first: %v", err)
	}

	res, err := s.ApplyMutation(ctx, testTrip, m)
	if err != nil {
		t.Fatalf("replay: %v", err)
	}
	if res.Outcome != "duplicate" {
		t.Errorf("replayed outcome = %q, want duplicate", res.Outcome)
	}
	if got := fieldValue(t, s, r, id); got != r.before {
		t.Errorf("%s.%s = %q, want %q", r.table, r.field, got, r.before)
	}
}
