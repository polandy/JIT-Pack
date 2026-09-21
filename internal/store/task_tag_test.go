package store

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"jitpack/internal/sync"
)

// FR-7.8: a task carries one tag, and the tags it may carry are a list of
// their own — not the inventory's, so that „what an item is" and „what a
// task is about" never have to be the same word (ADR-072).
func TestSchema_TaskCarriesOneTagOfItsOwn_FR7_8(t *testing.T) {
	s := openTestStore(t)

	have := columns(t, s.db, "task_tags")
	for _, column := range []string{"id", "name", "sort_order", MarkColumn} {
		if !have[column] {
			t.Errorf("task_tags.%s missing — FR-7.8's own vocabulary has nowhere to live", column)
		}
	}
	if !columns(t, s.db, "comments")["task_tag_id"] {
		t.Fatal("comments.task_tag_id missing — a task has nowhere to record its tag")
	}

	// Nullable and free of a CHECK, like every other column of this table
	// (ADR-022): most tasks never get a tag, and „no tag" is a state the
	// grouping names by where the task came from rather than an omission.
	if _, err := s.db.Exec(
		`INSERT INTO comments (id, trip_id, author_id, body, is_task, task_state)
		 VALUES ('task-untagged', ?, ?, 'Pflanzen giessen', 1, 'open')`, testTrip, testUser); err != nil {
		t.Fatalf("a task without a tag was refused: %v", err)
	}
}

// The whitelist is the contract (Sync-API §5), and it is the whole reason a
// tag set on one device reaches another. Nothing here is stamped: a tag is
// the user's statement about what a task is about, and invariant 3 is about
// identity claims, which a tag is not.
func TestPush_TaskTagColumnsAreSyncable_FR7_8(t *testing.T) {
	if !syncableColumns[TableComments]["task_tag_id"] {
		t.Error("comments.task_tag_id is not on the sync whitelist — the tag would never leave the device")
	}
	for _, column := range []string{"name", "sort_order", MarkColumn} {
		if !syncableColumns[TableTaskTags][column] {
			t.Errorf("task_tags.%s is not on the sync whitelist", column)
		}
	}
}

// The round trip, which is what the whitelist entry is *for*: a tag written
// on one device is stored and comes back out of the feed unchanged. The two
// halves travel on different partitions — the tag on the master feed, the
// task on its trip's — and the foreign key crosses that boundary the way
// trip_items.source_item_id already does.
func TestApplyMutation_TaskTagRoundTripsThroughTheTripFeed_FR7_8(t *testing.T) {
	s := openTestStore(t)

	seedTaskTag(t, s, "tt-apotheke", "Apotheke", "0000000001000-0000-aaaaaaaa")
	insertTask(t, s, "task-salbe", map[string]any{
		"trip_id": testTrip, "trip_item_id": nil, "author_id": testUser,
		"body": "Salbe holen", "is_task": 1, "task_state": "open", "phase": "before",
	}, "0000000002000-0000-aaaaaaaa")

	applyTask(t, s, "tg-1", "task-salbe",
		map[string]any{"task_tag_id": "tt-apotheke"}, "0000000003000-0000-aaaaaaaa")

	if got := taskRow(t, s, "task-salbe")["task_tag_id"]; got != "tt-apotheke" {
		t.Errorf("task_tag_id = %v, want %q — the tag never reached the feed", got, "tt-apotheke")
	}
}

// NFR-4.2a: the tag and the phase merge on their own. M25's drag moves a
// task between groups, and a group is a tag *or* a phase — so both are
// written in one gesture, and each must also be writable without the other,
// or a device that only moved the tag would overwrite a phase another one
// set meanwhile.
func TestApplyMutation_TaskTagAndPhaseEachWriteOnTheirOwn_FR7_8(t *testing.T) {
	s := openTestStore(t)

	seedTaskTag(t, s, "tt-apotheke", "Apotheke", "0000000001000-0000-aaaaaaaa")
	seedTaskTag(t, s, "tt-haus", "Haus", "0000000001001-0000-aaaaaaaa")
	insertTask(t, s, "task-salbe", map[string]any{
		"trip_id": testTrip, "trip_item_id": nil, "author_id": testUser,
		"body": "Salbe holen", "is_task": 1, "task_state": "open",
		"phase": "before", "task_tag_id": "tt-apotheke",
	}, "0000000002000-0000-aaaaaaaa")

	// Only the tag: dragged from one tag's group into another's.
	applyTask(t, s, "tg-1", "task-salbe",
		map[string]any{"task_tag_id": "tt-haus"}, "0000000003000-0000-aaaaaaaa")
	row := taskRow(t, s, "task-salbe")
	if row["task_tag_id"] != "tt-haus" {
		t.Errorf("task_tag_id = %v, want %q", row["task_tag_id"], "tt-haus")
	}
	if row["phase"] != "before" || row["body"] != "Salbe holen" {
		t.Errorf("a tag-only write touched phase %v / body %v", row["phase"], row["body"])
	}

	// Only the phase: the trip has begun and the salve was never fetched.
	applyTask(t, s, "tg-2", "task-salbe",
		map[string]any{"phase": "during"}, "0000000004000-0000-aaaaaaaa")
	row = taskRow(t, s, "task-salbe")
	if row["phase"] != "during" {
		t.Errorf("phase = %v, want %q", row["phase"], "during")
	}
	if row["task_tag_id"] != "tt-haus" {
		t.Errorf("a phase-only write lost the tag: %v", row["task_tag_id"])
	}

	// Both at once, which is the ordinary case: one drag, one mutation, one
	// undo — the tag is dropped and the phase follows the group it landed in.
	applyTask(t, s, "tg-3", "task-salbe",
		map[string]any{"task_tag_id": nil, "phase": "before"}, "0000000005000-0000-aaaaaaaa")
	row = taskRow(t, s, "task-salbe")
	if row["task_tag_id"] != nil || row["phase"] != "before" {
		t.Errorf("tag / phase = %v / %v, want NULL / before — one gesture writes both",
			row["task_tag_id"], row["phase"])
	}
}

// ADR-072: `ON DELETE SET NULL`, where item_tags cascades. There the row *is*
// the assignment and deleting it unassigns; here the row is the task, and the
// same cascade would throw the work away. The tasks stay and fall back to the
// group named after where they came from.
//
// The second half is the one worth writing down: the unassignment does *not*
// travel. SQLite performs it inside the delete, where the trip partition's
// change feed cannot see it, so a device that never saw the delete keeps the
// old id for good — which is why the client files a task whose tag it has no
// row for as untagged instead of trusting the column (`filedTagOf`).
func TestDeleteTaskTag_LeavesItsTasksStanding_AndSaysNothing_FR7_8(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedTaskTag(t, s, "tt-apotheke", "Apotheke", "0000000001000-0000-aaaaaaaa")
	insertTask(t, s, "task-salbe", map[string]any{
		"trip_id": testTrip, "trip_item_id": nil, "author_id": testUser,
		"body": "Salbe holen", "is_task": 1, "task_state": "open",
		"task_tag_id": "tt-apotheke",
	}, "0000000002000-0000-aaaaaaaa")

	// Everything above is synced already; only what the delete produces
	// should appear after this cursor.
	before, err := s.Pull(ctx, testTrip, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTaskTags, "tt-apotheke", "td-1",
		nil, "0000000003000-0000-aaaaaaaa"))
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("outcome = %q (reason %q), want applied — a task tag blocks no delete",
			res.Outcome, res.Reason)
	}

	var body string
	var tag sql.NullString
	if err := s.db.QueryRowContext(ctx,
		`SELECT body, task_tag_id FROM comments WHERE id = 'task-salbe'`).Scan(&body, &tag); err != nil {
		t.Fatalf("the task was deleted with its tag: %v", err)
	}
	if tag.Valid {
		t.Errorf("task_tag_id = %q after the tag was deleted, want NULL", tag.String)
	}
	if body != "Salbe holen" {
		t.Errorf("body = %q — the work must survive its filing", body)
	}

	after, err := s.Pull(ctx, testTrip, before.NextCursor, 100)
	if err != nil {
		t.Fatalf("Pull after delete: %v", err)
	}
	for _, c := range after.Changes {
		if c.Table == TableComments && c.ID == "task-salbe" {
			t.Fatalf("the unassignment reached the trip feed after all (%v) — "+
				"if SQLite ever announces it, the client's reading rule can be reconsidered", c.Row)
		}
	}
}

// The vocabulary's own shape, on the same terms as `tags`: one word means one
// tag, and the mark is bounded where it is stored rather than where it is
// typed (FR-24.13). Both are refusals the push vocabulary already has, so the
// outbox parks the mutation instead of retrying it for ever.
func TestApplyMasterMutation_TaskTagShape_IsRefusedByTheSchema_FR7_8(t *testing.T) {
	refusals := []struct {
		name   string
		fields map[string]any
	}{
		{
			name:   "a second tag of the same name",
			fields: map[string]any{"name": "Apotheke"},
		},
		{
			name:   "a mark longer than the column allows",
			fields: map[string]any{"name": "Bahn", MarkColumn: strings.Repeat("a", 33)},
		},
	}

	for _, tc := range refusals {
		t.Run(tc.name, func(t *testing.T) {
			s := openTestStore(t)
			seedTaskTag(t, s, "tt-apotheke", "Apotheke", "0000000001000-0000-aaaaaaaa")

			res := applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTaskTags, "tt-zweit", "tt-x",
				tc.fields, "0000000002000-0000-aaaaaaaa"))

			if res.Outcome != sync.OutcomeRejected {
				t.Fatalf("outcome = %q, want rejected", res.Outcome)
			}
			if res.Reason != ReasonConstraintViolated {
				t.Errorf("reason = %q, want %q", res.Reason, ReasonConstraintViolated)
			}
			// The positive signal: the row the refusal was about never came
			// into being, and the one that was there is untouched.
			var n int
			if err := s.db.QueryRow(`SELECT count(*) FROM task_tags`).Scan(&n); err != nil {
				t.Fatalf("count task_tags: %v", err)
			}
			if n != 1 {
				t.Errorf("task_tags holds %d rows after a refused insert, want 1", n)
			}
		})
	}
}

// seedTaskTag creates one tag through the master push path, so the row the
// tests read is the row a client's push would have written.
func seedTaskTag(t *testing.T, s *Store, id, name, hlc string) {
	t.Helper()
	res := applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTaskTags, id, "seed-"+id,
		map[string]any{"name": name, "sort_order": 0}, hlc))
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("seeding task tag %s: outcome %q (reason %q)", id, res.Outcome, res.Reason)
	}
}

func insertTask(t *testing.T, s *Store, id string, fields map[string]any, hlc string) {
	t.Helper()
	res, err := s.ApplyMutation(context.Background(), testTrip, testUser, sync.Mutation{
		MutationID: "ins-" + id, Op: sync.OpInsert, Table: TableComments,
		ID: id, Fields: fields, HLC: sync.HLC(hlc),
	})
	if err != nil {
		t.Fatalf("insert task %s: %v", id, err)
	}
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("insert task %s: outcome %q (reason %q)", id, res.Outcome, res.Reason)
	}
}

func applyTask(t *testing.T, s *Store, mutationID, id string, fields map[string]any, hlc string) {
	t.Helper()
	res, err := s.ApplyMutation(context.Background(), testTrip, testUser, sync.Mutation{
		MutationID: mutationID, Op: sync.OpUpsert, Table: TableComments,
		ID: id, Fields: fields, HLC: sync.HLC(hlc),
	})
	if err != nil {
		t.Fatalf("ApplyMutation %s: %v", mutationID, err)
	}
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("%s outcome = %q (reason %q), want applied", mutationID, res.Outcome, res.Reason)
	}
}
