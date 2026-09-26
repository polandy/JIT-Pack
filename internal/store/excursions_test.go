package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// FR-31.1/31.4 through the push path: an excursion and its lines travel the
// trip partition, and a line's own tick merges like any trip row's field
// (NFR-4.2a) — it is not the suitcase row's tick (ADR-077).
func TestApplyMutation_Excursion_InsertLineThenTickIt_FR31_4(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name, packed_count, state)
	                VALUES ('ti-1', ?, 'Trinkflasche', 1, 'packed')`, testTrip)

	for _, m := range []sync.Mutation{
		{
			MutationID: "m1", Op: sync.OpInsert, Table: TableExcursions, ID: "ex-1",
			Fields: map[string]any{"trip_id": testTrip, "name": "Tageswanderung", "starts_on": "2026-07-14", "ends_on": "2026-07-14"},
			HLC:    sync.HLC("0000000001000-0000-aaaaaaaa"),
		},
		{
			MutationID: "m2", Op: sync.OpInsert, Table: TableExcursionItems, ID: "exi-1",
			Fields: map[string]any{
				"trip_id": testTrip, "excursion_id": "ex-1", "trip_item_id": "ti-1",
				"name": "Trinkflasche", "quantity": 1, "packed_count": 0, "state": "open",
				"mode": "pack", "not_in_luggage": 0, "for_all_participants": 0,
			},
			HLC: sync.HLC("0000000001001-0000-aaaaaaaa"),
		},
	} {
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, m); err != nil || res.Outcome != sync.OutcomeApplied {
			t.Fatalf("%s: outcome %q reason %q err %v, want applied", m.Table, res.Outcome, res.Reason, err)
		}
	}

	tick := upsert("exi-1", "m3", map[string]any{"packed_count": 1, "state": "packed"}, "0000000002000-0000-aaaaaaaa")
	tick.Table = TableExcursionItems
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, tick); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("tick: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}

	var state string
	if err := s.db.QueryRow(`SELECT state FROM excursion_items WHERE id = 'exi-1'`).Scan(&state); err != nil {
		t.Fatalf("read line: %v", err)
	}
	if state != "packed" {
		t.Errorf("line state = %q, want packed", state)
	}
}

// FR-31.4: a suitcase row taken off the trip leaves the excursion's line in
// place, unlinked — the hike still needs the thing. The server clears the
// link in the engine (ON DELETE SET NULL) and writes no change for it, so a
// device that still holds the old id reads a link to a row it no longer has,
// which the client treats as no link at all.
func TestApplyMutation_DeletingATripItemUnlinksItsExcursionLine_FR31_4(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name) VALUES ('ti-1', ?, 'Stirnlampe')`, testTrip)
	mustExec(t, s, `INSERT INTO excursions (id, trip_id, name) VALUES ('ex-1', ?, 'Hüttentour')`, testTrip)
	mustExec(t, s, `INSERT INTO excursion_items (id, trip_id, excursion_id, trip_item_id, name)
	                VALUES ('exi-1', ?, 'ex-1', 'ti-1', 'Stirnlampe')`, testTrip)

	del := sync.Mutation{
		MutationID: "m-del", Op: sync.OpDelete, Table: TableTripItems, ID: "ti-1",
		HLC: sync.HLC("0000000009100-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete trip item: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}

	var link *string
	if err := s.db.QueryRow(`SELECT trip_item_id FROM excursion_items WHERE id = 'exi-1'`).Scan(&link); err != nil {
		t.Fatalf("the line did not survive its suitcase row: %v", err)
	}
	if link != nil {
		t.Errorf("trip_item_id = %q after the suitcase row's delete, want NULL", *link)
	}
}

// FR-31.3/31.5: a traveller taken off the trip is off its excursions, with
// their own lines there — and every device hears it, because the cascade
// tombstones each row the engine deletes.
func TestApplyMutation_DeletingATravelerTombstonesTheirExcursionRows_FR31_5(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO travelers (id, trip_id, name) VALUES ('tr-sia', ?, 'Sia')`, testTrip)
	mustExec(t, s, `INSERT INTO excursions (id, trip_id, name) VALUES ('ex-1', ?, 'Hüttentour')`, testTrip)
	mustExec(t, s, `INSERT INTO excursion_travelers (id, trip_id, excursion_id, traveler_id)
	                VALUES ('ext-1', ?, 'ex-1', 'tr-sia')`, testTrip)
	mustExec(t, s, `INSERT INTO excursion_items (id, trip_id, excursion_id, name, assigned_traveler_id, for_all_participants)
	                VALUES ('exi-1', ?, 'ex-1', 'Hüttenschlafsack', 'tr-sia', 1)`, testTrip)

	before, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}
	del := sync.Mutation{
		MutationID: "m-del", Op: sync.OpDelete, Table: TableTravelers, ID: "tr-sia",
		HLC: sync.HLC("0000000009100-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete traveler: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}

	page, err := s.Pull(ctx, testTrip, before, 50)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	assertTombstoned(t, page, TableExcursionTravelers, "ext-1")
	assertTombstoned(t, page, TableExcursionItems, "exi-1")
}

// FR-31.1: deleting an excursion takes its participants and lines, each
// tombstoned so no device keeps a line of a list that is gone.
func TestApplyMutation_DeletingAnExcursionTombstonesItsRows_FR31_1(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO travelers (id, trip_id, name) VALUES ('tr-sia', ?, 'Sia')`, testTrip)
	mustExec(t, s, `INSERT INTO excursions (id, trip_id, name) VALUES ('ex-1', ?, 'Hüttentour')`, testTrip)
	mustExec(t, s, `INSERT INTO excursion_travelers (id, trip_id, excursion_id, traveler_id)
	                VALUES ('ext-1', ?, 'ex-1', 'tr-sia')`, testTrip)
	mustExec(t, s, `INSERT INTO excursion_items (id, trip_id, excursion_id, name)
	                VALUES ('exi-1', ?, 'ex-1', 'Proviant')`, testTrip)

	before, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}
	del := sync.Mutation{
		MutationID: "m-del", Op: sync.OpDelete, Table: TableExcursions, ID: "ex-1",
		HLC: sync.HLC("0000000009100-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("delete excursion: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}

	page, err := s.Pull(ctx, testTrip, before, 50)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	assertTombstoned(t, page, TableExcursionTravelers, "ext-1")
	assertTombstoned(t, page, TableExcursionItems, "exi-1")
}

// FR-31.4/31.8: the vocabulary a line may carry. `packing_now` is M4's claim
// and an excursion line has none (FR-31.6's lean list); `buy_before` would be
// a purchase before departure, which an excursion's own line never is.
func TestSchema_ExcursionLineVocabulary_FR31_4(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO excursions (id, trip_id, name) VALUES ('ex-1', ?, 'Hüttentour')`, testTrip)
	cases := []struct {
		name, column, value string
		ok                  bool
	}{
		{"packed state", "state", "packed", true},
		{"no packing-now claim", "state", "packing_now", false},
		{"vor Ort", "mode", "buy_local", true},
		{"no purchase before departure", "mode", "buy_before", false},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := s.db.Exec(`INSERT INTO excursion_items (id, trip_id, excursion_id, name, `+tc.column+`)
			                     VALUES (?, ?, 'ex-1', 'x', ?)`, "exi-v"+string(rune('a'+i)), testTrip, tc.value)
			if (err == nil) != tc.ok {
				t.Errorf("%s = %q: err %v, want accepted %v", tc.column, tc.value, err, tc.ok)
			}
		})
	}
}
