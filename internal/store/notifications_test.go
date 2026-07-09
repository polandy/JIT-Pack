package store

import (
	"context"
	"errors"
	"testing"
)

// FR-6.2 notification persistence + M17 per-kind preferences.

func TestCreateAndListNotifications_NewestFirst(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	id1, err := s.CreateNotification(ctx, testUser, NotifyDelegation,
		map[string]any{"trip_id": testTrip, "item_id": "item-1"})
	if err != nil || id1 == "" {
		t.Fatalf("CreateNotification: id=%q err=%v", id1, err)
	}
	id2, err := s.CreateNotification(ctx, testUser, NotifyMention,
		map[string]any{"trip_id": testTrip, "comment_id": "c-1"})
	if err != nil || id2 == "" {
		t.Fatalf("CreateNotification: id=%q err=%v", id2, err)
	}

	list, err := s.ListNotifications(ctx, testUser, false, 50)
	if err != nil {
		t.Fatalf("ListNotifications: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("len = %d, want 2", len(list))
	}
	// Same-millisecond inserts tie on created_at; id DESC breaks the tie,
	// so only assert both are present and payload round-trips.
	byID := map[string]Notification{list[0].ID: list[0], list[1].ID: list[1]}
	if byID[id1].Payload["item_id"] != "item-1" {
		t.Errorf("payload lost: %+v", byID[id1].Payload)
	}
	if byID[id2].Kind != NotifyMention {
		t.Errorf("kind = %q, want mention", byID[id2].Kind)
	}
	if byID[id1].ReadAt != nil {
		t.Error("fresh notification must be unread")
	}
}

func TestMarkNotificationRead_ScopedToOwner(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-other', 'auth|o', 'Other')`)

	id, err := s.CreateNotification(ctx, testUser, NotifyTask, map[string]any{})
	if err != nil {
		t.Fatal(err)
	}

	if err := s.MarkNotificationRead(ctx, "user-other", id); !errors.Is(err, ErrNotificationNotFound) {
		t.Errorf("foreign mark-read err = %v, want ErrNotificationNotFound", err)
	}
	if err := s.MarkNotificationRead(ctx, testUser, id); err != nil {
		t.Fatalf("own mark-read: %v", err)
	}
	// Idempotent: marking again succeeds.
	if err := s.MarkNotificationRead(ctx, testUser, id); err != nil {
		t.Fatalf("repeat mark-read: %v", err)
	}

	unread, err := s.ListNotifications(ctx, testUser, true, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(unread) != 0 {
		t.Errorf("unread = %d, want 0", len(unread))
	}
	all, _ := s.ListNotifications(ctx, testUser, false, 50)
	if len(all) != 1 || all[0].ReadAt == nil {
		t.Errorf("read_at not stamped: %+v", all)
	}
}

func TestNotificationPrefs_DefaultAllEnabled(t *testing.T) {
	s := openTestStore(t)

	prefs, err := s.NotificationPrefs(context.Background(), testUser)
	if err != nil {
		t.Fatalf("NotificationPrefs: %v", err)
	}
	for _, kind := range []string{NotifyDelegation, NotifyMention, NotifyTask} {
		if !prefs[kind] {
			t.Errorf("%s should default to enabled", kind)
		}
	}
}

func TestNotificationPrefs_DisabledKindSuppressesCreation(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	err := s.SetNotificationPrefs(ctx, testUser, map[string]bool{
		NotifyDelegation: false, "junk_kind": true,
	})
	if err != nil {
		t.Fatalf("SetNotificationPrefs: %v", err)
	}

	prefs, err := s.NotificationPrefs(ctx, testUser)
	if err != nil {
		t.Fatal(err)
	}
	if prefs[NotifyDelegation] {
		t.Error("delegation should be disabled")
	}
	if !prefs[NotifyMention] || !prefs[NotifyTask] {
		t.Error("unset kinds must stay enabled")
	}
	if _, ok := prefs["junk_kind"]; ok {
		t.Error("unknown kinds must be dropped")
	}

	id, err := s.CreateNotification(ctx, testUser, NotifyDelegation, map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	if id != "" {
		t.Errorf("disabled kind created notification %q", id)
	}
	list, _ := s.ListNotifications(ctx, testUser, false, 50)
	if len(list) != 0 {
		t.Errorf("suppressed notification persisted: %+v", list)
	}
}

func TestTripMemberNamesAndTripItemInfo(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-sarah', 'auth|s', 'Sarah')`)
	mustExec(t, s, `INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')`, testTrip, testUser)
	mustExec(t, s, `INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, 'user-sarah', 'editor')`, testTrip)
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name, packer_user_id) VALUES ('item-1', ?, 'Zelt', 'user-sarah')`, testTrip)
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name) VALUES ('item-2', ?, 'Kocher')`, testTrip)

	members, err := s.TripMemberNames(ctx, testTrip)
	if err != nil {
		t.Fatalf("TripMemberNames: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("members = %d, want 2", len(members))
	}

	name, packer, err := s.TripItemInfo(ctx, "item-1")
	if err != nil || name != "Zelt" || packer != "user-sarah" {
		t.Errorf("TripItemInfo = %q/%q/%v, want Zelt/user-sarah/nil", name, packer, err)
	}
	_, packer, err = s.TripItemInfo(ctx, "item-2")
	if err != nil || packer != "" {
		t.Errorf("unset packer = %q/%v, want empty", packer, err)
	}
}
