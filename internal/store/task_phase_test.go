package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// FR-7.7: when a task is due is a stored statement, not a reading. Nothing
// else in the row separates „not done yet" from „always meant for later",
// which is the whole distinction the phase carries — and the salve that was
// not fetched before departure has to be able to change it.
func TestSchema_TaskPhaseAndResolutionRecord_FR7_7(t *testing.T) {
	s := openTestStore(t)

	have := columns(t, s.db, "comments")
	for _, column := range []string{"phase", "resolved_at", "resolved_by_user_id"} {
		if !have[column] {
			t.Errorf("comments.%s missing — FR-7.7 has nowhere to record it", column)
		}
	}
	if !columns(t, s.db, "template_tasks")["phase"] {
		t.Error("template_tasks.phase missing — a template must be able to author a during-task")
	}

	// Nullable and free of a CHECK, like every other column of this table
	// (ADR-022): a constraint that can refuse a single-field mutation loses
	// the user's choice, and NULL is how a task that predates the phase reads.
	if _, err := s.db.Exec(
		`INSERT INTO comments (id, trip_id, author_id, body, is_task, task_state)
		 VALUES ('task-unphased', ?, ?, 'Salbe holen', 1, 'open')`, testTrip, testUser); err != nil {
		t.Fatalf("a task without a phase was refused: %v", err)
	}
}

// The whitelist is the contract (Sync-API §5). The phase and the time may be
// sent by the client; the person may not — but the column is still on the
// list, because the server's own stamp is persisted through the same path
// (invariant 3, as for packed_by_user_id).
func TestPush_TaskColumnsAreSyncable_FR7_7(t *testing.T) {
	for _, column := range []string{"phase", "resolved_at", "resolved_by_user_id"} {
		if !syncableColumns[TableComments][column] {
			t.Errorf("comments.%s is not on the sync whitelist — FR-7.7 is shared trip data", column)
		}
	}
	if !syncableColumns[TableTemplateTasks]["phase"] {
		t.Error("template_tasks.phase is not on the sync whitelist")
	}
}

// NFR-4.2a: the phase merges on its own. Moving the salve to *during* writes
// that field and nothing else, so a body another device edited meanwhile
// survives — and a push carrying only the phase must be applied rather than
// refused, since a refused mutation is one the outbox drops.
func TestApplyMutation_TaskPhaseIsWritableOnItsOwn_FR7_7(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	apply := func(mutationID string, fields map[string]any, hlc string) {
		t.Helper()
		res, err := s.ApplyMutation(ctx, testTrip, testUser, sync.Mutation{
			MutationID: mutationID, Op: sync.OpUpsert, Table: TableComments, ID: "task-salbe",
			Fields: fields, HLC: sync.HLC(hlc),
		})
		if err != nil {
			t.Fatalf("ApplyMutation %s: %v", mutationID, err)
		}
		if res.Outcome != "applied" {
			t.Fatalf("%s outcome = %q (reason %q), want applied", mutationID, res.Outcome, res.Reason)
		}
	}

	res, err := s.ApplyMutation(ctx, testTrip, testUser, sync.Mutation{
		MutationID: "t1", Op: sync.OpInsert, Table: TableComments, ID: "task-salbe",
		Fields: map[string]any{
			"trip_id": testTrip, "trip_item_id": nil, "author_id": testUser,
			"body": "Salbe in der Apotheke holen", "is_task": 1, "task_state": "open",
			"phase": "before",
		},
		HLC: sync.HLC("0000000001000-0000-aaaaaaaa"),
	})
	if err != nil || res.Outcome != "applied" {
		t.Fatalf("insert: %v, outcome %q", err, res.Outcome)
	}

	// The crossing: the trip has begun and the salve was never fetched.
	apply("t2", map[string]any{"phase": "during"}, "0000000002000-0000-aaaaaaaa")
	// Ticked off at the destination, with the record the server stamped.
	apply("t3", map[string]any{
		"task_state": "resolved", "resolved_at": "2026-09-21T09:15:00.000Z",
		"resolved_by_user_id": testUser,
	}, "0000000003000-0000-aaaaaaaa")

	row := taskRow(t, s, "task-salbe")
	if row["phase"] != "during" {
		t.Errorf("phase = %v, want %q", row["phase"], "during")
	}
	if row["body"] != "Salbe in der Apotheke holen" {
		t.Errorf("body = %v — a single-field phase write must leave the words alone", row["body"])
	}
	if row["resolved_by_user_id"] != testUser || row["resolved_at"] == nil {
		t.Errorf("resolution record = %v / %v, want both written",
			row["resolved_by_user_id"], row["resolved_at"])
	}

	// Unticked again: the record is cleared with the state it described.
	apply("t4", map[string]any{
		"task_state": "open", "resolved_at": nil, "resolved_by_user_id": nil,
	}, "0000000004000-0000-aaaaaaaa")

	row = taskRow(t, s, "task-salbe")
	if row["resolved_at"] != nil || row["resolved_by_user_id"] != nil {
		t.Errorf("resolution record = %v / %v after reopening, want both NULL",
			row["resolved_by_user_id"], row["resolved_at"])
	}
	if row["phase"] != "during" {
		t.Errorf("phase = %v — reopening a task must not move it back", row["phase"])
	}
}

// taskRow reads one comments row back the way a client sees it: through the
// trip partition's own feed.
func taskRow(t *testing.T, s *Store, id string) map[string]any {
	t.Helper()
	page, err := s.Pull(context.Background(), testTrip, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	for _, c := range page.Changes {
		if c.Table == TableComments && c.ID == id {
			return c.Row
		}
	}
	t.Fatalf("comment %q not in the feed", id)
	return nil
}
