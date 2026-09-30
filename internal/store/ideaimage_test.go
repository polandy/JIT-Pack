package store

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"testing"

	"jitpack/internal/sync"
)

// Idea pictures (FR-29.5). Like an item photo (ADR-002) the bytes stay out of
// the sync envelope: the upload creates an idea_images row carrying only the
// hash and the position, and that row travels the trip feed.

var testJPEG = []byte("\xff\xd8\xff\xe0 pretend jpeg bytes")

func TestAddIdeaImage_StoresBytesAndLogsTheRowOnTheTripFeed_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()

	img, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "ii-1", testJPEG)
	if err != nil {
		t.Fatalf("AddIdeaImage: %v", err)
	}
	if img.ID == "" || img.Hash == "" {
		t.Fatalf("AddIdeaImage = %+v, want an id and a hash", img)
	}
	if img.Position != 0 {
		t.Errorf("first picture's position = %d, want 0 (the cover)", img.Position)
	}

	got, hash, err := s.GetIdeaImage(ctx, testTrip, "idea-1", img.ID)
	if err != nil {
		t.Fatalf("GetIdeaImage: %v", err)
	}
	if !bytes.Equal(got, testJPEG) || hash != img.Hash {
		t.Errorf("GetIdeaImage = %d bytes, hash %q; want %d bytes, hash %q", len(got), hash, len(testJPEG), img.Hash)
	}

	page, err := s.Pull(ctx, testTrip, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	for _, c := range page.Changes {
		if c.Table != TableIdeaImages || c.ID != img.ID {
			continue
		}
		if c.Row["image_hash"] != img.Hash || c.Row["idea_id"] != "idea-1" {
			t.Errorf("pulled row = %v, want the hash and the idea", c.Row)
		}
		if _, leaked := c.Row["image"]; leaked {
			t.Error("the bytes travelled in the sync envelope (ADR-002)")
		}
		return
	}
	t.Fatal("the picture's row never reached the trip feed — no other device would see it")
}

func TestAddIdeaImage_AppendsBehindTheLastPicture_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO idea_images (id, trip_id, idea_id, image_hash, position) VALUES ('ii-far', ?, 'idea-1', 'h', 2)`,
		testTrip)

	img, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "ii-2", testJPEG)
	if err != nil {
		t.Fatalf("AddIdeaImage: %v", err)
	}
	if img.Position != 3 {
		t.Errorf("position = %d, want 3 — behind the last one, not into a gap", img.Position)
	}
}

func TestAddIdeaImage_RefusesAFifthPicture_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	for i := range MaxIdeaImages {
		if _, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", fmt.Sprintf("ii-%d", i), testJPEG); err != nil {
			t.Fatalf("AddIdeaImage: %v", err)
		}
	}
	if _, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "ii-fifth", testJPEG); !errors.Is(err, ErrIdeaImageLimit) {
		t.Errorf("fifth picture: err = %v, want ErrIdeaImageLimit", err)
	}
}

// A retried upload whose answer was lost is the same picture, not a second one.
func TestAddIdeaImage_RetryWithTheSameIdChangesNothing_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	first, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "ii-retry", testJPEG)
	if err != nil {
		t.Fatalf("AddIdeaImage: %v", err)
	}
	again, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "ii-retry", testJPEG)
	if err != nil || again != first {
		t.Fatalf("retry = %+v, err %v; want %+v", again, err, first)
	}
	var rows int
	if err := s.db.QueryRow(`SELECT count(*) FROM idea_images`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Errorf("%d rows after a retry, want 1", rows)
	}
}

func TestAddIdeaImage_RefusesMoreThan500KB_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	if _, err := s.AddIdeaImage(context.Background(), testTrip, testUser, "idea-1", "ii-9", make([]byte, MaxIdeaImageBytes+1)); !errors.Is(err, ErrIdeaImageTooLarge) {
		t.Errorf("err = %v, want ErrIdeaImageTooLarge", err)
	}
	if _, err := s.AddIdeaImage(context.Background(), testTrip, testUser, "idea-1", "ii-10", make([]byte, MaxIdeaImageBytes)); err != nil {
		t.Errorf("exactly 500 KB: err = %v, want it stored", err)
	}
}

// The third layer: the CHECK holds even for a write that bypasses the store.
func TestIdeaImageBytes_CheckRefusesMoreThan500KB_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	mustExec(t, s, `INSERT INTO idea_images (id, trip_id, idea_id, image_hash) VALUES ('ii-1', ?, 'idea-1', 'h')`, testTrip)
	if _, err := s.db.Exec(`INSERT INTO idea_image_bytes (image_id, image) VALUES ('ii-1', ?)`,
		make([]byte, MaxIdeaImageBytes+1)); err == nil {
		t.Error("the CHECK accepted 500 KB + 1 byte")
	}
}

// An idea of another trip is not this trip's to add to: the membership gate
// in front is the trip's, so the store must not reach past it.
func TestAddIdeaImage_RefusesAnIdeaOfAnotherTrip_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	if _, err := s.AddIdeaImage(context.Background(), "other-trip", testUser, "idea-1", "ii-11", testJPEG); !errors.Is(err, ErrIdeaNotFound) {
		t.Errorf("err = %v, want ErrIdeaNotFound", err)
	}
}

func TestGetIdeaImage_OnlyThroughItsOwnTrip_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	img, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "ii-5", testJPEG)
	if err != nil {
		t.Fatalf("AddIdeaImage: %v", err)
	}
	if got, _, err := s.GetIdeaImage(ctx, "other-trip", "idea-1", img.ID); err != nil || got != nil {
		t.Errorf("through another trip: %d bytes, err %v; want nothing", len(got), err)
	}
}

// A push may move a picture (FR-29.5's „Als Titelbild") and nothing else.
func TestApplyMutation_IdeaImage_PositionOnly_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	img, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "ii-6", testJPEG)
	if err != nil {
		t.Fatalf("AddIdeaImage: %v", err)
	}

	move := upsert(img.ID, "m-move", map[string]any{"position": 2}, "9999999999999-0000-aaaaaaaa")
	move.Table = TableIdeaImages
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, move); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("move: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}

	rehash := upsert(img.ID, "m-hash", map[string]any{"image_hash": "forged"}, "9999999999999-0001-aaaaaaaa")
	rehash.Table = TableIdeaImages
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, rehash); err != nil || res.Outcome != sync.OutcomeRejected {
		t.Errorf("hash change: outcome %q err %v, want rejected — the hash is the upload's", res.Outcome, err)
	}

	forged := sync.Mutation{
		MutationID: "m-insert", Op: sync.OpInsert, Table: TableIdeaImages, ID: "ii-forged",
		Fields: map[string]any{"trip_id": testTrip, "idea_id": "idea-1", "image_hash": "h", "position": 0}, HLC: sync.HLC("9999999999999-0002-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, forged); err != nil || res.Outcome != sync.OutcomeRejected {
		t.Errorf("pushed insert: outcome %q err %v, want rejected — a picture without bytes", res.Outcome, err)
	}
}

func TestApplyMutation_DeletingAPictureTakesItsBytes_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	img, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "ii-7", testJPEG)
	if err != nil {
		t.Fatalf("AddIdeaImage: %v", err)
	}
	del := sync.Mutation{MutationID: "m-del", Op: sync.OpDelete, Table: TableIdeaImages, ID: img.ID,
		HLC: sync.HLC("9999999999999-0000-aaaaaaaa")}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	var left int
	if err := s.db.QueryRow(`SELECT count(*) FROM idea_image_bytes`).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left != 0 {
		t.Errorf("%d byte rows outlived their picture", left)
	}
}

func TestApplyMutation_DeletingAnIdeaTombstonesItsPictures_FR29_5(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	img, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "ii-8", testJPEG)
	if err != nil {
		t.Fatalf("AddIdeaImage: %v", err)
	}
	del := sync.Mutation{MutationID: "m-del", Op: sync.OpDelete, Table: TableIdeas, ID: "idea-1",
		HLC: sync.HLC("9999999999999-0000-aaaaaaaa")}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete idea: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	var tombs int
	if err := s.db.QueryRow(`SELECT count(*) FROM change_log WHERE entity_table = 'idea_images' AND entity_id = ? AND deleted = 1`,
		img.ID).Scan(&tombs); err != nil {
		t.Fatal(err)
	}
	if tombs != 1 {
		t.Errorf("%d tombstones for the idea's picture, want 1", tombs)
	}
}
