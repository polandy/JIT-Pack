package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// trip_members in the master partition (FR-4.5/4.7, spec P-3): membership
// rows sync like any master entity, only Owner/Admin manage them, the
// creator's row is immutable, and a grant resurfaces the trips row so a
// late-added member's cursor picks the trip up.

const testUserC = "user-carla"

func seedUserC(t *testing.T, s *Store) {
	t.Helper()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES (?, 'auth|carla', 'Carla')`, testUserC)
}

func memberMut(op sync.Op, id, mutationID string, fields map[string]any, hlc string) sync.Mutation {
	return masterMut(op, "trip_members", id, mutationID, fields, hlc)
}

func TestApplyMasterMutation_TripMembersAuthorization(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	seedUserC(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "trips", "trip-m", "tm-0",
		map[string]any{"name": "Engadin", "end_date": "2026-08-01"}, "0000000001000-0000-aaaaaaaa"))

	fields := func(user, role string) map[string]any {
		return map[string]any{"trip_id": "trip-m", "user_id": user, "role": role}
	}
	var creatorRowID string
	if err := s.db.QueryRow(
		`SELECT id FROM trip_members WHERE trip_id = 'trip-m' AND user_id = ?`, testUser).Scan(&creatorRowID); err != nil {
		t.Fatalf("creator membership row missing: %v", err)
	}

	// Non-member cannot add anyone.
	res := applyMaster(t, s, testUserB, memberMut(sync.OpInsert, "mem-c0", "tm-1",
		fields(testUserC, "editor"), "0000000002000-0000-bbbbbbbb"))
	if res.Outcome != "rejected" {
		t.Errorf("non-member add outcome = %q, want rejected", res.Outcome)
	}

	// Owner adds an editor.
	res = applyMaster(t, s, testUser, memberMut(sync.OpInsert, "mem-b", "tm-2",
		fields(testUserB, "editor"), "0000000003000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("owner add outcome = %q, want applied", res.Outcome)
	}

	// Editor cannot manage members (FR-4.7).
	res = applyMaster(t, s, testUserB, memberMut(sync.OpInsert, "mem-c1", "tm-3",
		fields(testUserC, "editor"), "0000000004000-0000-bbbbbbbb"))
	if res.Outcome != "rejected" {
		t.Errorf("editor add outcome = %q, want rejected", res.Outcome)
	}

	// Owner promotes the editor to admin; the admin may then add members.
	res = applyMaster(t, s, testUser, memberMut(sync.OpUpsert, "mem-b", "tm-4",
		map[string]any{"role": "admin"}, "0000000005000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("promote outcome = %q, want applied", res.Outcome)
	}
	res = applyMaster(t, s, testUserB, memberMut(sync.OpInsert, "mem-c", "tm-5",
		fields(testUserC, "editor"), "0000000006000-0000-bbbbbbbb"))
	if res.Outcome != "applied" {
		t.Fatalf("admin add outcome = %q, want applied", res.Outcome)
	}

	// Nobody can grant 'owner' — the creator's server-created row is the
	// only owner (FR-4.5).
	res = applyMaster(t, s, testUserB, memberMut(sync.OpUpsert, "mem-c", "tm-6",
		map[string]any{"role": "owner"}, "0000000007000-0000-bbbbbbbb"))
	if res.Outcome != "rejected" {
		t.Errorf("grant owner outcome = %q, want rejected", res.Outcome)
	}

	// The creator's membership is immutable — no demotion, no removal,
	// not even by an admin (FR-4.7).
	res = applyMaster(t, s, testUserB, memberMut(sync.OpUpsert, creatorRowID, "tm-7",
		map[string]any{"role": "editor"}, "0000000008000-0000-bbbbbbbb"))
	if res.Outcome != "rejected" {
		t.Errorf("demote creator outcome = %q, want rejected", res.Outcome)
	}
	res = applyMaster(t, s, testUserB, memberMut(sync.OpDelete, creatorRowID, "tm-8",
		nil, "0000000009000-0000-bbbbbbbb"))
	if res.Outcome != "rejected" {
		t.Errorf("remove creator outcome = %q, want rejected", res.Outcome)
	}

	// Owner removes a member; the tombstone lands in the master feed.
	res = applyMaster(t, s, testUser, memberMut(sync.OpDelete, "mem-c", "tm-9",
		nil, "0000000010000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("owner remove outcome = %q, want applied", res.Outcome)
	}
	var deleted int
	if err := s.db.QueryRow(
		`SELECT deleted FROM change_log WHERE entity_table = 'trip_members' AND entity_id = 'mem-c' AND trip_id IS NULL
		 ORDER BY seq DESC LIMIT 1`).Scan(&deleted); err != nil {
		t.Fatal(err)
	}
	if deleted != 1 {
		t.Error("expected tombstone for removed member")
	}

	// A duplicate (trip, user) pair violates UNIQUE and must reject
	// cleanly, not 500 — two admins racing to add the same person.
	res = applyMaster(t, s, testUser, memberMut(sync.OpInsert, "mem-b-dup", "tm-10",
		fields(testUserB, "editor"), "0000000011000-0000-aaaaaaaa"))
	if res.Outcome != "rejected" {
		t.Errorf("duplicate add outcome = %q, want rejected", res.Outcome)
	}
}

// Creating a trip must log the auto-created owner membership so every
// device — the creator's and, later, other members' — syncs the roster.
func TestApplyMasterMutation_TripInsertLogsCreatorMembership(t *testing.T) {
	s := openTestStore(t)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "trips", "trip-cm", "cm-1",
		map[string]any{"name": "Roster", "end_date": "2026-08-01"}, "0000000001000-0000-aaaaaaaa"))

	var rowID string
	if err := s.db.QueryRow(
		`SELECT id FROM trip_members WHERE trip_id = 'trip-cm' AND user_id = ?`, testUser).Scan(&rowID); err != nil {
		t.Fatalf("creator membership row missing: %v", err)
	}
	var n int
	if err := s.db.QueryRow(
		`SELECT count(*) FROM change_log WHERE entity_table = 'trip_members' AND entity_id = ? AND trip_id IS NULL`,
		rowID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("creator membership change_log entries = %d, want 1", n)
	}

	page, err := s.PullMaster(context.Background(), testUser, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range page.Changes {
		if c.Table == "trip_members" && c.ID == rowID {
			found = true
			if c.Row["role"] != "owner" {
				t.Errorf("pulled role = %v, want owner", c.Row["role"])
			}
		}
	}
	if !found {
		t.Error("creator must pull their own membership row")
	}
}

// A membership grant after the fact must resurface the trips row: the new
// member's pull cursor is already past the trip's original change_log
// entry, so without a fresh entry they would never see the trip.
func TestPullMaster_LateMemberSeesTripAndRoster(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	seedUserC(t, s)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "trips", "trip-late", "lm-1",
		map[string]any{"name": "Spät dabei", "end_date": "2026-08-01"}, "0000000001000-0000-aaaaaaaa"))

	// B is fully caught up and sees nothing of the foreign trip.
	first, err := s.PullMaster(ctx, testUserB, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range first.Changes {
		if c.Table == "trips" || c.Table == "trip_members" {
			t.Fatalf("non-member pulled %s/%s", c.Table, c.ID)
		}
	}

	applyMaster(t, s, testUser, memberMut(sync.OpInsert, "mem-late", "lm-2",
		map[string]any{"trip_id": "trip-late", "user_id": testUserB, "role": "editor"},
		"0000000002000-0000-aaaaaaaa"))

	second, err := s.PullMaster(ctx, testUserB, first.NextCursor, 100)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, c := range second.Changes {
		got[c.Table+"/"+c.ID] = true
	}
	if !got["trip_members/mem-late"] {
		t.Error("new member must pull their membership row")
	}
	if !got["trips/trip-late"] {
		t.Error("new member must pull the trip they were just added to")
	}

	// A bystander's cursor passes the same entries without seeing them.
	other, err := s.PullMaster(ctx, testUserC, first.NextCursor, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range other.Changes {
		if c.Table == "trips" || c.Table == "trip_members" {
			t.Errorf("bystander pulled %s/%s", c.Table, c.ID)
		}
	}
}

// ListUsers backs the M3 sharing picker (FR-4.5): every account on the
// instance with its display name, ordered for stable UI.
func TestListUsers(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)

	users, err := s.ListUsers(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 2 {
		t.Fatalf("len(users) = %d, want 2", len(users))
	}
	if users[0].DisplayName != "Andy" || users[1].DisplayName != "Berta" {
		t.Errorf("users = %+v, want Andy then Berta", users)
	}
	if users[0].UserID != testUser || users[1].UserID != testUserB {
		t.Errorf("user ids = %+v", users)
	}
}
