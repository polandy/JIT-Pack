package store

import (
	"context"
	"fmt"
	"testing"

	"jitpack/internal/sync"
)

// insertEntryTraveler names one traveller on one day-plan entry, pushed as a
// client pushes it.
func insertEntryTraveler(id, entryID, travelerID, hlc string) sync.Mutation {
	return sync.Mutation{
		MutationID: "mut-" + id, Op: sync.OpInsert, Table: TableDayEntryTravelers, ID: id,
		Fields: map[string]any{"trip_id": testTrip, "day_entry_id": entryID, "traveler_id": travelerID},
		HLC:    sync.HLC(hlc),
	}
}

// FR-29.15: an entry names whom it is for through the trip partition, and
// every device hears when that goes — with the entry, or with the traveller
// taken off the trip — because the cascade tombstones each row it deletes.
func TestApplyMutation_DayEntryTravelers_GoWithTheEntryAndTheTraveler_FR29_15(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO travelers (id, trip_id, name) VALUES ('tr-sia', ?, 'Sia'), ('tr-leo', ?, 'Leonardo')`,
		testTrip, testTrip)
	mustExec(t, s, `INSERT INTO day_entries (id, trip_id, author_id, on_date, title)
	                VALUES ('de-1', ?, ?, '2026-07-15', 'Coiffeur'), ('de-2', ?, ?, '2026-07-15', 'Kinderclub')`,
		testTrip, testUser, testTrip, testUser)
	for _, m := range []sync.Mutation{
		insertEntryTraveler("det-1", "de-1", "tr-sia", "0000000001000-0000-aaaaaaaa"),
		insertEntryTraveler("det-2", "de-2", "tr-leo", "0000000001001-0000-aaaaaaaa"),
	} {
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, m); err != nil || res.Outcome != sync.OutcomeApplied {
			t.Fatalf("%s: outcome %q reason %q err %v, want applied", m.ID, res.Outcome, res.Reason, err)
		}
	}
	before, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}
	for i, del := range []sync.Mutation{
		{Op: sync.OpDelete, Table: TableDayEntries, ID: "de-1"},
		{Op: sync.OpDelete, Table: TableTravelers, ID: "tr-leo"},
	} {
		del.MutationID = fmt.Sprintf("m-del-%d", i)
		del.HLC = sync.HLC(fmt.Sprintf("000000000910%d-0000-aaaaaaaa", i))
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
			t.Fatalf("delete %s: outcome %q reason %q err %v, want applied", del.Table, res.Outcome, res.Reason, err)
		}
	}
	page, err := s.Pull(ctx, testTrip, before, 50)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	assertTombstoned(t, page, TableDayEntryTravelers, "det-1")
	assertTombstoned(t, page, TableDayEntryTravelers, "det-2")
}

// FR-29.15: an entry names a traveller of its own trip, and is an entry of
// its own trip — either half from elsewhere would put another trip's person
// on this plan, or this plan's person on another's.
func TestApplyMutation_DayEntryTraveler_StaysInsideItsTrip_FR29_15(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES ('trip-other', 'Other', 2026)`)
	mustExec(t, s, `INSERT INTO travelers (id, trip_id, name) VALUES ('tr-own', ?, 'Sia'), ('tr-foreign', 'trip-other', 'Fremd')`,
		testTrip)
	mustExec(t, s, `INSERT INTO day_entries (id, trip_id, author_id, on_date, title)
	                VALUES ('de-own', ?, ?, '2026-07-15', 'Coiffeur'), ('de-foreign', 'trip-other', ?, '2026-07-15', 'Fremd')`,
		testTrip, testUser, testUser)
	cases := []struct {
		name, entry, traveler string
		want                  sync.Outcome
	}{
		{"own entry, own traveller", "de-own", "tr-own", sync.OutcomeApplied},
		{"another trip's traveller", "de-own", "tr-foreign", sync.OutcomeRejected},
		{"another trip's entry", "de-foreign", "tr-own", sync.OutcomeRejected},
		{"an entry that does not exist", "de-gone", "tr-own", sync.OutcomeRejected},
		{"a traveller who does not exist", "de-own", "tr-gone", sync.OutcomeRejected},
	}
	for i, tc := range cases {
		m := insertEntryTraveler(fmt.Sprintf("det-%d", i), tc.entry, tc.traveler, fmt.Sprintf("000000000%d000-0000-aaaaaaaa", i+1))
		res, err := s.ApplyMutation(ctx, testTrip, testUser, m)
		if err != nil || res.Outcome != tc.want {
			t.Errorf("%s: outcome %q reason %q err %v, want %q", tc.name, res.Outcome, res.Reason, err, tc.want)
		}
	}
}
