package store

import (
	"context"
	"fmt"
	"testing"

	"jitpack/internal/sync"
)

// insertIdeaLink adds one link to an idea, pushed as a client pushes it.
func insertIdeaLink(id, ideaID, url, hlc string) sync.Mutation {
	return sync.Mutation{
		MutationID: "mut-" + id, Op: sync.OpInsert, Table: TableIdeaLinks, ID: id,
		Fields: map[string]any{"trip_id": testTrip, "idea_id": ideaID, "url": url, "position": 1},
		HLC:    sync.HLC(hlc),
	}
}

// FR-29.22: a further link is rendered as an href like the idea's own, so
// the same schemes are refused; the idea's own link takes a label too.
func TestSchema_IdeaLinkVocabulary_FR29_22(t *testing.T) {
	s := openPlannerStore(t)
	cases := []struct {
		name, url string
		ok        bool
	}{
		{"https link", "https://www.sbb.ch/de/fahrplan", true},
		{"http link", "http://oeschinensee.ch", true},
		{"script link", "javascript:alert(1)", false},
		{"data link", "data:text/html,x", false},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := s.db.Exec(`INSERT INTO idea_links (id, trip_id, idea_id, url, position) VALUES (?, ?, 'idea-1', ?, 1)`,
				fmt.Sprintf("il-v%d", i), testTrip, tc.url)
			if (err == nil) != tc.ok {
				t.Errorf("url = %q: err %v, want accepted %v", tc.url, err, tc.ok)
			}
		})
	}
	mustExec(t, s, `UPDATE ideas SET link = 'https://oeschinensee.ch', link_label = 'Rundweg' WHERE id = 'idea-1'`)
}

// FR-29.22 through the push path: a link is added, labelled and moved, and
// the pull carries every column a device needs to draw it.
func TestApplyMutation_IdeaLink_AddedLabelledAndMoved_FR29_22(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	before, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}
	for _, m := range []sync.Mutation{
		insertIdeaLink("il-1", "idea-1", "https://www.sbb.ch/de/fahrplan", "0000000001000-0000-aaaaaaaa"),
		{
			MutationID: "mut-il-1-edit", Op: sync.OpUpsert, Table: TableIdeaLinks, ID: "il-1",
			Fields: map[string]any{"label": "Bahn ab Bern", "position": -1},
			HLC:    sync.HLC("0000000001001-0000-aaaaaaaa"),
		},
	} {
		if res, err := s.ApplyMutation(ctx, testTrip, testUserSia, m); err != nil || res.Outcome != sync.OutcomeApplied {
			t.Fatalf("%s: outcome %q reason %q err %v, want applied", m.MutationID, res.Outcome, res.Reason, err)
		}
	}
	page, err := s.Pull(ctx, testTrip, before, 50)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	var row map[string]any
	for _, c := range page.Changes {
		if c.Table == TableIdeaLinks && c.ID == "il-1" {
			row = c.Row
		}
	}
	if row == nil {
		t.Fatal("the pull carries no idea_links row il-1")
	}
	for column, want := range map[string]any{
		"idea_id": "idea-1", "url": "https://www.sbb.ch/de/fahrplan", "label": "Bahn ab Bern", "position": int64(-1),
	} {
		if got := row[column]; fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("%s = %v, want %v", column, got, want)
		}
	}
}

// FR-29.22: a link belongs to an idea of its own trip — one naming another
// trip's idea, or none the server has, is a write no screen of this trip makes.
func TestApplyMutation_IdeaLink_StaysOnAnIdeaOfItsTrip_FR29_22(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES ('trip-other', 'Other', 2026)`)
	mustExec(t, s, `INSERT INTO ideas (id, trip_id, author_id, title) VALUES ('idea-foreign', 'trip-other', ?, 'Fremd')`,
		testUser)
	cases := []struct {
		name, idea string
		want       sync.Outcome
	}{
		{"an idea of its trip", "idea-1", sync.OutcomeApplied},
		{"another trip's idea", "idea-foreign", sync.OutcomeRejected},
		{"an idea that does not exist", "idea-gone", sync.OutcomeRejected},
	}
	for i, tc := range cases {
		m := insertIdeaLink(fmt.Sprintf("il-%d", i), tc.idea, "https://oeschinensee.ch", fmt.Sprintf("000000000%d000-0000-aaaaaaaa", i+1))
		res, err := s.ApplyMutation(ctx, testTrip, testUser, m)
		if err != nil || res.Outcome != tc.want {
			t.Errorf("%s: outcome %q reason %q err %v, want %q", tc.name, res.Outcome, res.Reason, err, tc.want)
		}
	}
}

// FR-29.22: an idea's delete takes its links, and every device hears it.
func TestApplyMutation_DeletingAnIdeaTombstonesItsLinks_FR29_22(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO idea_links (id, trip_id, idea_id, url, position) VALUES ('il-1', ?, 'idea-1', 'https://sbb.ch', 1)`,
		testTrip)
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
	assertTombstoned(t, page, TableIdeaLinks, "il-1")
}
