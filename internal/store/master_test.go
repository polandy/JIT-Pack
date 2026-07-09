package store

import (
	"context"
	"path/filepath"
	"testing"

	"jitpack/internal/sync"
)

// Master-partition sync tests (Sync-API Spec §4/§5): change_log.trip_id
// is NULL for master rows, ownership is enforced per FR-1.6/FR-4.5, and
// pull visibility is per user (own + published templates, member trips).

const testUserB = "user-berta"

func seedUserB(t *testing.T, s *Store) {
	t.Helper()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES (?, 'auth|berta', 'Berta')`, testUserB)
}

func masterMut(op sync.Op, table, id, mutationID string, fields map[string]any, hlc string) sync.Mutation {
	return sync.Mutation{
		MutationID: mutationID, Op: op, Table: table,
		ID: id, Fields: fields, HLC: sync.HLC(hlc),
	}
}

func applyMaster(t *testing.T, s *Store, userID string, m sync.Mutation) MutationResult {
	t.Helper()
	res, err := s.ApplyMasterMutation(context.Background(), userID, m)
	if err != nil {
		t.Fatalf("ApplyMasterMutation(%s %s): %v", m.Op, m.Table, err)
	}
	return res
}

// Reopening a persistent database must not re-apply migrations
// (PRAGMA user_version tracks the schema level).
func TestOpen_ReopenFileDatabase(t *testing.T) {
	dsn := filepath.Join(t.TempDir(), "jitpack.db")

	s1, err := Open(dsn)
	if err != nil {
		t.Fatalf("first Open: %v", err)
	}
	if err := s1.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	s2, err := Open(dsn)
	if err != nil {
		t.Fatalf("second Open must not re-run migrations: %v", err)
	}
	s2.Close()
}

func TestApplyMasterMutation_InsertWritesMasterChangeLog(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO categories (id, name) VALUES ('cat-1', 'Kleidung')`)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-m1', 'Socken')`)
	mustExec(t, s, `INSERT INTO templates (id, owner_id, name) VALUES ('tpl-seed', ?, 'Seed')`, testUser)

	tests := []struct {
		name   string
		m      sync.Mutation
		verify func(t *testing.T)
	}{
		{
			name: "categories",
			m: masterMut(sync.OpInsert, "categories", "cat-2", "mm-cat",
				map[string]any{"name": "Technik", "sort_order": 2}, "0000000001000-0000-aaaaaaaa"),
		},
		{
			name: "items forces created_by",
			m: masterMut(sync.OpInsert, "items", "item-m2", "mm-item",
				map[string]any{"name": "Ladekabel", "unit": "pieces", "is_consumable": 0}, "0000000001001-0000-aaaaaaaa"),
			verify: func(t *testing.T) {
				var createdBy string
				if err := s.db.QueryRow(`SELECT created_by FROM items WHERE id = 'item-m2'`).Scan(&createdBy); err != nil {
					t.Fatal(err)
				}
				if createdBy != testUser {
					t.Errorf("created_by = %q, want %q", createdBy, testUser)
				}
			},
		},
		{
			name: "templates forces owner_id",
			m: masterMut(sync.OpInsert, "templates", "tpl-1", "mm-tpl",
				map[string]any{"name": "Basis", "is_published": 0}, "0000000001002-0000-aaaaaaaa"),
			verify: func(t *testing.T) {
				var owner string
				if err := s.db.QueryRow(`SELECT owner_id FROM templates WHERE id = 'tpl-1'`).Scan(&owner); err != nil {
					t.Fatal(err)
				}
				if owner != testUser {
					t.Errorf("owner_id = %q, want %q", owner, testUser)
				}
			},
		},
		{
			name: "template_items",
			m: masterMut(sync.OpInsert, "template_items", "ti-1", "mm-ti",
				map[string]any{
					"template_id": "tpl-seed", "item_id": "item-m1",
					"quantity_formula": "days", "assignment": "per_person",
					"dedup": "max", "default_mode": "pack", "late_packer": 0,
				}, "0000000001003-0000-aaaaaaaa"),
		},
		{
			name: "trips forces created_by and owner membership",
			m: masterMut(sync.OpInsert, "trips", "trip-new", "mm-trip",
				map[string]any{"name": "Engadin", "end_date": "2026-08-01", "status": "planning"}, "0000000001004-0000-aaaaaaaa"),
			verify: func(t *testing.T) {
				var createdBy string
				if err := s.db.QueryRow(`SELECT created_by FROM trips WHERE id = 'trip-new'`).Scan(&createdBy); err != nil {
					t.Fatal(err)
				}
				if createdBy != testUser {
					t.Errorf("created_by = %q, want %q", createdBy, testUser)
				}
				var role string
				if err := s.db.QueryRow(`SELECT role FROM trip_members WHERE trip_id = 'trip-new' AND user_id = ?`, testUser).Scan(&role); err != nil {
					t.Fatalf("creator membership missing: %v", err)
				}
				if role != "owner" {
					t.Errorf("creator role = %q, want owner", role)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := applyMaster(t, s, testUser, tt.m)
			if res.Outcome != "applied" {
				t.Fatalf("outcome = %q, want applied", res.Outcome)
			}
			if res.Seq == 0 {
				t.Fatal("expected change_log seq > 0")
			}
			var tripID any
			if err := s.db.QueryRow(`SELECT trip_id FROM change_log WHERE seq = ?`, res.Seq).Scan(&tripID); err != nil {
				t.Fatal(err)
			}
			if tripID != nil {
				t.Errorf("change_log.trip_id = %v, want NULL for master partition", tripID)
			}
			if tt.verify != nil {
				tt.verify(t)
			}
		})
	}
}

func TestApplyMutation_PartitionMismatchRejected(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	// Master table via trip push
	_, err := s.ApplyMutation(ctx, testTrip, masterMut(sync.OpInsert, "items", "x", "pm-1",
		map[string]any{"name": "Leak"}, "0000000001000-0000-aaaaaaaa"))
	if err == nil {
		t.Error("items via trip partition: expected ErrUnknownTable, got nil")
	}

	// Trip table via master push
	_, err = s.ApplyMasterMutation(ctx, testUser, masterMut(sync.OpInsert, "trip_items", "x", "pm-2",
		map[string]any{"trip_id": testTrip, "name": "Leak"}, "0000000001001-0000-aaaaaaaa"))
	if err == nil {
		t.Error("trip_items via master partition: expected ErrUnknownTable, got nil")
	}
}

func TestApplyMasterMutation_TemplateOwnershipEnforced(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "tpl-a", "to-1",
		map[string]any{"name": "Andys Basis"}, "0000000001000-0000-aaaaaaaa"))

	tests := []struct {
		name string
		m    sync.Mutation
	}{
		{"foreign upsert", masterMut(sync.OpUpsert, "templates", "tpl-a", "to-2",
			map[string]any{"name": "Gekapert"}, "0000000002000-0000-bbbbbbbb")},
		{"foreign delete", masterMut(sync.OpDelete, "templates", "tpl-a", "to-3", nil,
			"0000000002001-0000-bbbbbbbb")},
		{"foreign template_items insert", masterMut(sync.OpInsert, "template_items", "ti-b", "to-4",
			map[string]any{"template_id": "tpl-a", "item_id": "nope", "quantity_formula": "1"},
			"0000000002002-0000-bbbbbbbb")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := applyMaster(t, s, testUserB, tt.m)
			if res.Outcome != "rejected" {
				t.Errorf("outcome = %q, want rejected", res.Outcome)
			}
		})
	}

	var name string
	if err := s.db.QueryRow(`SELECT name FROM templates WHERE id = 'tpl-a'`).Scan(&name); err != nil {
		t.Fatalf("template must still exist: %v", err)
	}
	if name != "Andys Basis" {
		t.Errorf("name = %q, foreign write must not stick", name)
	}
}

func TestApplyMasterMutation_TripAuthorization(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "trips", "trip-auth", "ta-1",
		map[string]any{"name": "Engadin", "end_date": "2026-08-01"}, "0000000001000-0000-aaaaaaaa"))

	// Non-member update → rejected
	res := applyMaster(t, s, testUserB, masterMut(sync.OpUpsert, "trips", "trip-auth", "ta-2",
		map[string]any{"status": "active"}, "0000000002000-0000-bbbbbbbb"))
	if res.Outcome != "rejected" {
		t.Errorf("non-member update outcome = %q, want rejected", res.Outcome)
	}

	// Editor update → applied; editor delete → rejected (FR-4.7 tier)
	mustExec(t, s, `INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip-auth', ?, 'editor')`, testUserB)
	res = applyMaster(t, s, testUserB, masterMut(sync.OpUpsert, "trips", "trip-auth", "ta-3",
		map[string]any{"status": "active"}, "0000000003000-0000-bbbbbbbb"))
	if res.Outcome != "applied" {
		t.Errorf("editor update outcome = %q, want applied", res.Outcome)
	}
	res = applyMaster(t, s, testUserB, masterMut(sync.OpDelete, "trips", "trip-auth", "ta-4", nil,
		"0000000004000-0000-bbbbbbbb"))
	if res.Outcome != "rejected" {
		t.Errorf("editor delete outcome = %q, want rejected", res.Outcome)
	}

	// Owner delete → applied, tombstone in master change_log
	res = applyMaster(t, s, testUser, masterMut(sync.OpDelete, "trips", "trip-auth", "ta-5", nil,
		"0000000005000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("owner delete outcome = %q, want applied", res.Outcome)
	}
	var deleted int
	if err := s.db.QueryRow(`SELECT deleted FROM change_log WHERE seq = ?`, res.Seq).Scan(&deleted); err != nil {
		t.Fatal(err)
	}
	if deleted != 1 {
		t.Error("expected tombstone entry for deleted trip")
	}
}

// Deleting a template cascades its template_items; clients must still
// learn about the cascade through tombstones.
func TestApplyMasterMutation_TemplateDeleteTombstonesItems(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-c', 'Socken')`)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "tpl-c", "td-1",
		map[string]any{"name": "Cascade"}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "template_items", "ti-c", "td-2",
		map[string]any{"template_id": "tpl-c", "item_id": "item-c", "quantity_formula": "1"},
		"0000000001001-0000-aaaaaaaa"))

	applyMaster(t, s, testUser, masterMut(sync.OpDelete, "templates", "tpl-c", "td-3", nil,
		"0000000002000-0000-aaaaaaaa"))

	var tombstones int
	err := s.db.QueryRow(`SELECT count(*) FROM change_log
		WHERE entity_table = 'template_items' AND entity_id = 'ti-c' AND deleted = 1 AND trip_id IS NULL`).Scan(&tombstones)
	if err != nil {
		t.Fatal(err)
	}
	if tombstones != 1 {
		t.Errorf("template_items tombstones = %d, want 1", tombstones)
	}
}

// Deleting an item still referenced by a template must not 500 — the FK
// violation maps to a rejected outcome.
func TestApplyMasterMutation_DeleteReferencedItemRejected(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-ref', 'Socken')`)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "tpl-ref", "dr-1",
		map[string]any{"name": "Ref"}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "template_items", "ti-ref", "dr-2",
		map[string]any{"template_id": "tpl-ref", "item_id": "item-ref", "quantity_formula": "1"},
		"0000000001001-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, "items", "item-ref", "dr-3", nil,
		"0000000002000-0000-aaaaaaaa"))
	if res.Outcome != "rejected" {
		t.Errorf("outcome = %q, want rejected", res.Outcome)
	}
	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM items WHERE id = 'item-ref'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Error("item must survive the rejected delete")
	}
}

func TestPullMaster_VisibilityPerUser(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	hlc := "0000000001000-0000-aaaaaaaa"
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "categories", "cat-v", "pv-1",
		map[string]any{"name": "Kleidung"}, hlc))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "tpl-priv", "pv-2",
		map[string]any{"name": "Privat", "is_published": 0}, hlc))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "tpl-pub", "pv-3",
		map[string]any{"name": "Publik", "is_published": 1}, hlc))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "trips", "trip-v", "pv-4",
		map[string]any{"name": "Nur Andy", "end_date": "2026-08-01"}, hlc))

	pull := func(userID string) map[string]bool {
		t.Helper()
		page, err := s.PullMaster(context.Background(), userID, 0, 100)
		if err != nil {
			t.Fatalf("PullMaster(%s): %v", userID, err)
		}
		got := map[string]bool{}
		for _, c := range page.Changes {
			got[c.Table+"/"+c.ID] = true
		}
		return got
	}

	gotB := pull(testUserB)
	for id, want := range map[string]bool{
		"categories/cat-v":   true,
		"templates/tpl-pub":  true,
		"templates/tpl-priv": false,
		"trips/trip-v":       false,
	} {
		if gotB[id] != want {
			t.Errorf("user B sees %s = %v, want %v", id, gotB[id], want)
		}
	}

	gotA := pull(testUser)
	for _, id := range []string{"categories/cat-v", "templates/tpl-priv", "templates/tpl-pub", "trips/trip-v"} {
		if !gotA[id] {
			t.Errorf("owner must see %s", id)
		}
	}
}

func TestPullMaster_ExcludesTripPartition(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	if _, err := s.ApplyMutation(ctx, testTrip, upsert("item-t", "px-1",
		map[string]any{"trip_id": testTrip, "name": "Socken"}, "0000000001000-0000-aaaaaaaa")); err != nil {
		t.Fatal(err)
	}
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "categories", "cat-x", "px-2",
		map[string]any{"name": "Technik"}, "0000000001001-0000-aaaaaaaa"))

	master, err := s.PullMaster(ctx, testUser, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range master.Changes {
		if c.Table == "trip_items" {
			t.Error("master pull leaked trip partition change")
		}
	}

	trip, err := s.Pull(ctx, testTrip, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range trip.Changes {
		if c.Table == "categories" {
			t.Error("trip pull leaked master partition change")
		}
	}
}
