package store

import (
	"context"
	"strings"
	"testing"

	"jitpack/internal/sync"
)

// Which invariants the schema may enforce, and which it may not.
//
// This is an offline-first system with field-level LWW (NFR-4.2a): a
// constraint violation on the push path becomes a `rejected` mutation,
// which the client's outbox drops — the user's change is gone. A
// CHECK or UNIQUE that can refuse a *legitimate* offline mutation
// therefore costs more than the invariant it buys, and the tests below
// state both halves: what the schema does enforce, and what it must keep
// accepting so the next reader does not "tighten" it back.

// FR-4.5: a trip has exactly one Owner, the creator. Clients cannot reach
// the role at all (authorizeMaster refuses any client-sent 'owner' and
// freezes the creator's row), so the partial unique index below can only
// ever be hit by a server bug — which is exactly what it is there to catch.
func TestSchema_TripHasExactlyOneOwner(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTrips, "trip-owned", "ow-1",
		map[string]any{"name": "Samedan", "year": 2027}, "0000000001000-0000-aaaaaaaa"))

	t.Run("a client cannot push a second owner", func(t *testing.T) {
		res := applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTripMembers, "mem-b", "ow-2",
			map[string]any{"trip_id": "trip-owned", "user_id": testUserB, "role": RoleOwner},
			"0000000001001-0000-aaaaaaaa"))
		if res.Outcome != sync.OutcomeRejected {
			t.Errorf("outcome = %q, want rejected", res.Outcome)
		}
	})

	t.Run("a client cannot promote an existing member", func(t *testing.T) {
		applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTripMembers, "mem-b2", "ow-3",
			map[string]any{"trip_id": "trip-owned", "user_id": testUserB, "role": RoleEditor},
			"0000000001002-0000-aaaaaaaa"))
		res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTripMembers, "mem-b2", "ow-4",
			map[string]any{"role": RoleOwner}, "0000000001003-0000-aaaaaaaa"))
		if res.Outcome != sync.OutcomeRejected {
			t.Errorf("outcome = %q, want rejected", res.Outcome)
		}
	})

	// The positive signal both subtests are asserted against.
	var owners int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM trip_members WHERE trip_id = 'trip-owned' AND role = ?`, RoleOwner).
		Scan(&owners); err != nil {
		t.Fatal(err)
	}
	if owners != 1 {
		t.Errorf("owner rows = %d, want exactly 1 (FR-4.5)", owners)
	}

	t.Run("and the schema refuses one anyway", func(t *testing.T) {
		// A third account, so the refusal can only come from the owner
		// index and not from UNIQUE (trip_id, user_id).
		mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-carla', 'auth|carla', 'Carla')`)
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO trip_members (id, trip_id, user_id, role) VALUES ('mem-x', 'trip-owned', 'user-carla', ?)`,
			RoleOwner)
		if err == nil {
			t.Fatal("a second owner row was inserted; the partial unique index is missing")
		}
		if !isConstraintViolation(err) {
			t.Fatalf("err = %v, want a constraint violation", err)
		}
	})
}

// FR-5.5 says a skip writes both `state = 'skipped'` and quantity 0, and
// the client does send both. A CHECK coupling them would still be a trap:
// the merge decides the two fields separately, so a concurrent newer
// quantity leaves the skip applied on its own — and under such a CHECK the
// whole push would be refused and the user's skip lost.
func TestApplyMutation_SkipSurvivesWhenOnlyItsStateIsApplied(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyTrip := func(m sync.Mutation) MutationResult {
		t.Helper()
		res, err := s.ApplyMutation(ctx, testTrip, testUser, m)
		if err != nil {
			t.Fatalf("ApplyMutation: %v", err)
		}
		return res
	}

	applyTrip(upsert("ti-skip", "sk-1", map[string]any{
		"trip_id": testTrip, "name": "Sonnencreme", "quantity": 1,
	}, "0000000001000-0000-aaaaaaaa"))
	// Another device raises the amount, with a clock the skip below loses to.
	applyTrip(upsert("ti-skip", "sk-2", map[string]any{"quantity": 3}, "0000000003000-0000-bbbbbbbb"))

	res := applyTrip(upsert("ti-skip", "sk-3", map[string]any{
		"quantity": 0, "packed_count": 0, "state": "skipped",
	}, "0000000002000-0000-aaaaaaaa"))
	if res.Outcome != sync.OutcomeMerged {
		t.Fatalf("outcome = %q, want merged (the quantity lost, the state did not)", res.Outcome)
	}

	var state string
	var quantity int
	if err := s.db.QueryRowContext(ctx,
		`SELECT state, quantity FROM trip_items WHERE id = 'ti-skip'`).Scan(&state, &quantity); err != nil {
		t.Fatal(err)
	}
	if state != "skipped" {
		t.Errorf("state = %q, want skipped — the skip must survive its own quantity losing", state)
	}
	if quantity != 3 {
		t.Errorf("quantity = %d, want 3 — this pairing is legal on purpose (FR-5.5)", quantity)
	}
}

// FR-24.2's "the first tag is the primary tag" must not become
// UNIQUE (item_id, position): reordering N tags is N separate row updates,
// so every intermediate state has two rows at one position and one of the
// pushes would be refused. What decides the primary tag on a tie is a
// deterministic read-time rule instead (client/src/domain/tags.ts).
func TestApplyMasterMutation_TagReorderPassesThroughACollidingPosition(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-t', 'Regenjacke')`)
	mustExec(t, s, `INSERT INTO tags (id, name) VALUES ('tag-1', 'Kleidung'), ('tag-2', 'Regen')`)

	assign := func(id, tagID string, position int, mutationID, hlc string) sync.Outcome {
		t.Helper()
		return applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItemTags, id, mutationID,
			map[string]any{"item_id": "item-t", "tag_id": tagID, "position": position}, hlc)).Outcome
	}
	assign("it-1", "tag-1", 0, "tg-1", "0000000001000-0000-aaaaaaaa")
	assign("it-2", "tag-2", 1, "tg-2", "0000000001001-0000-aaaaaaaa")

	// The swap, one row at a time — the middle step is the collision.
	if got := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableItemTags, "it-2", "tg-3",
		map[string]any{"position": 0}, "0000000002000-0000-aaaaaaaa")).Outcome; got != sync.OutcomeApplied {
		t.Fatalf("first half of the reorder: outcome = %q, want applied", got)
	}
	if got := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableItemTags, "it-1", "tg-4",
		map[string]any{"position": 1}, "0000000002001-0000-aaaaaaaa")).Outcome; got != sync.OutcomeApplied {
		t.Fatalf("second half of the reorder: outcome = %q, want applied", got)
	}

	var positions string
	if err := s.db.QueryRow(
		`SELECT group_concat(tag_id || ':' || position, ',') FROM item_tags
		 WHERE item_id = 'item-t' ORDER BY position`).Scan(&positions); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(positions, "tag-2:0") || !strings.Contains(positions, "tag-1:1") {
		t.Errorf("positions = %q, want the reorder to have landed whole", positions)
	}
}

// The conflict log's two hot queries — the per-partition listing and the
// revert's group lookup — must not full-scan. Asserted through the query
// planner rather than through a timing, which would only *probably* hold.
func TestSchema_ConflictLogQueriesUseAnIndex(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	tests := []struct {
		name  string
		query string
		args  []any
	}{
		{
			name:  "a trip listing",
			query: `SELECT ` + conflictColumns + ` FROM conflict_log WHERE trip_id = ?` + conflictOrder,
			args:  []any{testTrip},
		},
		{
			name:  "the master listing",
			query: `SELECT ` + conflictColumns + ` FROM conflict_log WHERE trip_id IS NULL` + conflictOrder,
		},
		{
			name: "the revert group lookup",
			query: `SELECT id, field, losing_value FROM conflict_log
			        WHERE mutation_id = ? AND entity_table = ? AND entity_id = ?`,
			args: []any{"mut-1", TableTripItems, "ti-1"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows, err := s.db.QueryContext(ctx, `EXPLAIN QUERY PLAN `+tt.query, tt.args...)
			if err != nil {
				t.Fatalf("explain: %v", err)
			}
			defer rows.Close()
			plan := []string{}
			for rows.Next() {
				var id, parent, notused int
				var detail string
				if err := rows.Scan(&id, &parent, &notused, &detail); err != nil {
					t.Fatal(err)
				}
				plan = append(plan, detail)
			}
			if err := rows.Err(); err != nil {
				t.Fatal(err)
			}
			joined := strings.Join(plan, " | ")
			if strings.Contains(joined, "SCAN conflict_log") {
				t.Errorf("plan = %q, want an index search rather than a full scan", joined)
			}
		})
	}
}

// FR-1.6 MVP: templates are shared instance-wide, so their names must be
// unique instance-wide too — FR-18.2/18.4 link an imported group by name,
// and FR-27.5/27.15 recognition keys on the same shared set. The accepted
// cost is on the offline path and is stated in FR-1.6: two devices that
// each create "Sommer" while offline converge on one, and the later push
// is rejected rather than merged.
func TestApplyMasterMutation_TemplateAndSeriesNamesAreInstanceWide(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)

	tests := []struct {
		name, table string
		fields      map[string]any
	}{
		{"templates", TableTemplates, map[string]any{"name": "Sommer", "kind": KindGroup}},
		{"trip_series", TableTripSeries, map[string]any{"name": "Samedan Sommer"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			first := applyMaster(t, s, testUser, masterMut(sync.OpInsert, tt.table, "u-"+tt.name+"-1",
				"un-"+tt.name+"-1", tt.fields, "0000000001000-0000-aaaaaaaa"))
			if first.Outcome != sync.OutcomeApplied {
				t.Fatalf("first insert outcome = %q, want applied", first.Outcome)
			}
			second := applyMaster(t, s, testUserB, masterMut(sync.OpInsert, tt.table, "u-"+tt.name+"-2",
				"un-"+tt.name+"-2", tt.fields, "0000000001001-0000-bbbbbbbb"))
			if second.Outcome != sync.OutcomeRejected {
				t.Errorf("a second account's same name: outcome = %q, want rejected", second.Outcome)
			}

			var rows int
			if err := s.db.QueryRow(
				`SELECT count(*) FROM `+tt.table+` WHERE name = ?`, tt.fields["name"]).Scan(&rows); err != nil {
				t.Fatal(err)
			}
			if rows != 1 {
				t.Errorf("rows named %q = %d, want 1", tt.fields["name"], rows)
			}
		})
	}
}

// The comments CHECK is deliberately one-directional. A task must carry a
// state — every todo row is rendered as open or resolved, so the forward
// half buys something that is actually read. The reverse (task_state only
// on a task) buys nothing but tidiness, and it would refuse the
// single-field demotion below, whose whole content is `is_task = 0`.
func TestApplyMutation_DemotingATaskCarriesOnlyIsTask(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	comment := func(mutationID string, op sync.Op, fields map[string]any, hlc sync.HLC) MutationResult {
		t.Helper()
		res, err := s.ApplyMutation(ctx, testTrip, testUser, sync.Mutation{
			MutationID: mutationID, Op: op, Table: TableComments,
			ID: "cm-1", Fields: fields, HLC: hlc,
		})
		if err != nil {
			t.Fatalf("ApplyMutation: %v", err)
		}
		return res
	}

	comment("cm-a", sync.OpInsert, map[string]any{
		"trip_id": testTrip, "author_id": testUser, "body": "Helm prüfen",
		"is_task": 1, "task_state": "open",
	}, "0000000001000-0000-aaaaaaaa")

	res := comment("cm-b", sync.OpUpsert, map[string]any{"is_task": 0}, "0000000002000-0000-aaaaaaaa")
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("outcome = %q, want applied — a demotion carries no task_state to clear with it", res.Outcome)
	}

	var isTask int
	var taskState *string
	if err := s.db.QueryRowContext(ctx,
		`SELECT is_task, task_state FROM comments WHERE id = 'cm-1'`).Scan(&isTask, &taskState); err != nil {
		t.Fatal(err)
	}
	if isTask != 0 {
		t.Errorf("is_task = %d, want 0", isTask)
	}
	if taskState == nil || *taskState != "open" {
		t.Errorf("task_state = %v, want the stale 'open' left in place: nothing reads it on a plain comment", taskState)
	}
}
