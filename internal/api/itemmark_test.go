package api

import (
	"strings"
	"testing"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

// FR-28.9: the server's whole validation of the mark is a length cap, and it
// is mirrored here so an over-long value is refused with the field named
// rather than surfacing as a CHECK violation from the driver.
//
// What it deliberately does *not* do is decide whether the value "is really
// an emoji": Unicode adds emoji every year, and such a table silently rejects
// next year's valid input on a field where a wrong value costs a wrong little
// picture.
func TestCapMark_RefusesOnlyOnLength_FR28_9(t *testing.T) {
	tests := []struct {
		name    string
		table   string
		value   any
		wantErr bool
	}{
		{"an emoji passes", store.TableItems, "🪥", false},
		{"a ZWJ sequence passes — it is one mark, several code points", store.TableItems,
			"👨‍👩‍👧", false},
		{"text the server does not understand still passes — it is not a validator",
			store.TableItems, "xy", false},
		{"clearing the mark passes", store.TableItems, nil, false},
		{"a template's mark is capped the same way", store.TableTemplates,
			strings.Repeat("x", store.MarkMaxBytes+1), true},
		{"over the cap is refused", store.TableItems,
			strings.Repeat("x", store.MarkMaxBytes+1), true},
		{"exactly the cap is allowed — the boundary is inclusive", store.TableItems,
			strings.Repeat("x", store.MarkMaxBytes), false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := &syncpkg.Mutation{
				Table:  tc.table,
				Op:     syncpkg.OpUpsert,
				Fields: map[string]any{"name": "Zelt", store.MarkColumn: tc.value},
			}
			err := capMark(m)
			if tc.wantErr && err == nil {
				t.Fatalf("capMark accepted %d bytes; the cap is %d", len(tc.value.(string)), store.MarkMaxBytes)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("capMark refused a legal value: %v", err)
			}
		})
	}
}

// A table that carries no mark is not inspected, and a mutation without the
// field is left exactly as it was — the cap must never invent a column.
func TestCapMark_LeavesEverythingElseAlone_FR28_9(t *testing.T) {
	m := &syncpkg.Mutation{
		Table:  store.TableTripItems,
		Op:     syncpkg.OpUpsert,
		Fields: map[string]any{store.MarkColumn: strings.Repeat("x", store.MarkMaxBytes+1)},
	}
	if err := capMark(m); err != nil {
		t.Fatalf("trip_items carries no mark (FR-28.7) and must not be inspected: %v", err)
	}

	bare := &syncpkg.Mutation{
		Table:  store.TableItems,
		Op:     syncpkg.OpUpsert,
		Fields: map[string]any{"name": "Zelt"},
	}
	if err := capMark(bare); err != nil {
		t.Fatalf("a mutation without a mark is not a violation: %v", err)
	}
	if _, ok := bare.Fields[store.MarkColumn]; ok {
		t.Error("capMark invented the column on a mutation that did not carry it")
	}
}

// A delete carries no fields at all — the same shape that once panicked in
// stampActor.
func TestCapMark_DeleteWithoutFields_DoesNotPanic(t *testing.T) {
	m := &syncpkg.Mutation{Table: store.TableItems, Op: syncpkg.OpDelete}
	if err := capMark(m); err != nil {
		t.Fatalf("a delete has nothing to cap: %v", err)
	}
}
