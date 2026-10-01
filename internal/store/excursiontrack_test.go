package store

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"testing"

	"jitpack/internal/sync"
)

// GPX tracks on an excursion (FR-31.15, ADR-089): an idea's tracks, kept in
// tables of the excursion's own. What the two share — the replace, the
// retry, the limits of the file — is driven by track_test.go; these cases
// hold what is the excursion's.

func openExcursionStore(t *testing.T) *Store {
	t.Helper()
	s := openPlannerStore(t)
	mustExec(t, s, `INSERT INTO excursions (id, trip_id, name) VALUES ('exc-1', ?, 'Oeschinensee')`, testTrip)
	return s
}

func TestPutExcursionTrack_StoresTheFileAndLogsTheRowOnTheTripFeed_FR31_15(t *testing.T) {
	s := openExcursionStore(t)
	ctx := context.Background()

	track, err := s.PutExcursionTrack(ctx, testTrip, testUser, "exc-1", "et-1", testTrackFile(testGPX))
	if err != nil {
		t.Fatalf("PutExcursionTrack: %v", err)
	}
	file, err := s.GetExcursionTrackGPX(ctx, testTrip, "exc-1", "et-1")
	if err != nil || file == nil || !bytes.Equal(file.GPX, testGPX) || file.Hash != track.Hash {
		t.Fatalf("GetExcursionTrackGPX = %+v, %v; want the file byte for byte", file, err)
	}
	var onIdeas int
	if err := s.db.QueryRow(`SELECT count(*) FROM idea_tracks`).Scan(&onIdeas); err != nil {
		t.Fatal(err)
	}
	if onIdeas != 0 {
		t.Errorf("%d idea tracks written for an excursion's", onIdeas)
	}

	page, err := s.Pull(ctx, testTrip, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	for _, c := range page.Changes {
		if c.Table != TableExcursionTracks || c.ID != "et-1" {
			continue
		}
		if c.Row["excursion_id"] != "exc-1" || c.Row["name"] != "Rundweg ab Kandersteg" || c.Row["gpx_hash"] != track.Hash {
			t.Errorf("pulled row %v, want the excursion, the name and the file's hash", c.Row)
		}
		if _, leaked := c.Row["gpx"]; leaked {
			t.Error("the file travelled in the sync envelope (ADR-002)")
		}
		return
	}
	t.Fatal("the track's row never reached the trip feed — no other device would see it")
}

// Five per excursion, counted apart from an idea's.
func TestPutExcursionTrack_RefusesASixthOnTheSameExcursion_FR31_15(t *testing.T) {
	s := openExcursionStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-1", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	for i := range MaxTracks {
		gpx := append(append([]byte(nil), testGPX...), byte(i))
		track, err := s.PutExcursionTrack(ctx, testTrip, testUser, "exc-1", fmt.Sprintf("et-%d", i), testTrackFile(gpx))
		if err != nil {
			t.Fatalf("PutExcursionTrack %d: %v", i, err)
		}
		if track.Position != i {
			t.Errorf("track %d at position %d, want behind the last one", i, track.Position)
		}
	}
	if _, err := s.PutExcursionTrack(ctx, testTrip, testUser, "exc-1", "et-sixth", testTrackFile(testGPX)); !errors.Is(err, ErrTrackLimit) {
		t.Errorf("sixth track: err = %v, want ErrTrackLimit", err)
	}
}

func TestPutExcursionTrack_RefusesAnExcursionOfAnotherTripOrAnothersTrackID_FR31_15(t *testing.T) {
	s := openExcursionStore(t)
	ctx := context.Background()
	if _, err := s.PutExcursionTrack(ctx, "other-trip", testUser, "exc-1", "et-x", testTrackFile(testGPX)); !errors.Is(err, ErrExcursionNotFound) {
		t.Errorf("another trip: err = %v, want ErrExcursionNotFound", err)
	}
	if _, err := s.PutExcursionTrack(ctx, testTrip, testUser, "idea-1", "et-x", testTrackFile(testGPX)); !errors.Is(err, ErrExcursionNotFound) {
		t.Errorf("an idea's id: err = %v, want ErrExcursionNotFound", err)
	}
	mustExec(t, s, `INSERT INTO excursions (id, trip_id, name) VALUES ('exc-2', ?, 'Hüttentour')`, testTrip)
	if _, err := s.PutExcursionTrack(ctx, testTrip, testUser, "exc-1", "et-y", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutExcursionTrack: %v", err)
	}
	if _, err := s.PutExcursionTrack(ctx, testTrip, testUser, "exc-2", "et-y", testTrackFile([]byte("<gpx/>"))); !errors.Is(err, ErrExcursionNotFound) {
		t.Errorf("another excursion's track id: err = %v, want ErrExcursionNotFound", err)
	}
	if file, err := s.GetExcursionTrackGPX(ctx, testTrip, "exc-2", "et-y"); err != nil || file != nil {
		t.Errorf("through another excursion: %+v, err %v; want nothing", file, err)
	}
}

func TestExcursionTrackGPX_CheckRefusesMoreThan5MB_FR31_15(t *testing.T) {
	s := openExcursionStore(t)
	if _, err := s.PutExcursionTrack(context.Background(), testTrip, testUser, "exc-1", "et-big",
		testTrackFile(make([]byte, MaxTrackBytes+1))); !errors.Is(err, ErrTrackTooLarge) {
		t.Errorf("store: err = %v, want ErrTrackTooLarge", err)
	}
	mustExec(t, s, `INSERT INTO excursion_tracks (id, trip_id, excursion_id, name, file_name, gpx_hash, distance_m, point_count, line)
		VALUES ('et-raw', ?, 'exc-1', 'n', 'f.gpx', 'h', 1, 2, 'l')`, testTrip)
	if _, err := s.db.Exec(`INSERT INTO excursion_track_gpx (track_id, gpx) VALUES ('et-raw', zeroblob(?))`, MaxTrackBytes+1); err == nil {
		t.Error("the CHECK let a file over 5 MB in")
	}
}

// A push may change what a person sets and nothing the file says — the
// write gate holds an excursion's tracks as it does an idea's.
func TestApplyMutation_ExcursionTrack_SettingsOnly_FR31_15(t *testing.T) {
	s := openExcursionStore(t)
	ctx := context.Background()
	if _, err := s.PutExcursionTrack(ctx, testTrip, testUser, "exc-1", "et-6", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutExcursionTrack: %v", err)
	}
	settings := upsert("et-6", "m-settings", map[string]any{"name": "Variante", "kind": "bike", "with_kid": 1,
		"pause_min": 45}, "9999999999999-0000-aaaaaaaa")
	settings.Table = TableExcursionTracks
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, settings); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("settings: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	forged := upsert("et-6", "m-forge", map[string]any{"excursion_id": "exc-2"}, "9999999999999-0001-aaaaaaaa")
	forged.Table = TableExcursionTracks
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, forged); err != nil || res.Outcome != sync.OutcomeRejected {
		t.Errorf("moved by a push: outcome %q err %v, want rejected", res.Outcome, err)
	}
	insert := sync.Mutation{
		MutationID: "m-insert", Op: sync.OpInsert, Table: TableExcursionTracks, ID: "et-forged",
		Fields: map[string]any{"trip_id": testTrip, "excursion_id": "exc-1", "name": "n", "file_name": "f.gpx",
			"gpx_hash": "h", "distance_m": 1, "point_count": 2, "line": "l"},
		HLC: sync.HLC("9999999999999-0100-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, insert); err != nil || res.Outcome != sync.OutcomeRejected {
		t.Errorf("pushed insert: outcome %q err %v, want rejected — a track without its file", res.Outcome, err)
	}
}

// FR-31.1: an excursion goes with what hangs on it — its tracks are
// tombstoned for the other devices, and their files go with them.
func TestApplyMutation_DeletingAnExcursionTakesItsTracksAndFiles_FR31_15(t *testing.T) {
	s := openExcursionStore(t)
	ctx := context.Background()
	if _, err := s.PutExcursionTrack(ctx, testTrip, testUser, "exc-1", "et-8", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutExcursionTrack: %v", err)
	}
	del := sync.Mutation{MutationID: "m-del", Op: sync.OpDelete, Table: TableExcursions, ID: "exc-1",
		HLC: sync.HLC("9999999999999-0000-aaaaaaaa")}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete excursion: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	var tombs, files int
	if err := s.db.QueryRow(`SELECT count(*) FROM change_log WHERE entity_table = 'excursion_tracks' AND entity_id = 'et-8' AND deleted = 1`).
		Scan(&tombs); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow(`SELECT count(*) FROM excursion_track_gpx`).Scan(&files); err != nil {
		t.Fatal(err)
	}
	if tombs != 1 || files != 0 {
		t.Errorf("%d tombstones and %d files left, want 1 and 0", tombs, files)
	}
}

// FR-32.1: the log names the track and the excursion it is on.
func TestPutExcursionTrack_RecordsActivityUnderTheExcursion_FR31_15(t *testing.T) {
	s := openExcursionStore(t)
	ctx := context.Background()
	if _, err := s.PutExcursionTrack(ctx, testTrip, testUser, "exc-1", "et-9", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutExcursionTrack: %v", err)
	}
	var label, subject string
	if err := s.db.QueryRow(`SELECT label, coalesce(subject, '') FROM activity_log WHERE entity_table = 'excursion_tracks'`).
		Scan(&label, &subject); err != nil {
		t.Fatal(err)
	}
	if label != "Rundweg ab Kandersteg" || subject != "Oeschinensee" {
		t.Errorf("entry %q on %q, want the track's name on the excursion's", label, subject)
	}
}
