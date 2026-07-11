package store

import (
	"bytes"
	"context"
	"errors"
	"testing"
)

// Item-image tests (Addendum 3.22, FR-22.1). The BLOB lives outside the
// sync envelope; only items.image_hash flows through the master feed, so
// these tests assert both the stored bytes and that a fresh change_log
// entry carries the hash to other devices.

func TestSetItemImage_StoresBlobStampsHashAndLogsChange(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-camera', 'Kamera')`)
	ctx := context.Background()
	jpeg := []byte("\xff\xd8\xff\xe0 pretend jpeg bytes")

	hash, err := s.SetItemImage(ctx, "item-camera", jpeg)
	if err != nil {
		t.Fatalf("SetItemImage: %v", err)
	}
	if hash == "" {
		t.Fatal("SetItemImage returned an empty hash")
	}

	var stored string
	if err := s.db.QueryRow(`SELECT image_hash FROM items WHERE id = 'item-camera'`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != hash {
		t.Errorf("items.image_hash = %q, want %q", stored, hash)
	}

	got, gotHash, err := s.GetItemImage(ctx, "item-camera")
	if err != nil {
		t.Fatalf("GetItemImage: %v", err)
	}
	if !bytes.Equal(got, jpeg) {
		t.Errorf("GetItemImage returned %d bytes, want %d", len(got), len(jpeg))
	}
	if gotHash != hash {
		t.Errorf("GetItemImage hash = %q, want %q", gotHash, hash)
	}

	var logged int
	if err := s.db.QueryRow(`SELECT count(*) FROM change_log
		WHERE entity_table = 'items' AND entity_id = 'item-camera' AND deleted = 0 AND trip_id IS NULL`).Scan(&logged); err != nil {
		t.Fatal(err)
	}
	if logged == 0 {
		t.Error("no change_log entry for the image_hash stamp — other devices would never pull it")
	}
}

func TestSetItemImage_HashRevealsChangeThroughPull(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-camera', 'Kamera')`)
	ctx := context.Background()

	hash, err := s.SetItemImage(ctx, "item-camera", []byte("\xff\xd8\xff\xe0jpeg"))
	if err != nil {
		t.Fatalf("SetItemImage: %v", err)
	}

	page, err := s.PullMaster(ctx, testUserB, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range page.Changes {
		if c.Table == "items" && c.ID == "item-camera" {
			if c.Row["image_hash"] != hash {
				t.Errorf("pulled image_hash = %v, want %q", c.Row["image_hash"], hash)
			}
			return
		}
	}
	t.Error("items row with the new image_hash not visible through pull")
}

func TestSetItemImage_RejectsOversized(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-camera', 'Kamera')`)

	oversized := make([]byte, maxItemImageBytes+1)
	if _, err := s.SetItemImage(context.Background(), "item-camera", oversized); !errors.Is(err, ErrItemImageTooLarge) {
		t.Fatalf("SetItemImage(oversized) err = %v, want ErrItemImageTooLarge", err)
	}
}

func TestSetItemImage_UnknownItemReturnsNotFound(t *testing.T) {
	s := openTestStore(t)
	if _, err := s.SetItemImage(context.Background(), "ghost", []byte("x")); !errors.Is(err, ErrItemNotFound) {
		t.Fatalf("SetItemImage(unknown) err = %v, want ErrItemNotFound", err)
	}
}

func TestDeleteItemImage_ClearsBlobNullsHashAndLogsChange(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-camera', 'Kamera')`)
	ctx := context.Background()
	if _, err := s.SetItemImage(ctx, "item-camera", []byte("\xff\xd8\xff\xe0jpeg")); err != nil {
		t.Fatalf("SetItemImage: %v", err)
	}

	if err := s.DeleteItemImage(ctx, "item-camera"); err != nil {
		t.Fatalf("DeleteItemImage: %v", err)
	}

	got, hash, err := s.GetItemImage(ctx, "item-camera")
	if err != nil {
		t.Fatalf("GetItemImage: %v", err)
	}
	if got != nil {
		t.Errorf("GetItemImage after delete returned %d bytes, want none", len(got))
	}
	if hash != "" {
		t.Errorf("GetItemImage hash after delete = %q, want empty", hash)
	}

	var stored *string
	if err := s.db.QueryRow(`SELECT image_hash FROM items WHERE id = 'item-camera'`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != nil {
		t.Errorf("items.image_hash after delete = %q, want NULL", *stored)
	}

	var tombstoneOrTouch int
	if err := s.db.QueryRow(`SELECT count(*) FROM change_log
		WHERE entity_table = 'items' AND entity_id = 'item-camera' AND trip_id IS NULL`).Scan(&tombstoneOrTouch); err != nil {
		t.Fatal(err)
	}
	if tombstoneOrTouch < 2 {
		t.Errorf("change_log entries for item = %d, want the set + clear (>=2)", tombstoneOrTouch)
	}
}

func TestDeleteItemImage_IdempotentWhenNoImage(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-camera', 'Kamera')`)
	if err := s.DeleteItemImage(context.Background(), "item-camera"); err != nil {
		t.Fatalf("DeleteItemImage with no image should be a no-op, got %v", err)
	}
}

func TestItemDelete_CascadesItemImage(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-camera', 'Kamera')`)
	ctx := context.Background()
	if _, err := s.SetItemImage(ctx, "item-camera", []byte("\xff\xd8\xff\xe0jpeg")); err != nil {
		t.Fatalf("SetItemImage: %v", err)
	}
	mustExec(t, s, `DELETE FROM items WHERE id = 'item-camera'`)

	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM item_images WHERE item_id = 'item-camera'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("item_images rows after item delete = %d, want 0 (ON DELETE CASCADE)", n)
	}
}
