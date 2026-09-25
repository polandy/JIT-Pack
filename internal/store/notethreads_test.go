package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// FR-7.13: a trip note's thread is one level deep, its parent is written
// once, a reply carries no title, and only an entry's author changes its
// words. The rules the database cannot state (a CHECK cannot see another
// row) are the push path's, and each has its failure path here.

const (
	threadOther     = "user-ben"
	threadRoot      = "note-root"
	threadReply     = "note-reply"
	threadOtherTrip = "trip-other"
)

func seedThread(t *testing.T, s *Store) {
	t.Helper()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES (?, 'auth|ben', 'Ben')`, threadOther)
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES (?, 'Elsewhere', 2026)`, threadOtherTrip)
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name) VALUES ('item-1', ?, 'Zelt')`, testTrip)
	mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body, title) VALUES (?, ?, ?, 'Code 4711', 'Schlüsselbox')`,
		threadRoot, testTrip, testUser)
	mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body, parent_id) VALUES (?, ?, ?, 'Danke', ?)`,
		threadReply, testTrip, threadOther, threadRoot)
	mustExec(t, s, `INSERT INTO comments (id, trip_id, trip_item_id, author_id, body) VALUES ('item-note', ?, 'item-1', ?, 'Hering fehlt')`,
		testTrip, testUser)
	mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body, is_task, task_state) VALUES ('task-1', ?, ?, 'Tanken', 1, 'open')`,
		testTrip, testUser)
	mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body) VALUES ('foreign-note', ?, ?, 'Anderswo')`,
		threadOtherTrip, testUser)
}

func replyInsert(id, parent string, extra map[string]any) sync.Mutation {
	fields := map[string]any{
		"trip_id": testTrip, "trip_item_id": nil, "author_id": testUser,
		"body": "Antwort", "is_task": 0, "parent_id": parent,
	}
	for k, v := range extra {
		fields[k] = v
	}
	return sync.Mutation{
		MutationID: "mut-" + id, Op: sync.OpInsert, Table: TableComments, ID: id,
		Fields: fields, HLC: sync.HLC("0000000002000-0000-aaaaaaaa"),
	}
}

func commentColumn(t *testing.T, s *Store, id, column string) any {
	t.Helper()
	var v any
	if err := s.db.QueryRow(`SELECT `+column+` FROM comments WHERE id = ?`, id).Scan(&v); err != nil {
		t.Fatalf("read %s of %s: %v", column, id, err)
	}
	return v
}

func TestApplyMutation_NoteReply_ParentMustBeAFirstNoteOfThisTrip_FR7_13(t *testing.T) {
	cases := []struct {
		name   string
		mut    sync.Mutation
		wanted sync.Outcome
	}{
		{"a reply to a first note is applied", replyInsert("r1", threadRoot, nil), sync.OutcomeApplied},
		{"a reply to a reply is refused (one level)", replyInsert("r2", threadReply, nil), sync.OutcomeRejected},
		{"a reply to an item's comment is refused", replyInsert("r3", "item-note", nil), sync.OutcomeRejected},
		{"a reply to a task is refused", replyInsert("r4", "task-1", nil), sync.OutcomeRejected},
		{"a reply to another trip's note is refused", replyInsert("r5", "foreign-note", nil), sync.OutcomeRejected},
		{"a reply to a note that does not exist is refused", replyInsert("r6", "no-such-note", nil), sync.OutcomeRejected},
		{"a reply anchored to a packing row is refused",
			replyInsert("r7", threadRoot, map[string]any{"trip_item_id": "item-1"}), sync.OutcomeRejected},
		{"a reply that is a task is refused",
			replyInsert("r8", threadRoot, map[string]any{"is_task": 1, "task_state": "open"}), sync.OutcomeRejected},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := openTestStore(t)
			seedThread(t, s)

			res, err := s.ApplyMutation(context.Background(), testTrip, testUser, tc.mut)
			if err != nil {
				t.Fatalf("ApplyMutation: %v", err)
			}
			if res.Outcome != tc.wanted {
				t.Fatalf("outcome = %q (reason %q), want %q", res.Outcome, res.Reason, tc.wanted)
			}
			if tc.wanted == sync.OutcomeRejected && res.Reason != ReasonConstraintViolated {
				t.Errorf("reason = %q, want %q", res.Reason, ReasonConstraintViolated)
			}
		})
	}
}

func TestApplyMutation_NoteReply_TitleIsDroppedFromAReply_FR7_13(t *testing.T) {
	s := openTestStore(t)
	seedThread(t, s)
	ctx := context.Background()

	res, err := s.ApplyMutation(ctx, testTrip, testUser, replyInsert("r1", threadRoot, map[string]any{"title": "Nein"}))
	if err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("insert: %v %+v", err, res)
	}
	if got := commentColumn(t, s, "r1", "title"); got != nil {
		t.Errorf("a reply's title = %v, want none", got)
	}

	// And on a later edit of a reply that already exists.
	edit := sync.Mutation{
		MutationID: "mut-edit", Op: sync.OpUpsert, Table: TableComments, ID: threadReply,
		Fields: map[string]any{"title": "Auch nicht", "body": "Danke!"},
		HLC:    sync.HLC("0000000003000-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, threadOther, edit); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("edit: %v %+v", err, res)
	}
	if got := commentColumn(t, s, threadReply, "title"); got != nil {
		t.Errorf("an edited reply's title = %v, want none", got)
	}
	if got := commentColumn(t, s, threadReply, "body"); got != "Danke!" {
		t.Errorf("body = %v, want the edit", got)
	}
}

func TestApplyMutation_NoteReply_ParentIsWrittenOnce_FR7_13(t *testing.T) {
	s := openTestStore(t)
	seedThread(t, s)
	mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body) VALUES ('other-root', ?, ?, 'Fähre')`, testTrip, testUser)

	move := sync.Mutation{
		MutationID: "mut-move", Op: sync.OpUpsert, Table: TableComments, ID: threadReply,
		Fields: map[string]any{"parent_id": "other-root"},
		HLC:    sync.HLC("0000000003000-0000-aaaaaaaa"),
	}
	if _, err := s.ApplyMutation(context.Background(), testTrip, threadOther, move); err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}
	if got := commentColumn(t, s, threadReply, "parent_id"); got != threadRoot {
		t.Errorf("parent_id = %v, want it unmoved (%s)", got, threadRoot)
	}
}

func TestApplyMutation_NoteEdit_OnlyTheAuthorChangesTheWords_FR7_13(t *testing.T) {
	cases := []struct {
		name   string
		id     string
		actor  string
		fields map[string]any
		wanted sync.Outcome
	}{
		{"the author edits the first note", threadRoot, testUser,
			map[string]any{"body": "Code 4712", "title": "Box", "edited_at": "2026-09-25T10:00:00Z"}, sync.OutcomeApplied},
		{"somebody else's body edit is refused", threadRoot, threadOther,
			map[string]any{"body": "Code 0000"}, sync.OutcomeRejected},
		{"somebody else's title edit is refused", threadRoot, threadOther,
			map[string]any{"title": "Meins"}, sync.OutcomeRejected},
		{"somebody else's edit of a reply is refused", threadReply, testUser,
			map[string]any{"body": "Bitte"}, sync.OutcomeRejected},
		{"a task's words stay everybody's", "task-1", threadOther,
			map[string]any{"body": "Volltanken"}, sync.OutcomeApplied},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := openTestStore(t)
			seedThread(t, s)
			m := sync.Mutation{
				MutationID: "mut-edit", Op: sync.OpUpsert, Table: TableComments, ID: tc.id,
				Fields: tc.fields, HLC: sync.HLC("0000000003000-0000-aaaaaaaa"),
			}
			res, err := s.ApplyMutation(context.Background(), testTrip, tc.actor, m)
			if err != nil {
				t.Fatalf("ApplyMutation: %v", err)
			}
			if res.Outcome != tc.wanted {
				t.Fatalf("outcome = %q (reason %q), want %q", res.Outcome, res.Reason, tc.wanted)
			}
			if tc.wanted == sync.OutcomeRejected && res.Reason != ReasonNotAuthorized {
				t.Errorf("reason = %q, want %q", res.Reason, ReasonNotAuthorized)
			}
		})
	}
}

func TestApplyMutation_NoteDelete_TakesItsRepliesAndTicksWithIt_FR7_13(t *testing.T) {
	s := openTestStore(t)
	seedThread(t, s)
	mustExec(t, s, `INSERT INTO note_acks (id, trip_id, comment_id, user_id, seen_through) VALUES ('ack-1', ?, ?, ?, '2026-09-25T09:00:00Z')`,
		testTrip, threadRoot, threadOther)

	del := sync.Mutation{
		MutationID: "mut-del", Op: sync.OpDelete, Table: TableComments, ID: threadRoot,
		HLC: sync.HLC("0000000003000-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(context.Background(), testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete: %v %+v", err, res)
	}

	var left int
	if err := s.db.QueryRow(`SELECT count(*) FROM comments WHERE id IN (?, ?)`, threadRoot, threadReply).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left != 0 {
		t.Errorf("%d thread rows left, want none", left)
	}
	// Every other device learns of the cascade through a tombstone.
	for _, id := range []string{threadReply, "ack-1"} {
		var n int
		if err := s.db.QueryRow(`SELECT count(*) FROM change_log WHERE entity_id = ? AND deleted = 1`, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Errorf("tombstones for %s = %d, want 1", id, n)
		}
	}
}

func TestNoteThread_NamesTheFirstAuthorThenEveryReplierOnce_FR7_13(t *testing.T) {
	s := openTestStore(t)
	seedThread(t, s)
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-chris', 'auth|chris', 'Chris')`)
	for i, author := range []string{"user-chris", threadOther, testUser} {
		mustExec(t, s, `INSERT INTO comments (id, trip_id, author_id, body, parent_id, created_at) VALUES (?, ?, ?, 'Ok', ?, ?)`,
			"more-"+author, testTrip, author, threadRoot, "2026-09-26T0"+string(rune('1'+i))+":00:00Z")
	}
	// A tick is not taking part (question 4).
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-dora', 'auth|dora', 'Dora')`)
	mustExec(t, s, `INSERT INTO note_acks (id, trip_id, comment_id, user_id) VALUES ('ack-d', ?, ?, 'user-dora')`, testTrip, threadRoot)

	thread, err := s.NoteThread(context.Background(), threadRoot)
	if err != nil {
		t.Fatalf("NoteThread: %v", err)
	}
	if thread.Title != "Schlüsselbox" || thread.Body != "Code 4711" {
		t.Errorf("thread = %q/%q, want its title and body", thread.Title, thread.Body)
	}
	// Ben replied first (the seeded reply, created now), Chris later; the
	// author's own reply does not list them twice.
	want := []string{testUser, "user-chris", threadOther}
	if len(thread.Participants) != len(want) {
		t.Fatalf("participants = %v, want %v", thread.Participants, want)
	}
	seen := map[string]bool{}
	for _, p := range thread.Participants {
		seen[p] = true
	}
	for _, w := range want {
		if !seen[w] {
			t.Errorf("participants = %v, missing %s", thread.Participants, w)
		}
	}
	if thread.Participants[0] != testUser {
		t.Errorf("first participant = %s, want the first note's author", thread.Participants[0])
	}
}

func TestNoteThread_UnknownRootIsAnError(t *testing.T) {
	s := openTestStore(t)
	if _, err := s.NoteThread(context.Background(), "no-such-note"); err == nil {
		t.Fatal("want an error for a thread that does not exist")
	}
}
