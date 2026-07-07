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

	res := Merge(openItem(), rowHLC, true, m)

	if res.Outcome != OutcomeApplied {
		t.Fatalf("outcome = %q, want %q (conflicts: %v)", res.Outcome, OutcomeApplied, res.Conflicts)
	}
	if got := res.Applied["quantity"]; got != 6 {
		t.Errorf("applied quantity = %v, want 6", got)
	}
}

func TestMerge_OlderFieldDropped_WithConflictLogged(t *testing.T) {
	m := Mutation{Op: OpUpsert, Fields: map[string]any{"quantity": 9}, HLC: olderHLC}

	res := Merge(openItem(), rowHLC, true, m)

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

	res := Merge(openItem(), rowHLC, true, m)

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

	res := Merge(packedItem(), rowHLC, true, m)

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

func TestMerge_PackedAppliesOverPackingNow_EvenWithOlderHLC(t *testing.T) {
	current := openItem()
	current["state"] = "packing_now"
	m := Mutation{
		Op:     OpUpsert,
		Fields: map[string]any{"state": "packed", "packed_count": 5},
		HLC:    olderHLC,
	}

	res := Merge(current, rowHLC, true, m)

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

	res := Merge(openItem(), rowHLC, true, m)

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
			res := Merge(openItem(), rowHLC, true, Mutation{Op: OpDelete, HLC: tc.hlc})
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

	res := Merge(nil, "", false, m)

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
			res := Merge(openItem(), rowHLC, true, Mutation{Op: OpUpsert, Fields: map[string]any{"quantity": 7}, HLC: tc.hlc})
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
