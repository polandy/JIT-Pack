package sync

import (
	"reflect"
	"testing"
)

// The merge algorithm is specified in Sync-API Spec §6 and NFR-4.2a:
//   rule 1: additive operations (feedback flags set to true) always apply
//   rule 2: terminal states beat transient states regardless of HLC
//   rule 3: otherwise field-level last-write-wins by HLC
// packed_count and state form one causally coupled field group (FR-5.4).

const (
	olderHLC = HLC("0000000001000-0000-aaaaaaaa")
	rowHLC   = HLC("0000000002000-0000-bbbbbbbb")
	newerHLC = HLC("0000000003000-0000-cccccccc")
)

func packedItem() map[string]any {
	return map[string]any{
		"name": "Unterhosen", "quantity": 5, "packed_count": 5,
		"state": "packed", "flag_missing": 0,
	}
}

func openItem() map[string]any {
	return map[string]any{
		"name": "Unterhosen", "quantity": 5, "packed_count": 0,
		"state": "open", "flag_missing": 0,
	}
}

func TestMerge_NewerFieldWins_LWW(t *testing.T) {
	m := Mutation{Op: OpUpsert, Fields: map[string]any{"quantity": 6}, HLC: newerHLC}

	res := Merge(rowAt(openItem(), rowHLC), m)

	if res.Outcome != OutcomeApplied {
		t.Fatalf("outcome = %q, want %q (conflicts: %v)", res.Outcome, OutcomeApplied, res.Conflicts)
	}
	if got := res.Applied["quantity"]; got != 6 {
		t.Errorf("applied quantity = %v, want 6", got)
	}
}

func TestMerge_OlderFieldDropped_WithConflictLogged(t *testing.T) {
	m := Mutation{Op: OpUpsert, Fields: map[string]any{"quantity": 9}, HLC: olderHLC}

	res := Merge(rowAt(openItem(), rowHLC), m)

	if res.Outcome != OutcomeMerged {
		t.Fatalf("outcome = %q, want %q", res.Outcome, OutcomeMerged)
	}
	if len(res.Applied) != 0 {
		t.Errorf("applied = %v, want empty", res.Applied)
	}
	want := []Conflict{{Field: "quantity", LosingValue: 9, WinningValue: 5}}
	if !reflect.DeepEqual(res.Conflicts, want) {
		t.Errorf("conflicts = %v, want %v", res.Conflicts, want)
	}
}

// NFR-4.2a rule 1: a Missing flag raised offline during the trip must
// never be lost, even if another device wrote the row later (FR-9.1).
func TestMerge_MissingFlagTrue_AppliedDespiteOlderHLC(t *testing.T) {
	m := Mutation{Op: OpUpsert, Fields: map[string]any{"flag_missing": 1}, HLC: olderHLC}

	res := Merge(rowAt(openItem(), rowHLC), m)

	if got := res.Applied["flag_missing"]; got != 1 {
		t.Errorf("applied flag_missing = %v, want 1", got)
	}
	if len(res.Conflicts) != 0 {
		t.Errorf("conflicts = %v, want none", res.Conflicts)
	}
}

// NFR-4.2a rule 2: Packed is terminal and beats Packing Now even when the
// Packing Now mutation carries the newer HLC (FR-5.3).
func TestMerge_PackingNowOnPackedItem_DroppedRegardlessOfHLC(t *testing.T) {
	m := Mutation{
		Op:     OpUpsert,
		Fields: map[string]any{"state": "packing_now", "packing_now_by": "user-x"},
		HLC:    newerHLC,
	}

	res := Merge(rowAt(packedItem(), rowHLC), m)

	if res.Outcome != OutcomeMerged {
		t.Fatalf("outcome = %q, want %q", res.Outcome, OutcomeMerged)
	}
	if _, ok := res.Applied["state"]; ok {
		t.Error("state must not be applied when item is already packed")
	}
	if !hasConflictFor(res.Conflicts, "state") {
		t.Errorf("expected a conflict entry for state, got %v", res.Conflicts)
	}
}

func TestMerge_PackedBeatsPackingNow_RegardlessOfHLC(t *testing.T) {
	current := openItem()
	current["state"] = "packing_now"
	m := Mutation{
		Op:     OpUpsert,
		Fields: map[string]any{"state": "packed", "packed_count": 5},
		HLC:    olderHLC,
	}

	res := Merge(rowAt(current, rowHLC), m)

	if got := res.Applied["state"]; got != "packed" {
		t.Errorf("applied state = %v, want packed", got)
	}
	if got := res.Applied["packed_count"]; got != 5 {
		t.Errorf("applied packed_count = %v, want 5", got)
	}
}

// FR-5.4: packed_count and state are causally coupled and merge as a unit —
// dropping one must drop the other, otherwise 3/5 could pair with "open".
func TestMerge_PackedCountAndState_DropAsOneUnit(t *testing.T) {
	m := Mutation{
		Op:     nOp(),
		Fields: map[string]any{"state": "partial", "packed_count": 3, "name": "Socken"},
		HLC:    olderHLC,
	}

	res := Merge(rowAt(openItem(), rowHLC), m)

	if _, ok := res.Applied["packed_count"]; ok {
		t.Error("packed_count applied although its group was dropped")
	}
	if _, ok := res.Applied["state"]; ok {
		t.Error("state applied although its group was dropped")
	}
	if !hasConflictFor(res.Conflicts, "state") || !hasConflictFor(res.Conflicts, "packed_count") {
		t.Errorf("expected conflicts for both group fields, got %v", res.Conflicts)
	}
	if !hasConflictFor(res.Conflicts, "name") {
		t.Errorf("independent field name should conflict separately, got %v", res.Conflicts)
	}
}

func TestMerge_Delete_AppliedOnlyWithNewerHLC(t *testing.T) {
	cases := []struct {
		name        string
		hlc         HLC
		wantDeleted bool
		wantOutcome Outcome
	}{
		{"newer delete wins", newerHLC, true, OutcomeApplied},
		{"older delete is a no-op", olderHLC, false, OutcomeMerged},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := Merge(rowAt(openItem(), rowHLC), Mutation{Op: OpDelete, HLC: tc.hlc})
			if res.Deleted != tc.wantDeleted || res.Outcome != tc.wantOutcome {
				t.Errorf("got (deleted=%v, outcome=%q), want (%v, %q)",
					res.Deleted, res.Outcome, tc.wantDeleted, tc.wantOutcome)
			}
		})
	}
}

func TestMerge_InsertOnUnknownID_AppliesWholeRow(t *testing.T) {
	fields := map[string]any{"name": "Ventil", "body": "prüfen", "is_task": 1, "task_state": "open"}
	m := Mutation{Op: OpInsert, Fields: fields, HLC: olderHLC}

	res := Merge(Row{}, m)

	if res.Outcome != OutcomeApplied {
		t.Fatalf("outcome = %q, want %q", res.Outcome, OutcomeApplied)
	}
	if !reflect.DeepEqual(res.Applied, fields) {
		t.Errorf("applied = %v, want %v", res.Applied, fields)
	}
}

func TestMerge_RowHLCAdvancesToMaxObserved(t *testing.T) {
	cases := []struct {
		name string
		hlc  HLC
		want HLC
	}{
		{"newer mutation raises row HLC", newerHLC, newerHLC},
		{"older mutation keeps row HLC", olderHLC, rowHLC},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := Merge(rowAt(openItem(), rowHLC), Mutation{Op: OpUpsert, Fields: map[string]any{"quantity": 7}, HLC: tc.hlc})
			if res.RowHLC != tc.want {
				t.Errorf("RowHLC = %q, want %q", res.RowHLC, tc.want)
			}
		})
	}
}

func hasConflictFor(conflicts []Conflict, field string) bool {
	for _, c := range conflicts {
		if c.Field == field {
			return true
		}
	}
	return false
}

func nOp() Op { return OpUpsert }

// rowAt is a row whose fields carry no clocks of their own, so every
// field is as old as the row — the shape of a row written before the
// per-field record existed.
func rowAt(fields map[string]any, hlc HLC) Row {
	return Row{Exists: true, Fields: fields, HLC: hlc}
}

// rowWith is a row with an explicit per-field record; HLC is their maximum.
func rowWith(fields map[string]any, clocks FieldClocks) Row {
	var top HLC
	for _, c := range clocks {
		top = maxHLC(top, c)
	}
	return Row{Exists: true, Fields: fields, HLC: top, Clocks: clocks}
}

// NFR-4.2a is *field*-level LWW: two fields that never competed must not
// decide each other. The row's own HLC is newer than the incoming pack only
// because somebody assigned a container in between.
func TestMerge_UnrelatedNewerField_DoesNotDisplaceOlderPack(t *testing.T) {
	current := openItem()
	current["container_id"] = "bag-1"
	row := rowWith(current, FieldClocks{
		"state": olderHLC, "packed_count": olderHLC, "container_id": newerHLC,
	})
	m := Mutation{Op: OpUpsert, Fields: map[string]any{"state": "packed", "packed_count": 5}, HLC: rowHLC}

	res := Merge(row, m)

	if res.Outcome != OutcomeApplied {
		t.Fatalf("outcome = %q, want applied; conflicts = %v", res.Outcome, res.Conflicts)
	}
	if res.Applied["state"] != "packed" || res.Applied["packed_count"] != 5 {
		t.Errorf("applied = %v, want the pack", res.Applied)
	}
	if res.Clocks["container_id"] != newerHLC {
		t.Errorf("container clock = %q, must be untouched", res.Clocks["container_id"])
	}
}

// Rule 2 is exactly as narrow as §6 writes it. A pack made offline and
// pushed late does not undo a later deliberate unpack or skip: the later
// human decision stands, and the pack is logged so its author can be told.
func TestMerge_StalePacked_LosesToLaterStateDecision_AndIsLogged(t *testing.T) {
	for _, later := range []string{"open", "partial", "skipped"} {
		t.Run("later "+later, func(t *testing.T) {
			current := openItem()
			current["state"] = later
			row := rowWith(current, FieldClocks{"state": newerHLC, "packed_count": newerHLC})
			m := Mutation{Op: OpUpsert, Fields: map[string]any{"state": "packed", "packed_count": 5}, HLC: olderHLC}

			res := Merge(row, m)

			if res.Outcome != OutcomeMerged {
				t.Fatalf("outcome = %q, want merged", res.Outcome)
			}
			if _, ok := res.Applied["state"]; ok {
				t.Error("stale pack must not overwrite the later decision")
			}
			if !hasConflictFor(res.Conflicts, "state") || !hasConflictFor(res.Conflicts, "packed_count") {
				t.Errorf("the dropped pack must be logged as a conflict, got %v", res.Conflicts)
			}
		})
	}
}

// The state group has one clock — the newest of its two fields — because
// a partial count and the state are one fact (FR-5.4).
func TestMerge_StateGroupClock_IsNewestOfItsFields(t *testing.T) {
	row := rowWith(openItem(), FieldClocks{"state": olderHLC, "packed_count": newerHLC})
	m := Mutation{Op: OpUpsert, Fields: map[string]any{"state": "partial", "packed_count": 2}, HLC: rowHLC}

	res := Merge(row, m)

	if res.Outcome != OutcomeMerged {
		t.Fatalf("outcome = %q, want merged: packed_count was written later than the mutation", res.Outcome)
	}
}

// A field with no clock of its own is as old as the row — not older, not
// newer. That is the only safe reading of a row written before per-field
// clocks existed.
func TestMerge_FieldWithoutClock_FallsBackToRowHLC(t *testing.T) {
	row := Row{Exists: true, Fields: openItem(), HLC: rowHLC, Clocks: FieldClocks{"name": olderHLC}}
	cases := []struct {
		name string
		hlc  HLC
		want Outcome
	}{
		{"newer than the row applies", newerHLC, OutcomeApplied},
		{"older than the row is dropped", olderHLC, OutcomeMerged},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := Merge(row, Mutation{Op: OpUpsert, Fields: map[string]any{"quantity": 7}, HLC: tc.hlc})
			if res.Outcome != tc.want {
				t.Errorf("outcome = %q, want %q", res.Outcome, tc.want)
			}
		})
	}
}

// What the caller persists beside the row: applied fields take the
// mutation's clock, dropped fields keep theirs, an insert stamps every field.
func TestMerge_ResultClocks_StampAppliedFieldsOnly(t *testing.T) {
	t.Run("upsert", func(t *testing.T) {
		row := rowWith(openItem(), FieldClocks{"name": olderHLC, "quantity": newerHLC})
		m := Mutation{Op: OpUpsert, Fields: map[string]any{"name": "Socken", "quantity": 9}, HLC: rowHLC}

		res := Merge(row, m)

		want := FieldClocks{"name": rowHLC, "quantity": newerHLC}
		if !reflect.DeepEqual(res.Clocks, want) {
			t.Errorf("clocks = %v, want %v", res.Clocks, want)
		}
	})
	t.Run("insert", func(t *testing.T) {
		m := Mutation{Op: OpInsert, Fields: map[string]any{"name": "Ventil", "quantity": 1}, HLC: olderHLC}

		res := Merge(Row{}, m)

		want := FieldClocks{"name": olderHLC, "quantity": olderHLC}
		if !reflect.DeepEqual(res.Clocks, want) {
			t.Errorf("clocks = %v, want %v", res.Clocks, want)
		}
	})
	t.Run("input clocks are not mutated", func(t *testing.T) {
		clocks := FieldClocks{"name": olderHLC}
		Merge(rowWith(openItem(), clocks), Mutation{Op: OpUpsert, Fields: map[string]any{"name": "x"}, HLC: newerHLC})
		if clocks["name"] != olderHLC {
			t.Error("Merge wrote into the caller's clock map")
		}
	})
}

// FR-5.4: state and packed_count are one fact, so anything re-issuing a
// single logged field has to be told what travels with it.
func TestGroupedWith_CoupledFieldsTravelTogether(t *testing.T) {
	cases := []struct {
		field string
		want  []string
	}{
		{"state", []string{"packed_count", "state"}},
		{"packed_count", []string{"packed_count", "state"}},
		{"name", []string{"name"}},
		{"container_id", []string{"container_id"}},
	}
	for _, tc := range cases {
		t.Run(tc.field, func(t *testing.T) {
			if got := GroupedWith(tc.field); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("GroupedWith(%q) = %v, want %v", tc.field, got, tc.want)
			}
		})
	}
}

// A conflict entry is a record of a value that was *overwritten*
// (NFR-4.2a). A field the losing push carried unchanged overwrote
// nothing, so it is not one — it would otherwise fill the log with
// "2026 → 2026" rows, each offering a revert that restores what is
// already there.
func TestMerge_UnchangedFieldCarriedAlong_IsNotAConflict(t *testing.T) {
	m := Mutation{
		Op:     OpUpsert,
		Fields: map[string]any{"quantity": 9, "name": "Unterhosen"},
		HLC:    olderHLC,
	}

	res := Merge(rowAt(openItem(), rowHLC), m)

	if !hasConflictFor(res.Conflicts, "quantity") {
		t.Errorf("the changed field must still conflict, got %v", res.Conflicts)
	}
	if hasConflictFor(res.Conflicts, "name") {
		t.Errorf("name was carried along unchanged and overwrote nothing, got %v", res.Conflicts)
	}
}

// The outcome follows from the same rule: a push that lost every field it
// carried, but changed none of them, has nothing to announce. Without
// this the client's merge toast (Sync-API §5) reports overwritten fields
// to a user whose data was never touched.
func TestMerge_LosingPushThatChangedNothing_IsApplied(t *testing.T) {
	m := Mutation{
		Op:     OpUpsert,
		Fields: map[string]any{"name": "Unterhosen", "quantity": 5},
		HLC:    olderHLC,
	}

	res := Merge(rowAt(openItem(), rowHLC), m)

	if res.Outcome != OutcomeApplied {
		t.Errorf("outcome = %q, want %q (conflicts: %v)", res.Outcome, OutcomeApplied, res.Conflicts)
	}
	if len(res.Conflicts) != 0 {
		t.Errorf("conflicts = %v, want none", res.Conflicts)
	}
}

// The coupled group is dropped as a unit by rule 2, but "dropped" and
// "overwritten" are still two different things (FR-5.4).
func TestMerge_UnchangedStateGroup_IsNotAConflict(t *testing.T) {
	m := Mutation{
		Op:     OpUpsert,
		Fields: map[string]any{"state": "packed", "packed_count": 5},
		HLC:    olderHLC,
	}

	res := Merge(rowAt(packedItem(), rowHLC), m)

	if len(res.Conflicts) != 0 {
		t.Errorf("conflicts = %v, want none: the group already holds these values", res.Conflicts)
	}
}

// The values being compared come from two different worlds: the mutation's
// are decoded from JSON (float64, bool), the row's from SQLite (int64, and
// 0/1 for booleans). Comparing them with == would call every one of these
// pairs a conflict, which is the defect this exists to prevent.
func TestSameValue_ComparesAcrossTheJSONAndSQLiteTypes(t *testing.T) {
	cases := []struct {
		name string
		a, b any
		want bool
	}{
		{"json number against sqlite integer", float64(2026), int64(2026), true},
		{"json number against a plain int", float64(5), 5, true},
		{"different numbers", float64(6), int64(3), false},
		{"json true against sqlite 1", true, int64(1), true},
		{"json false against sqlite 0", false, int64(0), true},
		{"json false against sqlite 1", false, int64(1), false},
		{"equal strings", "Zelt", "Zelt", true},
		{"different strings", "Zelt", "Zelt (gross)", false},
		{"both null", nil, nil, true},
		{"null against a value", nil, "2026-07-25", false},
		{"a string is never its numeric twin", "5", int64(5), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := sameValue(tc.a, tc.b); got != tc.want {
				t.Errorf("sameValue(%#v, %#v) = %v, want %v", tc.a, tc.b, got, tc.want)
			}
			if got := sameValue(tc.b, tc.a); got != tc.want {
				t.Errorf("sameValue is not symmetric: (%#v, %#v) = %v, want %v", tc.b, tc.a, got, tc.want)
			}
		})
	}
}
