package store

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"jitpack/internal/sync"
)

// GPX tracks on an idea (FR-29.17, ADR-085). The device reads the file; the
// upload creates an idea_tracks row carrying what it read, and the file
// itself stays out of the sync envelope.

var testGPX = []byte(`<?xml version="1.0"?><gpx><trk><trkseg>` +
	`<trkpt lat="46.49" lon="7.67"><ele>1176</ele></trkpt><trkpt lat="46.50" lon="7.70"><ele>1580</ele></trkpt>` +
	`</trkseg></trk></gpx>`)

func intp(v int) *int { return &v }

func testTrackFile(gpx []byte) IdeaTrackFile {
	return IdeaTrackFile{
		Name: "Rundweg ab Kandersteg", FileName: "oeschinensee.gpx", Kind: IdeaTrackHike,
		DistanceM: 7400, AscentM: intp(520), DescentM: intp(510), MaxEleM: intp(1752),
		PointCount: 2, Line: "_p~iF~ps|U_ulLnnqC", GPX: gpx,
	}
}

func TestPutIdeaTrack_StoresTheFileAndLogsTheRowOnTheTripFeed_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()

	track, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-1", testTrackFile(testGPX))
	if err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	if track.ID != "it-1" || track.Hash == "" || track.Position != 0 {
		t.Fatalf("PutIdeaTrack = %+v, want the client's id, a hash and position 0", track)
	}

	file, err := s.GetIdeaTrackGPX(ctx, testTrip, "idea-1", "it-1")
	if err != nil {
		t.Fatalf("GetIdeaTrackGPX: %v", err)
	}
	if file == nil || !bytes.Equal(file.GPX, testGPX) || file.Hash != track.Hash || file.FileName != "oeschinensee.gpx" {
		t.Fatalf("GetIdeaTrackGPX = %+v, want the file byte for byte under its name", file)
	}

	page, err := s.Pull(ctx, testTrip, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	for _, c := range page.Changes {
		if c.Table != TableIdeaTracks || c.ID != "it-1" {
			continue
		}
		want := map[string]any{
			"idea_id": "idea-1", "name": "Rundweg ab Kandersteg", "kind": "hike", "with_kid": int64(0),
			"pause_min": int64(0), "distance_m": int64(7400), "ascent_m": int64(520), "max_ele_m": int64(1752),
			"line": "_p~iF~ps|U_ulLnnqC", "gpx_hash": track.Hash,
		}
		for field, value := range want {
			if c.Row[field] != value {
				t.Errorf("pulled %s = %v, want %v", field, c.Row[field], value)
			}
		}
		if _, leaked := c.Row["gpx"]; leaked {
			t.Error("the file travelled in the sync envelope (ADR-002)")
		}
		return
	}
	t.Fatal("the track's row never reached the trip feed — no other device would see it")
}

// A file without heights has none to show: the three height figures are
// NULL rather than a made-up zero.
func TestPutIdeaTrack_KeepsMissingHeightsMissing_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	f := testTrackFile(testGPX)
	f.AscentM, f.DescentM, f.MaxEleM = nil, nil, nil
	if _, err := s.PutIdeaTrack(context.Background(), testTrip, testUser, "idea-1", "it-flat", f); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	var ascent, maxEle any
	if err := s.db.QueryRow(`SELECT ascent_m, max_ele_m FROM idea_tracks WHERE id = 'it-flat'`).Scan(&ascent, &maxEle); err != nil {
		t.Fatal(err)
	}
	if ascent != nil || maxEle != nil {
		t.Errorf("ascent %v, highest %v; want both NULL", ascent, maxEle)
	}
}

func TestPutIdeaTrack_AppendsBehindTheLastTrackAndRefusesASixth_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	for i := range MaxIdeaTracks {
		gpx := append([]byte(nil), testGPX...)
		gpx = append(gpx, byte(i))
		track, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", fmt.Sprintf("it-%d", i), testTrackFile(gpx))
		if err != nil {
			t.Fatalf("PutIdeaTrack %d: %v", i, err)
		}
		if track.Position != i {
			t.Errorf("track %d at position %d, want behind the last one", i, track.Position)
		}
	}
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-sixth", testTrackFile(testGPX)); !errors.Is(err, ErrIdeaTrackLimit) {
		t.Errorf("sixth track: err = %v, want ErrIdeaTrackLimit", err)
	}
}

// A retried upload whose answer was lost is the same track, not a second one.
func TestPutIdeaTrack_RetryWithTheSameFileChangesNothing_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	first, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-retry", testTrackFile(testGPX))
	if err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	head, _ := s.HeadSeq(ctx, testTrip)
	again, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-retry", testTrackFile(testGPX))
	if err != nil || again != first {
		t.Fatalf("retry = %+v, err %v; want %+v", again, err, first)
	}
	if after, _ := s.HeadSeq(ctx, testTrip); after != head {
		t.Errorf("the feed advanced from %d to %d on a retry", head, after)
	}
}

// „Durch andere Datei ersetzen": the file and what was read from it change,
// what a person set stays.
func TestPutIdeaTrack_AnotherFileReplacesTheFileAndKeepsTheSettings_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-r", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	set := upsert("it-r", "m-set", map[string]any{"name": "Mit Gondel", "kind": "bike", "with_kid": 1, "pause_min": 60},
		"9999999999990-0000-aaaaaaaa")
	set.Table = TableIdeaTracks
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, set); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("settings: outcome %q reason %q err %v", res.Outcome, res.Reason, err)
	}

	other := testTrackFile([]byte(`<gpx>another file</gpx>`))
	other.FileName, other.DistanceM, other.Line, other.Name, other.Kind = "gondel.gpx", 3100, "abc", "ignored", IdeaTrackHike
	replaced, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-r", other)
	if err != nil {
		t.Fatalf("replace: %v", err)
	}

	var name, kind, fileName, line, hash string
	var withKid, pause, distance int
	if err := s.db.QueryRow(`SELECT name, kind, with_kid, pause_min, file_name, distance_m, line, gpx_hash
		FROM idea_tracks WHERE id = 'it-r'`).Scan(&name, &kind, &withKid, &pause, &fileName, &distance, &line, &hash); err != nil {
		t.Fatal(err)
	}
	if name != "Mit Gondel" || kind != "bike" || withKid != 1 || pause != 60 {
		t.Errorf("settings = %q %q kid %d pause %d, want what the person set kept", name, kind, withKid, pause)
	}
	if fileName != "gondel.gpx" || distance != 3100 || line != "abc" || hash != replaced.Hash {
		t.Errorf("file = %q %d %q %q, want the new file's", fileName, distance, line, hash)
	}
	file, err := s.GetIdeaTrackGPX(ctx, testTrip, "idea-1", "it-r")
	if err != nil || file == nil || string(file.GPX) != "<gpx>another file</gpx>" {
		t.Errorf("GetIdeaTrackGPX = %+v, %v; want the new file", file, err)
	}

}

// An edit made before the file was replaced, arriving after it, still
// counts: a setting that never had its own clock keeps the row's old one,
// rather than becoming as new as the replaced file.
func TestPutIdeaTrack_AnEditFromBeforeTheReplaceStillCounts_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-late", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	var inserted string
	if err := s.db.QueryRow(`SELECT updated_hlc FROM idea_tracks WHERE id = 'it-late'`).Scan(&inserted); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-late", testTrackFile([]byte("<gpx>new</gpx>"))); err != nil {
		t.Fatalf("replace: %v", err)
	}

	// Same wall time and counter as the insert, a later device: after the
	// insert, before the replace.
	between := inserted[:strings.LastIndex(inserted, "-")+1] + "zzzzzzzz"
	late := upsert("it-late", "m-late", map[string]any{"pause_min": 90}, sync.HLC(between))
	late.Table = TableIdeaTracks
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, late); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("late pause: outcome %q reason %q err %v", res.Outcome, res.Reason, err)
	}
	var pause int
	if err := s.db.QueryRow(`SELECT pause_min FROM idea_tracks WHERE id = 'it-late'`).Scan(&pause); err != nil {
		t.Fatal(err)
	}
	if pause != 90 {
		t.Errorf("pause = %d, want 90 — the edit was made after the setting was last written", pause)
	}
}

func TestPutIdeaTrack_RefusesMoreThan5MB_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-big", testTrackFile(make([]byte, MaxIdeaTrackBytes+1))); !errors.Is(err, ErrIdeaTrackTooLarge) {
		t.Errorf("err = %v, want ErrIdeaTrackTooLarge", err)
	}
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-max", testTrackFile(make([]byte, MaxIdeaTrackBytes))); err != nil {
		t.Errorf("exactly 5 MB: err = %v, want it stored", err)
	}
}

// The third layer: the CHECK holds even for a write that bypasses the store.
func TestIdeaTrackGPX_CheckRefusesMoreThan5MB_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	mustExec(t, s, `INSERT INTO idea_tracks (id, trip_id, idea_id, name, file_name, gpx_hash, distance_m, point_count, line)
		VALUES ('it-1', ?, 'idea-1', 'n', 'f.gpx', 'h', 0, 2, 'l')`, testTrip)
	if _, err := s.db.Exec(`INSERT INTO idea_track_gpx (track_id, gpx) VALUES ('it-1', ?)`,
		make([]byte, MaxIdeaTrackBytes+1)); err == nil {
		t.Error("the CHECK accepted 5 MB + 1 byte")
	}
}

func TestPutIdeaTrack_RefusesWhatTheSchemaWould_FR29_17(t *testing.T) {
	cases := map[string]func(*IdeaTrackFile){
		"no name":          func(f *IdeaTrackFile) { f.Name = "" },
		"a name too long":  func(f *IdeaTrackFile) { f.Name = strings.Repeat("a", MaxIdeaTrackName+1) },
		"no file name":     func(f *IdeaTrackFile) { f.FileName = "" },
		"an unknown kind":  func(f *IdeaTrackFile) { f.Kind = "ebike" },
		"a negative climb": func(f *IdeaTrackFile) { f.AscentM = intp(-1) },
		"one point":        func(f *IdeaTrackFile) { f.PointCount = 1 },
		"no line":          func(f *IdeaTrackFile) { f.Line = "" },
		"a line too long":  func(f *IdeaTrackFile) { f.Line = strings.Repeat("a", MaxIdeaTrackLine+1) },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			s := openPlannerStore(t)
			f := testTrackFile(testGPX)
			mutate(&f)
			if _, err := s.PutIdeaTrack(context.Background(), testTrip, testUser, "idea-1", "it-bad", f); !errors.Is(err, ErrIdeaTrackInvalid) {
				t.Errorf("err = %v, want ErrIdeaTrackInvalid", err)
			}
		})
	}
}

// An idea of another trip is not this trip's to add to: the membership gate
// in front is the trip's, so the store must not reach past it — not with a
// new id, and not by replacing a track under an id of another idea.
func TestPutIdeaTrack_RefusesAnIdeaOfAnotherTrip_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, "other-trip", testUser, "idea-1", "it-x", testTrackFile(testGPX)); !errors.Is(err, ErrIdeaNotFound) {
		t.Errorf("another trip: err = %v, want ErrIdeaNotFound", err)
	}
	mustExec(t, s, `INSERT INTO ideas (id, trip_id, author_id, title) VALUES ('idea-2', ?, ?, 'Zweite')`, testTrip, testUser)
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-y", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-2", "it-y", testTrackFile([]byte("<gpx/>"))); !errors.Is(err, ErrIdeaNotFound) {
		t.Errorf("another idea's track id: err = %v, want ErrIdeaNotFound", err)
	}
}

func TestGetIdeaTrackGPX_OnlyThroughItsOwnTrip_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-5", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	if file, err := s.GetIdeaTrackGPX(ctx, "other-trip", "idea-1", "it-5"); err != nil || file != nil {
		t.Errorf("through another trip: %+v, err %v; want nothing", file, err)
	}
}

// A push may change what a person sets and nothing the file says.
func TestApplyMutation_IdeaTrack_SettingsOnly_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-6", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}

	settings := upsert("it-6", "m-settings", map[string]any{"name": "Variante", "kind": "bike", "with_kid": 1,
		"pause_min": 45, "position": 3}, "9999999999999-0000-aaaaaaaa")
	settings.Table = TableIdeaTracks
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, settings); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("settings: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}

	for i, field := range []string{"distance_m", "ascent_m", "line", "gpx_hash", "file_name", "point_count", "idea_id"} {
		forged := upsert("it-6", fmt.Sprintf("m-forge-%d", i), map[string]any{field: "1"},
			sync.HLC(fmt.Sprintf("9999999999999-%04d-aaaaaaaa", i+1)))
		forged.Table = TableIdeaTracks
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, forged); err != nil || res.Outcome != sync.OutcomeRejected {
			t.Errorf("%s changed by a push: outcome %q err %v, want rejected — it is the file's", field, res.Outcome, err)
		}
	}

	insert := sync.Mutation{
		MutationID: "m-insert", Op: sync.OpInsert, Table: TableIdeaTracks, ID: "it-forged",
		Fields: map[string]any{"trip_id": testTrip, "idea_id": "idea-1", "name": "n", "file_name": "f.gpx",
			"gpx_hash": "h", "distance_m": 1, "point_count": 2, "line": "l"},
		HLC: sync.HLC("9999999999999-0100-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, insert); err != nil || res.Outcome != sync.OutcomeRejected {
		t.Errorf("pushed insert: outcome %q err %v, want rejected — a track without its file", res.Outcome, err)
	}
}

func TestApplyMutation_DeletingATrackTakesItsFile_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-7", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	del := sync.Mutation{MutationID: "m-del", Op: sync.OpDelete, Table: TableIdeaTracks, ID: "it-7",
		HLC: sync.HLC("9999999999999-0000-aaaaaaaa")}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	var left int
	if err := s.db.QueryRow(`SELECT count(*) FROM idea_track_gpx`).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left != 0 {
		t.Errorf("%d files outlived their track", left)
	}
}

func TestApplyMutation_DeletingAnIdeaTombstonesItsTracks_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-8", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	del := sync.Mutation{MutationID: "m-del", Op: sync.OpDelete, Table: TableIdeas, ID: "idea-1",
		HLC: sync.HLC("9999999999999-0000-aaaaaaaa")}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete idea: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	var tombs int
	if err := s.db.QueryRow(`SELECT count(*) FROM change_log WHERE entity_table = 'idea_tracks' AND entity_id = 'it-8' AND deleted = 1`).
		Scan(&tombs); err != nil {
		t.Fatal(err)
	}
	if tombs != 1 {
		t.Errorf("%d tombstones for the idea's track, want 1", tombs)
	}
}

// FR-32.1: the log names an added and a removed track, and never copies the
// drawn line into an entry.
func TestPutIdeaTrack_RecordsActivityWithoutTheLine_FR29_17(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	if _, err := s.PutIdeaTrack(ctx, testTrip, testUser, "idea-1", "it-9", testTrackFile(testGPX)); err != nil {
		t.Fatalf("PutIdeaTrack: %v", err)
	}
	del := sync.Mutation{MutationID: "m-del9", Op: sync.OpDelete, Table: TableIdeaTracks, ID: "it-9",
		HLC: sync.HLC("9999999999999-0000-aaaaaaaa")}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete: outcome %q reason %q err %v", res.Outcome, res.Reason, err)
	}
	rows, err := s.db.Query(`SELECT op, label, changes FROM activity_log WHERE entity_table = 'idea_tracks' ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var ops []string
	for rows.Next() {
		var op, label, changes string
		if err := rows.Scan(&op, &label, &changes); err != nil {
			t.Fatal(err)
		}
		ops = append(ops, op)
		if label != "Rundweg ab Kandersteg" {
			t.Errorf("%s entry named %q, want the track's name", op, label)
		}
		if strings.Contains(changes, `"line"`) {
			t.Errorf("%s entry copied the line: %s", op, changes)
		}
	}
	if strings.Join(ops, ",") != "insert,delete" {
		t.Errorf("entries %v, want an insert and a delete", ops)
	}
}
