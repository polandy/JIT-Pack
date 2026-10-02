package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// FR-29.13: an excursion, a task or a shopping entry made from an idea names
// it by its own idea_id — one of its own trip; an idea already deleted when
// the result arrives costs the link, never the result.

// bridgeResults are the three tables a result is written to, each with the
// fields a minimal insert needs.
var bridgeResults = []struct {
	table  string
	fields map[string]any
}{
	{TableExcursions, map[string]any{"trip_id": testTrip, "name": "Gola Gorropu"}},
	{TableComments, map[string]any{
		"trip_id": testTrip, "author_id": testUser, "body": "Führer buchen", "is_task": 1, "task_state": "open",
	}},
	{TableShoppingEntries, map[string]any{"trip_id": testTrip, "name": "Stirnlampe", "list": "buy_local"}},
}

// seedBridge is openPlannerStore's idea-1 plus an idea of another trip.
func seedBridge(t *testing.T) *Store {
	t.Helper()
	s := openPlannerStore(t)
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES ('trip-other', 'Elsewhere', 2026)`)
	mustExec(t, s, `INSERT INTO ideas (id, trip_id, author_id, title) VALUES ('idea-foreign', 'trip-other', ?, 'Anderswo')`,
		testUser)
	return s
}

func resultColumn(t *testing.T, s *Store, table, id, column string) any {
	t.Helper()
	var v any
	if err := s.db.QueryRow(`SELECT `+column+` FROM `+table+` WHERE id = ?`, id).Scan(&v); err != nil {
		t.Fatalf("read %s.%s of %s: %v", table, column, id, err)
	}
	return v
}

func TestApplyMutation_IdeaResult_NamesAnIdeaOfItsTrip_FR29_13(t *testing.T) {
	cases := []struct {
		name     string
		ideaID   any
		wanted   sync.Outcome
		wantLink any
	}{
		{"an idea of its trip is kept", "idea-1", sync.OutcomeApplied, "idea-1"},
		{"no idea is a plain row", nil, sync.OutcomeApplied, nil},
		{"another trip's idea is refused", "idea-foreign", sync.OutcomeRejected, nil},
		{"an idea that is gone costs the link, not the row", "idea-deleted", sync.OutcomeApplied, nil},
	}
	for _, result := range bridgeResults {
		for _, tc := range cases {
			t.Run(result.table+"/"+tc.name, func(t *testing.T) {
				s := seedBridge(t)
				fields := map[string]any{columnIdeaID: tc.ideaID}
				for k, v := range result.fields {
					fields[k] = v
				}
				m := sync.Mutation{
					MutationID: "mut-r", Op: sync.OpInsert, Table: result.table, ID: "r-1",
					Fields: fields, HLC: sync.HLC("0000000002000-0000-aaaaaaaa"),
				}
				res, err := s.ApplyMutation(context.Background(), testTrip, testUser, m)
				if err != nil {
					t.Fatalf("ApplyMutation: %v", err)
				}
				if res.Outcome != tc.wanted {
					t.Fatalf("outcome = %q (reason %q), want %q", res.Outcome, res.Reason, tc.wanted)
				}
				if tc.wanted == sync.OutcomeRejected {
					if res.Reason != ReasonConstraintViolated {
						t.Errorf("reason = %q, want %q", res.Reason, ReasonConstraintViolated)
					}
					return
				}
				if got := resultColumn(t, s, result.table, "r-1", columnIdeaID); got != tc.wantLink {
					t.Errorf("idea_id = %v, want %v", got, tc.wantLink)
				}
			})
		}
	}
}

// A later upsert is checked as the insert is: the link may be set or moved
// afterwards, never to another trip's idea.
func TestApplyMutation_IdeaResult_LaterLinkIsCheckedToo_FR29_13(t *testing.T) {
	s := seedBridge(t)
	mustExec(t, s, `INSERT INTO shopping_entries (id, trip_id, name) VALUES ('se-1', ?, 'Brot')`, testTrip)
	m := sync.Mutation{
		MutationID: "mut-l", Op: sync.OpUpsert, Table: TableShoppingEntries, ID: "se-1",
		Fields: map[string]any{columnIdeaID: "idea-foreign"}, HLC: sync.HLC("0000000003000-0000-aaaaaaaa"),
	}
	res, err := s.ApplyMutation(context.Background(), testTrip, testUser, m)
	if err != nil || res.Outcome != sync.OutcomeRejected || res.Reason != ReasonConstraintViolated {
		t.Fatalf("outcome %q reason %q err %v, want rejected constraint_violated", res.Outcome, res.Reason, err)
	}
}

// Deleting the idea leaves what came of it, unlinked; deleting a result
// leaves the idea (decision #6).
func TestApplyMutation_DeletingAnIdeaKeepsWhatCameOfIt_FR29_13(t *testing.T) {
	s := seedBridge(t)
	mustExec(t, s, `INSERT INTO excursions (id, trip_id, name, idea_id) VALUES ('ex-1', ?, 'Gola', 'idea-1')`, testTrip)
	mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body, is_task, task_state, idea_id)
	                VALUES ('task-1', ?, ?, 'Führer buchen', 1, 'open', 'idea-1')`, testTrip, testUser)
	mustExec(t, s, `INSERT INTO shopping_entries (id, trip_id, name, idea_id) VALUES ('se-1', ?, 'Stirnlampe', 'idea-1')`,
		testTrip)

	del := sync.Mutation{
		MutationID: "mut-del", Op: sync.OpDelete, Table: TableIdeas, ID: "idea-1",
		HLC: sync.HLC("0000000003000-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(context.Background(), testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete idea: %v %+v", err, res)
	}
	for _, r := range []struct{ table, id string }{
		{TableExcursions, "ex-1"}, {TableComments, "task-1"}, {TableShoppingEntries, "se-1"},
	} {
		if got := resultColumn(t, s, r.table, r.id, columnIdeaID); got != nil {
			t.Errorf("%s idea_id = %v after the idea's delete, want NULL", r.table, got)
		}
	}
}
