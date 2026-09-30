package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

const testUserSia = "user-sia"

// openPlannerStore is openTestStore with a second account and one idea, the
// shape every planner case starts from.
func openPlannerStore(t *testing.T) *Store {
	t.Helper()
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES (?, 'auth|sia', 'Sia')`, testUserSia)
	mustExec(t, s, `INSERT INTO ideas (id, trip_id, author_id, title) VALUES ('idea-1', ?, ?, 'Schlucht Gola Gorropu')`,
		testTrip, testUser)
	return s
}

// FR-29.1/29.3/29.4 through the push path: an idea, a vote on it and a word
// about it all travel the trip partition.
func TestApplyMutation_Idea_InsertVoteAndComment_FR29_1(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	for _, m := range []sync.Mutation{
		{
			MutationID: "m1", Op: sync.OpInsert, Table: TableIdeas, ID: "idea-1",
			Fields: map[string]any{
				"trip_id": testTrip, "author_id": testUser, "title": "Museo Nivola",
				"link": "https://museonivola.it", "tag": "culture", "rain_proof": 1, "state": "idea",
			},
			HLC: sync.HLC("0000000001000-0000-aaaaaaaa"),
		},
		{
			MutationID: "m2", Op: sync.OpInsert, Table: TableIdeaVotes, ID: "vote-1",
			Fields: map[string]any{"trip_id": testTrip, "idea_id": "idea-1", "user_id": testUser, "vote": "up"},
			HLC:    sync.HLC("0000000001001-0000-aaaaaaaa"),
		},
		{
			MutationID: "m3", Op: sync.OpInsert, Table: TableIdeaComments, ID: "ic-1",
			Fields: map[string]any{"trip_id": testTrip, "idea_id": "idea-1", "author_id": testUser, "body": "Montags zu"},
			HLC:    sync.HLC("0000000001002-0000-aaaaaaaa"),
		},
	} {
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, m); err != nil || res.Outcome != sync.OutcomeApplied {
			t.Fatalf("%s: outcome %q reason %q err %v, want applied", m.Table, res.Outcome, res.Reason, err)
		}
	}

	shortlist := upsert("idea-1", "m4", map[string]any{"state": "shortlisted"}, "0000000002000-0000-aaaaaaaa")
	shortlist.Table = TableIdeas
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, shortlist); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("shortlist: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	var state string
	if err := s.db.QueryRow(`SELECT state FROM ideas WHERE id = 'idea-1'`).Scan(&state); err != nil {
		t.Fatalf("read idea: %v", err)
	}
	if state != "shortlisted" {
		t.Errorf("state = %q, want shortlisted", state)
	}
}

// FR-29.2: deleting an idea takes its votes and its discussion, each
// tombstoned so no device keeps a vote on an idea that is gone.
func TestApplyMutation_DeletingAnIdeaTombstonesItsVotesAndComments_FR29_2(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO idea_votes (id, trip_id, idea_id, user_id, vote) VALUES ('vote-1', ?, 'idea-1', ?, 'up')`,
		testTrip, testUserSia)
	mustExec(t, s, `INSERT INTO idea_comments (id, trip_id, idea_id, author_id, body) VALUES ('ic-1', ?, 'idea-1', ?, 'Mit Guide')`,
		testTrip, testUserSia)

	before, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}
	del := sync.Mutation{
		MutationID: "m-del", Op: sync.OpDelete, Table: TableIdeas, ID: "idea-1",
		HLC: sync.HLC("0000000009100-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete idea: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}

	page, err := s.Pull(ctx, testTrip, before, 50)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	assertTombstoned(t, page, TableIdeaVotes, "vote-1")
	assertTombstoned(t, page, TableIdeaComments, "ic-1")
}

// FR-29.3: a vote carries its voter's name, so only that voter may change or
// remove it — the row id alone must not be enough to turn Sia's 👍 into 👎.
func TestApplyMutation_OnlyTheVoterMayChangeAVote_FR29_3(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO idea_votes (id, trip_id, idea_id, user_id, vote) VALUES ('vote-sia', ?, 'idea-1', ?, 'up')`,
		testTrip, testUserSia)

	cases := []struct {
		name   string
		actor  string
		op     sync.Op
		fields map[string]any
		hlc    sync.HLC
		want   sync.Outcome
	}{
		{"somebody else's flip is refused", testUser, sync.OpUpsert, map[string]any{"vote": "down"},
			"0000000002000-0000-aaaaaaaa", sync.OutcomeRejected},
		{"somebody else's delete is refused", testUser, sync.OpDelete, nil,
			"0000000003000-0000-aaaaaaaa", sync.OutcomeRejected},
		{"the voter withdraws", testUserSia, sync.OpUpsert, map[string]any{"vote": nil},
			"0000000004000-0000-bbbbbbbb", sync.OutcomeApplied},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := sync.Mutation{
				MutationID: "mv-" + string(tc.hlc), Op: tc.op, Table: TableIdeaVotes, ID: "vote-sia",
				Fields: tc.fields, HLC: tc.hlc,
			}
			res, err := s.ApplyMutation(ctx, testTrip, tc.actor, m)
			if err != nil {
				t.Fatalf("ApplyMutation: %v", err)
			}
			if res.Outcome != tc.want {
				t.Errorf("outcome = %q (reason %q), want %q", res.Outcome, res.Reason, tc.want)
			}
		})
	}

	var vote *string
	if err := s.db.QueryRow(`SELECT vote FROM idea_votes WHERE id = 'vote-sia'`).Scan(&vote); err != nil {
		t.Fatalf("read vote: %v", err)
	}
	if vote != nil {
		t.Errorf("vote = %q, want withdrawn (NULL) by its own voter and never flipped by another", *vote)
	}
}

// FR-29.1/29.10: what an idea may carry. A link is rendered as an href, so
// only http(s) is accepted; a tag is one of the closed set's keys.
func TestSchema_IdeaVocabulary_FR29_1(t *testing.T) {
	s := openTestStore(t)
	cases := []struct {
		name, column, value string
		ok                  bool
	}{
		{"https link", "link", "https://gorropu.info", true},
		{"http link", "link", "http://cala-gonone-diving.com", true},
		{"script link", "link", "javascript:alert(1)", false},
		{"data link", "link", "data:text/html,x", false},
		{"a tag of the set", "tag", "hiking", true},
		{"a tag outside it", "tag", "Wandern", false},
		{"a state of the four", "state", "done", true},
		{"no fifth state", "state", "planned", false},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := s.db.Exec(`INSERT INTO ideas (id, trip_id, author_id, title, `+tc.column+`)
			                     VALUES (?, ?, ?, 'x', ?)`, "idea-v"+string(rune('a'+i)), testTrip, testUser, tc.value)
			if (err == nil) != tc.ok {
				t.Errorf("%s = %q: err %v, want accepted %v", tc.column, tc.value, err, tc.ok)
			}
		})
	}
}

// FR-29.3: one vote per person per idea — a second row for the same pair is
// refused, which is what keeps two devices of one voter from counting twice.
func TestSchema_OneVotePerPersonPerIdea_FR29_3(t *testing.T) {
	s := openPlannerStore(t)
	mustExec(t, s, `INSERT INTO idea_votes (id, trip_id, idea_id, user_id, vote) VALUES ('v-1', ?, 'idea-1', ?, 'up')`,
		testTrip, testUser)
	if _, err := s.db.Exec(`INSERT INTO idea_votes (id, trip_id, idea_id, user_id, vote) VALUES ('v-2', ?, 'idea-1', ?, 'down')`,
		testTrip, testUser); err == nil {
		t.Error("a second vote row for the same person and idea was accepted")
	}
}

// FR-29.4: a word about an idea carries its author's name, so only the author
// changes it; a delete stays everybody's, as a trip note's does.
func TestApplyMutation_OnlyTheAuthorEditsAWordAboutAnIdea_FR29_4(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO idea_comments (id, trip_id, idea_id, author_id, body) VALUES ('ic-sia', ?, 'idea-1', ?, 'Mit Guide')`,
		testTrip, testUserSia)

	cases := []struct {
		name   string
		actor  string
		fields map[string]any
		hlc    sync.HLC
		want   sync.Outcome
	}{
		{"somebody else's edit is refused", testUser, map[string]any{"body": "Ohne Guide", "edited_at": "2026-09-27T10:00:00Z"},
			"0000000002000-0000-aaaaaaaa", sync.OutcomeRejected},
		{"the author edits", testUserSia, map[string]any{"body": "Nur mit Guide", "edited_at": "2026-09-27T10:01:00Z"},
			"0000000003000-0000-bbbbbbbb", sync.OutcomeApplied},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := sync.Mutation{
				MutationID: "mc-" + string(tc.hlc), Op: sync.OpUpsert, Table: TableIdeaComments, ID: "ic-sia",
				Fields: tc.fields, HLC: tc.hlc,
			}
			res, err := s.ApplyMutation(ctx, testTrip, tc.actor, m)
			if err != nil {
				t.Fatalf("ApplyMutation: %v", err)
			}
			if res.Outcome != tc.want {
				t.Errorf("outcome = %q (reason %q), want %q", res.Outcome, res.Reason, tc.want)
			}
		})
	}

	var body string
	if err := s.db.QueryRow(`SELECT body FROM idea_comments WHERE id = 'ic-sia'`).Scan(&body); err != nil {
		t.Fatalf("read word: %v", err)
	}
	if body != "Nur mit Guide" {
		t.Errorf("body = %q, want the author's own edit", body)
	}

	del := sync.Mutation{MutationID: "mc-del", Op: sync.OpDelete, Table: TableIdeaComments, ID: "ic-sia",
		HLC: sync.HLC("0000000004000-0000-aaaaaaaa")}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Errorf("delete by another member: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
}

// FR-29.8: a comment on an idea is for the people taking part in it — who
// wrote the idea and everyone who has written about it. A vote is not taking
// part, as a tick is not on a note (FR-7.13).
func TestIdeaDiscussion_NamesTheIdeasAuthorThenEveryCommenterOnce_FR29_8(t *testing.T) {
	s := openPlannerStore(t)
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-chris', 'auth|chris', 'Chris')`)
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-dora', 'auth|dora', 'Dora')`)
	for i, author := range []string{testUserSia, "user-chris", testUser, testUserSia} {
		mustExec(t, s, `INSERT INTO idea_comments (id, trip_id, idea_id, author_id, body, created_at) VALUES (?, ?, 'idea-1', ?, 'Ja', ?)`,
			"ic-"+string(rune('a'+i)), testTrip, author, "2026-09-30T0"+string(rune('1'+i))+":00:00Z")
	}
	mustExec(t, s, `INSERT INTO idea_votes (id, trip_id, idea_id, user_id, vote) VALUES ('vote-d', ?, 'idea-1', 'user-dora', 'up')`,
		testTrip)

	got, err := s.IdeaDiscussion(context.Background(), "idea-1")
	if err != nil {
		t.Fatalf("IdeaDiscussion: %v", err)
	}
	if got.Title != "Schlucht Gola Gorropu" {
		t.Errorf("title = %q, want the idea's", got.Title)
	}
	want := []string{testUser, testUserSia, "user-chris"}
	if len(got.Participants) != len(want) {
		t.Fatalf("participants = %v, want %v", got.Participants, want)
	}
	for i := range want {
		if got.Participants[i] != want[i] {
			t.Fatalf("participants = %v, want %v", got.Participants, want)
		}
	}
}

func TestIdeaDiscussion_UnknownIdeaIsAnError_FR29_8(t *testing.T) {
	s := openTestStore(t)
	if _, err := s.IdeaDiscussion(context.Background(), "no-such-idea"); err == nil {
		t.Fatal("want an error for an idea that does not exist")
	}
}
