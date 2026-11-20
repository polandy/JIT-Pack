package store

import (
	"context"
	"fmt"
	"maps"
	"testing"

	"jitpack/internal/sync"
)

// An insert that finds the row already there is a write onto somebody's row,
// not its creation: the actor column decided by the creating insert stays
// (invariant 3), whether the second insert forges it or leaves it out.
func TestApplyMutation_InsertOntoExistingRow_KeepsTheAuthor_Invariant3(t *testing.T) {
	tests := []struct {
		table, column string
		fields        map[string]any
	}{
		{TableComments, columnAuthorID, map[string]any{"trip_id": testTrip, "body": "Pass mitnehmen"}},
		{TableIdeas, columnAuthorID, map[string]any{"trip_id": testTrip, "title": "Museo Nivola"}},
		{TableIdeaVotes, columnUserID, map[string]any{"trip_id": testTrip, "idea_id": "idea-1", "vote": "up"}},
		{TableIdeaComments, columnAuthorID, map[string]any{"trip_id": testTrip, "idea_id": "idea-1", "body": "Montags zu"}},
		{TableDayEntries, columnAuthorID, map[string]any{"trip_id": testTrip, "on_date": "2026-07-14", "title": "Tisch"}},
		{TableNoteAcks, columnUserID, map[string]any{"trip_id": testTrip, "comment_id": "note-1", "acked": 1}},
	}
	for _, tc := range tests {
		for _, forge := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/forged=%v", tc.table, forge), func(t *testing.T) {
				s := openPlannerStore(t)
				ctx := context.Background()
				mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body) VALUES ('note-1', ?, ?, 'Hinweis')`,
					testTrip, testUser)
				create := sync.Mutation{MutationID: "m1", Op: sync.OpInsert, Table: tc.table, ID: "row-1",
					Fields: maps.Clone(tc.fields), HLC: sync.HLC("0000000001000-0000-aaaaaaaa")}
				if res, err := s.ApplyMutation(ctx, testTrip, testUser, create); err != nil || res.Outcome != sync.OutcomeApplied {
					t.Fatalf("create: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
				}

				again := sync.Mutation{MutationID: "m2", Op: sync.OpInsert, Table: tc.table, ID: "row-1",
					Fields: maps.Clone(tc.fields), HLC: sync.HLC("0000000002000-0000-bbbbbbbb")}
				if forge {
					again.Fields[tc.column] = testUserSia
				}
				if _, err := s.ApplyMutation(ctx, testTrip, testUserSia, again); err != nil {
					t.Fatalf("second insert: %v", err)
				}

				var got string
				if err := s.db.QueryRow(`SELECT ` + tc.column + ` FROM ` + tc.table + ` WHERE id = 'row-1'`).Scan(&got); err != nil {
					t.Fatal(err)
				}
				if got != testUser {
					t.Errorf("%s = %q (forged %v), want the creator %q", tc.column, got, forge, testUser)
				}
			})
		}
	}
}
