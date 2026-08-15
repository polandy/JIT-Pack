package store

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"

	"jitpack/internal/sync"
)

// Master-partition sync tests (Sync-API Spec §4/§5): change_log.trip_id
// is NULL for master rows, trip authorization is enforced per FR-4.5, and
// pull visibility is per user (member trips; templates and master items are
// instance-wide per the FR-1.6 MVP simplification).

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
	mustExec(t, s, `INSERT INTO tags (id, name) VALUES ('cat-1', 'Kleidung')`)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-m1', 'Socken')`)
	mustExec(t, s, `INSERT INTO templates (id, owner_id, name) VALUES ('tpl-seed', ?, 'Seed')`, testUser)

	tests := []struct {
		name   string
		m      sync.Mutation
		verify func(t *testing.T)
	}{
		{
			name: "tags",
			m: masterMut(sync.OpInsert, "tags", "cat-2", "mm-cat",
				map[string]any{"name": "Technik", "sort_order": 2}, "0000000001000-0000-aaaaaaaa"),
		},
		{
			name: "items forces created_by",
			m: masterMut(sync.OpInsert, "items", "item-m2", "mm-item",
				map[string]any{"name": "Ladekabel"}, "0000000001001-0000-aaaaaaaa"),
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
				map[string]any{"name": "Basis"}, "0000000001002-0000-aaaaaaaa"),
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
					"quantity": 2, "assignment": "per_person",
					"dedup": "max", "default_mode": "pack", "late_packer": 0,
				}, "0000000001003-0000-aaaaaaaa"),
		},
		{
			name: "trips forces created_by and owner membership",
			m: masterMut(sync.OpInsert, "trips", "trip-new", "mm-trip",
				map[string]any{"name": "Engadin", "year": 2026, "end_date": "2026-08-01", "status": "planning"}, "0000000001004-0000-aaaaaaaa"),
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

// FR-1.6 MVP simplification (owner decision 2026-08-08, "Jeder sieht einfach
// alles"): templates and their positions are shared instance-wide like master
// items (the FR-22.6 governance model). owner_id survives as *creator*
// metadata — it is stamped on insert and never rewritten by a foreign edit,
// but it grants no exclusivity.
func TestApplyMasterMutation_TemplatesSharedInstanceWide(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-shared', 'Zelt')`)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "tpl-a", "to-1",
		map[string]any{"name": "Andys Basis"}, "0000000001000-0000-aaaaaaaa"))

	tests := []struct {
		name string
		m    sync.Mutation
	}{
		{"foreign upsert", masterMut(sync.OpUpsert, "templates", "tpl-a", "to-2",
			map[string]any{"name": "Gemeinsame Basis"}, "0000000002000-0000-bbbbbbbb")},
		{"foreign template_items insert", masterMut(sync.OpInsert, "template_items", "ti-b", "to-4",
			map[string]any{"template_id": "tpl-a", "item_id": "item-shared", "quantity": 1},
			"0000000002002-0000-bbbbbbbb")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := applyMaster(t, s, testUserB, tt.m)
			if res.Outcome != "applied" {
				t.Errorf("outcome = %q, want applied", res.Outcome)
			}
		})
	}

	var name, owner string
	if err := s.db.QueryRow(`SELECT name, owner_id FROM templates WHERE id = 'tpl-a'`).
		Scan(&name, &owner); err != nil {
		t.Fatalf("template must still exist: %v", err)
	}
	if name != "Gemeinsame Basis" {
		t.Errorf("name = %q, the foreign edit must stick", name)
	}
	if owner != testUser {
		t.Errorf("owner_id = %q, want %q — creator metadata, not rewritten by an editor", owner, testUser)
	}

	res := applyMaster(t, s, testUserB, masterMut(sync.OpDelete, "templates", "tpl-a", "to-3", nil,
		"0000000003000-0000-bbbbbbbb"))
	if res.Outcome != "applied" {
		t.Errorf("foreign delete outcome = %q, want applied", res.Outcome)
	}
}

func TestApplyMasterMutation_TripAuthorization(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "trips", "trip-auth", "ta-1",
		map[string]any{"name": "Engadin", "year": 2026, "end_date": "2026-08-01"}, "0000000001000-0000-aaaaaaaa"))

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
		map[string]any{"template_id": "tpl-c", "item_id": "item-c", "quantity": 1},
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

// FR-27.1/27.6: every template declares a scope — 'group' (positions only,
// includable) or 'template' (a Ferien-Vorlage, includes groups). 'template'
// is the default so pre-§3.27 rows keep working.
func TestApplyMasterMutation_TemplateScopes(t *testing.T) {
	s := openTestStore(t)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "tpl-default", "sc-1",
		map[string]any{"name": "Ohne Scope"}, "0000000001000-0000-aaaaaaaa"))
	var kind string
	if err := s.db.QueryRow(`SELECT kind FROM templates WHERE id = 'tpl-default'`).Scan(&kind); err != nil {
		t.Fatal(err)
	}
	if kind != "template" {
		t.Errorf("default kind = %q, want template", kind)
	}

	if res := applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "grp-1", "sc-2",
		map[string]any{"name": "Makro", "kind": "group"},
		"0000000001001-0000-aaaaaaaa")); res.Outcome != "applied" {
		t.Errorf("group insert outcome = %q, want applied", res.Outcome)
	}
	if res := applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "bogus", "sc-3",
		map[string]any{"name": "Quatsch", "kind": "bundle"},
		"0000000001002-0000-aaaaaaaa")); res.Outcome != "rejected" {
		t.Errorf("unknown kind outcome = %q, want rejected (CHECK)", res.Outcome)
	}
}

// FR-27.1: the hierarchy is exactly two levels — a Ferien-Vorlage includes
// groups, nothing else includes anything. That is what makes cycles
// structurally impossible, so the store refuses every other shape.
func TestApplyMasterMutation_TemplateIncludesTwoLevelsOnly(t *testing.T) {
	s := openTestStore(t)
	seed := func(id, kind string, mutID string) {
		t.Helper()
		applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", id, mutID,
			map[string]any{"name": id, "kind": kind}, "0000000001000-0000-aaaaaaaa"))
	}
	seed("vorlage-a", "template", "in-s1")
	seed("vorlage-b", "template", "in-s2")
	seed("gruppe-a", "group", "in-s3")
	seed("gruppe-b", "group", "in-s4")

	tests := []struct {
		name          string
		parent, child string
		mutationID    string
		want          string
	}{
		{"vacation template includes a group", "vorlage-a", "gruppe-a", "in-1", "applied"},
		{"group includes a group", "gruppe-a", "gruppe-b", "in-2", "rejected"},
		{"template includes a template", "vorlage-a", "vorlage-b", "in-3", "rejected"},
		{"template includes itself", "vorlage-a", "vorlage-a", "in-4", "rejected"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := applyMaster(t, s, testUser, masterMut(sync.OpInsert, "template_includes",
				"inc-"+tt.mutationID, tt.mutationID,
				map[string]any{"template_id": tt.parent, "included_template_id": tt.child},
				"0000000002000-0000-aaaaaaaa"))
			if res.Outcome != tt.want {
				t.Errorf("outcome = %q, want %q", res.Outcome, tt.want)
			}
		})
	}
}

// FR-27.7: a position can carry preparation tasks, which instantiate as
// FR-7.3 todos. Deleting the template must tombstone the whole composition
// — positions, their tasks, and the group includes on either side.
func TestApplyMasterMutation_TemplateDeleteTombstonesComposition(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-k', 'Kamera')`)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "vorlage", "cp-1",
		map[string]any{"name": "Sommer", "kind": "template"}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "gruppe", "cp-2",
		map[string]any{"name": "Makro", "kind": "group"}, "0000000001001-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "template_includes", "inc-1", "cp-3",
		map[string]any{"template_id": "vorlage", "included_template_id": "gruppe"},
		"0000000001002-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "template_items", "pos-1", "cp-4",
		map[string]any{"template_id": "gruppe", "item_id": "item-k", "quantity": 1},
		"0000000001003-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "template_item_tasks", "task-1", "cp-5",
		map[string]any{"template_item_id": "pos-1", "task": "Akkus laden"},
		"0000000001004-0000-aaaaaaaa"))

	if res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, "templates", "gruppe", "cp-6",
		nil, "0000000002000-0000-aaaaaaaa")); res.Outcome != "applied" {
		t.Fatalf("delete outcome = %q, want applied", res.Outcome)
	}

	for _, want := range []struct{ table, id string }{
		{"template_item_tasks", "task-1"},
		{"template_items", "pos-1"},
		{"template_includes", "inc-1"},
	} {
		var n int
		if err := s.db.QueryRow(`SELECT count(*) FROM change_log
			WHERE entity_table = ? AND entity_id = ? AND deleted = 1 AND trip_id IS NULL`,
			want.table, want.id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Errorf("%s/%s tombstones = %d, want 1", want.table, want.id, n)
		}
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
		map[string]any{"template_id": "tpl-ref", "item_id": "item-ref", "quantity": 1},
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
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "tags", "cat-v", "pv-1",
		map[string]any{"name": "Kleidung"}, hlc))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "templates", "tpl-andy", "pv-2",
		map[string]any{"name": "Andys Basis"}, hlc))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "trips", "trip-v", "pv-4",
		map[string]any{"name": "Nur Andy", "year": 2026, "end_date": "2026-08-01"}, hlc))

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

	// Templates follow master items: instance-wide (FR-1.6 MVP). Trips stay
	// membership-gated (FR-4.5) — that is the visibility line that remains.
	gotB := pull(testUserB)
	for id, want := range map[string]bool{
		"tags/cat-v":         true,
		"templates/tpl-andy": true,
		"trips/trip-v":       false,
	} {
		if gotB[id] != want {
			t.Errorf("user B sees %s = %v, want %v", id, gotB[id], want)
		}
	}

	gotA := pull(testUser)
	for _, id := range []string{"tags/cat-v", "templates/tpl-andy", "trips/trip-v"} {
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
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "tags", "cat-x", "px-2",
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
		if c.Table == "tags" {
			t.Error("trip pull leaked master partition change")
		}
	}
}

// FR-27.7: deleting a position must tombstone its preparation tasks.
// The FK cascade removes the rows silently, so only the change log can
// tell clients about them — same rule as the series cascade.
func TestApplyMasterMutation_TemplateItemDeleteTombstonesTasks(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-tt', 'Socken')`)
	mustExec(t, s, `INSERT INTO templates (id, owner_id, name) VALUES ('tpl-tt', ?, 'Sommer')`, testUser)
	mustExec(t, s, `INSERT INTO template_items (id, template_id, item_id) VALUES ('ti-tt', 'tpl-tt', 'item-tt')`)
	mustExec(t, s, `INSERT INTO template_item_tasks (id, template_item_id, task) VALUES ('task-tt', 'ti-tt', 'waschen')`)

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, "template_items", "ti-tt", "mm-ti-del", nil,
		"0000000003000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("outcome = %q, want applied", res.Outcome)
	}

	page, err := s.PullMaster(context.Background(), testUser, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	var taskTombstone bool
	for _, c := range page.Changes {
		if c.Table == "template_item_tasks" && c.ID == "task-tt" && c.Deleted {
			taskTombstone = true
		}
	}
	if !taskTombstone {
		t.Error("deleting the position must tombstone its task for clients")
	}
}

// FR-27.1: only a Ferien-Vorlage may include, only a Gruppe may be
// included, and both ends must exist — malformed shapes are rejected
// cleanly rather than left to the FK.
func TestApplyMasterMutation_IncludeEnforcesTwoLevelRule(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO templates (id, owner_id, name, kind) VALUES ('tpl-fer', ?, 'Ferien', 'template')`, testUser)
	mustExec(t, s, `INSERT INTO templates (id, owner_id, name, kind) VALUES ('tpl-grp', ?, 'Hygiene', 'group')`, testUser)

	tests := []struct {
		name    string
		fields  map[string]any
		outcome string
	}{
		{"template includes group", map[string]any{"template_id": "tpl-fer", "included_template_id": "tpl-grp"}, "applied"},
		{"missing parent field", map[string]any{"included_template_id": "tpl-grp"}, "rejected"},
		{"missing child field", map[string]any{"template_id": "tpl-fer"}, "rejected"},
		{"unknown parent", map[string]any{"template_id": "tpl-ghost", "included_template_id": "tpl-grp"}, "rejected"},
		{"unknown child", map[string]any{"template_id": "tpl-fer", "included_template_id": "tpl-ghost"}, "rejected"},
		{"group as parent", map[string]any{"template_id": "tpl-grp", "included_template_id": "tpl-grp"}, "rejected"},
		{"template as child", map[string]any{"template_id": "tpl-fer", "included_template_id": "tpl-fer"}, "rejected"},
	}
	for i, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := masterMut(sync.OpInsert, "template_includes", fmt.Sprintf("inc-%d", i),
				fmt.Sprintf("mm-inc-%d", i), tt.fields, fmt.Sprintf("000000000400%d-0000-aaaaaaaa", i))
			res := applyMaster(t, s, testUser, m)
			if res.Outcome != tt.outcome {
				t.Errorf("outcome = %q, want %q", res.Outcome, tt.outcome)
			}
		})
	}
}

// Pull pagination (§4): a page smaller than the backlog reports has_more
// with a resumable cursor, and an empty page leaves the cursor where it was.
func TestPullMaster_PaginationSignalsHasMore(t *testing.T) {
	s := openTestStore(t)
	for i := range 3 {
		applyMaster(t, s, testUser, masterMut(sync.OpInsert, "tags", fmt.Sprintf("cat-p%d", i),
			fmt.Sprintf("mm-page-%d", i), map[string]any{"name": fmt.Sprintf("Kat %d", i)},
			fmt.Sprintf("000000000500%d-0000-aaaaaaaa", i)))
	}
	ctx := context.Background()

	page1, err := s.PullMaster(ctx, testUser, 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !page1.HasMore || len(page1.Changes) != 2 {
		t.Fatalf("page 1: has_more=%v changes=%d, want true/2", page1.HasMore, len(page1.Changes))
	}

	page2, err := s.PullMaster(ctx, testUser, page1.NextCursor, 2)
	if err != nil {
		t.Fatal(err)
	}
	if page2.HasMore || len(page2.Changes) != 1 {
		t.Fatalf("page 2: has_more=%v changes=%d, want false/1", page2.HasMore, len(page2.Changes))
	}

	// Fully caught up: the cursor must hold its position, not reset.
	page3, err := s.PullMaster(ctx, testUser, page2.NextCursor, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(page3.Changes) != 0 || page3.NextCursor != page2.NextCursor {
		t.Errorf("page 3: changes=%d cursor=%d, want 0 and cursor unchanged (%d)",
			len(page3.Changes), page3.NextCursor, page2.NextCursor)
	}
}
