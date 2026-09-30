package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"jitpack/internal/sync"
)

func tripActivity(t *testing.T, s *Store, tripID string) []ActivityEntry {
	t.Helper()
	entries, err := s.TripActivity(context.Background(), tripID, 0, 0)
	if err != nil {
		t.Fatalf("TripActivity: %v", err)
	}
	return entries
}

func inventoryActivity(t *testing.T, s *Store, userID string) []ActivityEntry {
	t.Helper()
	entries, err := s.InventoryActivity(context.Background(), userID, 0, 0)
	if err != nil {
		t.Fatalf("InventoryActivity: %v", err)
	}
	return entries
}

func changesOf(t *testing.T, e ActivityEntry) map[string][2]any {
	t.Helper()
	out := map[string][2]any{}
	if err := json.Unmarshal(e.Changes, &out); err != nil {
		t.Fatalf("changes %s: %v", e.Changes, err)
	}
	return out
}

func tripItemInsert(id, mutationID, name, hlc string) sync.Mutation {
	return sync.Mutation{
		MutationID: mutationID, Op: sync.OpInsert, Table: TableTripItems, ID: id,
		Fields: map[string]any{"trip_id": testTrip, "name": name, "quantity": 1},
		HLC:    sync.HLC(hlc),
	}
}

// FR-32.1: an applied write is recorded under the trip, attributed to the
// pusher, with the row's name and each field's before and after.
func TestActivity_TripWrite_RecordsActorLabelAndChanges_FR32_1(t *testing.T) {
	s := openTestStore(t)
	s.mustApply(t, testTrip, tripItemInsert("ti-1", "m-1", "Zahnbürste", "0000000001000-0000-aaaaaaaa"))
	s.mustApply(t, testTrip, upsert("ti-1", "m-2",
		map[string]any{"state": "packed", "packed_count": 1, "name": "Zahnbürste"}, "0000000001001-0000-aaaaaaaa"))

	entries := tripActivity(t, s, testTrip)
	if len(entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(entries))
	}
	update, insert := entries[0], entries[1]

	if insert.Op != ActivityInsert || insert.Label != "Zahnbürste" || insert.ActorUserID != testUser {
		t.Errorf("insert entry = %+v", insert)
	}
	if got := changesOf(t, insert)["name"]; got[0] != nil || got[1] != "Zahnbürste" {
		t.Errorf("insert name change = %v, want [nil Zahnbürste]", got)
	}

	if update.Op != ActivityUpdate || update.EntityID != "ti-1" || update.EntityTable != TableTripItems {
		t.Errorf("update entry = %+v", update)
	}
	changes := changesOf(t, update)
	if got := changes["state"]; got[0] != "open" || got[1] != "packed" {
		t.Errorf("state change = %v, want [open packed]", got)
	}
	if _, resent := changes["name"]; resent {
		t.Error("the unchanged, re-sent name is recorded as a change")
	}
}

// A write that changes nothing a reader could see records nothing: the same
// value re-sent, a merge the row's newer clock outranked, a replay of a
// mutation already applied, a refusal.
func TestActivity_WritesThatChangeNothing_RecordNothing_FR32_1(t *testing.T) {
	cases := []struct {
		name  string
		write sync.Mutation
	}{
		{"the same value re-sent", upsert("ti-1", "m-2", map[string]any{"quantity": 1}, "0000000002000-0000-aaaaaaaa")},
		{"a stale write the merge drops", upsert("ti-1", "m-2", map[string]any{"quantity": 7}, "0000000000500-0000-aaaaaaaa")},
		{"a replay of the first mutation", tripItemInsert("ti-1", "m-1", "Zahnbürste", "0000000001000-0000-aaaaaaaa")},
		{"a refused write", upsert("ti-other", "m-2", map[string]any{"trip_id": "trip-elsewhere", "name": "X"}, "0000000002000-0000-aaaaaaaa")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := openTestStore(t)
			s.mustApply(t, testTrip, tripItemInsert("ti-1", "m-1", "Zahnbürste", "0000000001000-0000-aaaaaaaa"))
			s.mustApply(t, testTrip, tc.write)
			if n := len(tripActivity(t, s, testTrip)); n != 1 {
				t.Errorf("entries = %d, want only the insert", n)
			}
		})
	}
}

// A delete names the row as it was and keeps what it held — the row is
// gone, and the entry is the only record of it left.
func TestActivity_Delete_NamesTheRowAsItWas_FR32_1(t *testing.T) {
	s := openTestStore(t)
	s.mustApply(t, testTrip, tripItemInsert("ti-1", "m-1", "Sonnencreme", "0000000001000-0000-aaaaaaaa"))
	s.mustApply(t, testTrip, sync.Mutation{
		MutationID: "m-2", Op: sync.OpDelete, Table: TableTripItems, ID: "ti-1", HLC: "0000000001001-0000-aaaaaaaa",
	})

	got := tripActivity(t, s, testTrip)[0]
	if got.Op != ActivityDelete || got.Label != "Sonnencreme" {
		t.Errorf("delete entry = %+v, want op delete labelled Sonnencreme", got)
	}
	if c := changesOf(t, got)["quantity"]; c[0] != float64(1) || c[1] != nil {
		t.Errorf("delete's quantity = %v, want [1 nil] — what the row held", c)
	}
}

// The subject is what the row belongs to, read through its foreign key; a
// name held by a row the entry only points at is read the same way.
func TestActivity_SubjectAndLabelThroughAForeignKey_FR32_1(t *testing.T) {
	s := openTestStore(t)
	s.mustApply(t, testTrip, sync.Mutation{
		MutationID: "m-1", Op: sync.OpInsert, Table: TableExcursions, ID: "ex-1",
		Fields: map[string]any{"trip_id": testTrip, "name": "Gletscherwanderung"}, HLC: "0000000001000-0000-aaaaaaaa",
	})
	s.mustApply(t, testTrip, sync.Mutation{
		MutationID: "m-2", Op: sync.OpInsert, Table: TableExcursionItems, ID: "exi-1",
		Fields: map[string]any{"trip_id": testTrip, "excursion_id": "ex-1", "name": "Steigeisen"},
		HLC:    "0000000001001-0000-aaaaaaaa",
	})

	got := tripActivity(t, s, testTrip)[0]
	if got.Label != "Steigeisen" || got.Subject != "Gletscherwanderung" {
		t.Errorf("entry = (%q, %q), want (Steigeisen, Gletscherwanderung)", got.Label, got.Subject)
	}
}

// A long note is named, not quoted.
func TestActivity_LongLabel_IsShortened_FR32_1(t *testing.T) {
	s := openTestStore(t)
	s.mustApply(t, testTrip, tripItemInsert("ti-1", "m-1", strings.Repeat("a", 300), "0000000001000-0000-aaaaaaaa"))

	label := tripActivity(t, s, testTrip)[0].Label
	if n := len([]rune(label)); n != maxLabelRunes || !strings.HasSuffix(label, "…") {
		t.Errorf("label has %d runes (%q…), want %d ending in an ellipsis", n, label[:10], maxLabelRunes)
	}
}

// A trip's own master-partition rows — its name and dates, its roster — are
// about the trip, so they are in its log and not in the inventory's.
func TestActivity_TripRowsOfTheMasterPartition_LandInTheTripsLog_FR32_1(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTrips, "trip-new", "m-1",
		map[string]any{"name": "Engadin", "year": 2026}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTrips, "trip-new", "m-2",
		map[string]any{"name": "Engadin 2026"}, "0000000001001-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTripMembers, "mem-b", "m-3",
		map[string]any{"trip_id": "trip-new", "user_id": testUserB, "role": RoleEditor}, "0000000001002-0000-aaaaaaaa"))

	entries := tripActivity(t, s, "trip-new")
	if len(entries) != 3 {
		t.Fatalf("trip entries = %d, want 3", len(entries))
	}
	if entries[0].EntityTable != TableTripMembers || entries[0].Label != "Berta" {
		t.Errorf("member entry = %+v, want trip_members labelled Berta", entries[0])
	}
	if entries[1].Label != "Engadin 2026" {
		t.Errorf("rename entry label = %q, want the new name", entries[1].Label)
	}
	if n := len(inventoryActivity(t, s, testUser)); n != 0 {
		t.Errorf("inventory entries = %d, want none", n)
	}
}

// A deleted trip takes its log with it, and its delete is recorded nowhere:
// the trip was the only place to read it.
func TestActivity_TripDelete_TakesTheLogAlong_FR32_1(t *testing.T) {
	s := openTestStore(t)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTrips, "trip-new", "m-1",
		map[string]any{"name": "Engadin", "year": 2026}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTrips, "trip-new", "m-2",
		nil, "0000000001001-0000-aaaaaaaa"))

	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM activity_log`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("activity rows = %d, want 0", n)
	}
}

// The inventory's log is read the way the master pull is: shared master data
// is everyone's, a series only its owner's.
func TestActivity_Inventory_FollowsMasterVisibility_FR32_1(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "it-1", "m-1",
		map[string]any{"name": "Stirnlampe"}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTripSeries, "ser-1", "m-2",
		map[string]any{"name": "Sommerferien"}, "0000000001001-0000-aaaaaaaa"))

	if got := inventoryActivity(t, s, testUser); len(got) != 2 {
		t.Errorf("owner reads %d entries, want 2", len(got))
	}
	got := inventoryActivity(t, s, testUserB)
	if len(got) != 1 || got[0].Label != "Stirnlampe" {
		t.Errorf("another account reads %+v, want only the item", got)
	}
}

// A page ends at its limit and the next one starts below its last id.
func TestActivity_Paging_ReadsOlderEntriesBelowTheCursor_FR32_1(t *testing.T) {
	s := openTestStore(t)
	for i := range 5 {
		s.mustApply(t, testTrip, tripItemInsert(fmt.Sprintf("ti-%d", i), fmt.Sprintf("m-%d", i),
			fmt.Sprintf("Ding %d", i), fmt.Sprintf("00000000010%02d-0000-aaaaaaaa", i)))
	}
	ctx := context.Background()
	first, err := s.TripActivity(ctx, testTrip, 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.TripActivity(ctx, testTrip, first[1].ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if first[0].Label != "Ding 4" || first[1].Label != "Ding 3" {
		t.Errorf("first page = %q, %q, want the newest two", first[0].Label, first[1].Label)
	}
	if len(second) != 3 || second[0].Label != "Ding 2" {
		t.Errorf("second page = %+v, want the three older ones", second)
	}
	if capped, _ := s.TripActivity(ctx, testTrip, 0, MaxActivityPage+1); len(capped) != 5 {
		t.Errorf("an oversized limit read %d entries, want all 5", len(capped))
	}
}

// The writes that bypass the push pipeline are attributed too: a revert, an
// item's photo, an idea's picture.
func TestActivity_SidePaths_AreRecordedWithTheirActor_FR32_1(t *testing.T) {
	ctx := context.Background()

	t.Run("a conflict revert", func(t *testing.T) {
		s := openTestStore(t)
		seedUserB(t, s)
		s.mustApply(t, testTrip, upsert("ti-1", "m-1", map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 5}, "0000000002000-0000-bbbbbbbb"))
		s.mustApply(t, testTrip, upsert("ti-1", "m-2", map[string]any{"quantity": 9}, "0000000001000-0000-aaaaaaaa"))
		var conflictID string
		if err := s.db.QueryRow(`SELECT id FROM conflict_log`).Scan(&conflictID); err != nil {
			t.Fatal(err)
		}
		if _, err := s.RevertTripConflict(ctx, testTrip, testUserB, conflictID); err != nil {
			t.Fatalf("revert: %v", err)
		}
		got := tripActivity(t, s, testTrip)[0]
		if got.ActorUserID != testUserB || changesOf(t, got)["quantity"][1] != float64(9) {
			t.Errorf("revert entry = %+v %s, want Berta setting quantity 9", got, got.Changes)
		}
	})

	t.Run("an item photo", func(t *testing.T) {
		s := openTestStore(t)
		applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "it-1", "m-1",
			map[string]any{"name": "Kamera"}, "0000000001000-0000-aaaaaaaa"))
		if _, err := s.SetItemImage(ctx, testUser, "it-1", []byte("\xff\xd8\xff\xe0jpeg")); err != nil {
			t.Fatal(err)
		}
		got := inventoryActivity(t, s, testUser)[0]
		if got.Label != "Kamera" || changesOf(t, got)[columnImageHash][1] == nil {
			t.Errorf("photo entry = %+v %s, want the item's image_hash set", got, got.Changes)
		}
	})

	t.Run("an idea picture", func(t *testing.T) {
		s := openPlannerStore(t)
		if _, err := s.AddIdeaImage(ctx, testTrip, testUser, "idea-1", "img-1", testJPEG); err != nil {
			t.Fatal(err)
		}
		got := tripActivity(t, s, testTrip)[0]
		if got.EntityTable != TableIdeaImages || got.Op != ActivityInsert || got.Label != "Schlucht Gola Gorropu" {
			t.Errorf("picture entry = %+v, want an idea_images insert named after its idea", got)
		}
	})
}

// Every name source points at a column that exists: a typo here would not
// fail a write, it would record an entry with no name.
func TestActivity_EveryLabelSourceNamesARealColumn_FR32_1(t *testing.T) {
	s := openTestStore(t)
	columnsOf := func(table string) map[string]bool {
		rows, err := s.db.Query(`SELECT name FROM pragma_table_info(?)`, table)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		out := map[string]bool{}
		for rows.Next() {
			var c string
			if err := rows.Scan(&c); err != nil {
				t.Fatal(err)
			}
			out[c] = true
		}
		return out
	}
	for table, spec := range tableSpecs {
		if len(spec.label.name) == 0 {
			t.Errorf("%s declares no name source", table)
		}
		own := columnsOf(table)
		for _, src := range append(append([]labelSource{}, spec.label.name...), spec.label.subject...) {
			if src.via == "" {
				if !own[src.column] {
					t.Errorf("%s: no column %q", table, src.column)
				}
				continue
			}
			if !own[src.via] {
				t.Errorf("%s: no foreign key column %q", table, src.via)
			}
			if !columnsOf(src.table)[src.column] {
				t.Errorf("%s: %s has no column %q", table, src.table, src.column)
			}
		}
	}
}
