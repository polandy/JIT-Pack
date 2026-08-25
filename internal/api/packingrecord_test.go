package api

import (
	"testing"
	"time"

	syncpkg "jitpack/internal/sync"
)

// FR-25.19 at the stamping layer. The record of who packed a row is
// written from the authenticated pusher and never from the client:
// "a record you can pick is not a record". The assignment beside it is
// the opposite — a deliberate client choice — so stampActor must leave
// it alone.
func TestStampActor_PackingRecord_FR25_19(t *testing.T) {
	const acting = "user-andy"

	tests := []struct {
		name       string
		fields     map[string]any
		wantRecord any
		wantAssign any // nil means "the key must be absent"
	}{
		{
			name:       "packing stamps the record from the actor",
			fields:     map[string]any{"state": "packed"},
			wantRecord: acting,
			wantAssign: nil,
		},
		{
			name:       "the assignment is the client's to choose and survives",
			fields:     map[string]any{"state": "packed", "packer_user_id": "user-sia"},
			wantRecord: acting,
			wantAssign: "user-sia",
		},
		{
			name:       "a forged record is overwritten, not accepted",
			fields:     map[string]any{"state": "packed", "packed_by_user_id": "user-sia"},
			wantRecord: acting,
			wantAssign: nil,
		},
		{
			name:       "un-packing clears the record (FR-25.17)",
			fields:     map[string]any{"state": "open", "packed_by_user_id": "user-sia"},
			wantRecord: nil,
			wantAssign: nil,
		},
		{
			name:       "a partial row has packed nothing yet",
			fields:     map[string]any{"state": "partial"},
			wantRecord: nil,
			wantAssign: nil,
		},
		{
			name:       "a record smuggled in without any state change is dropped",
			fields:     map[string]any{"packed_count": 2, "packed_by_user_id": "user-sia"},
			wantRecord: nil,
			wantAssign: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := &syncpkg.Mutation{Table: "trip_items", Op: syncpkg.OpUpsert, Fields: tc.fields}

			stampActor(m, acting)

			assertField(t, m, "packed_by_user_id", tc.wantRecord)
			assertField(t, m, "packer_user_id", tc.wantAssign)
		})
	}
}

// FR-25.17 needs the *when* beside the who: "gepackt von Andy · heute
// 14:32". The time is part of the same record and follows the same rules
// — written with the state it describes, cleared when that state goes.
//
// It differs from the record's user id in one deliberate way: a client
// may supply its own tap time, because packing happens offline and the
// moment the push finally lands is not the moment the row was packed.
// Invariant 3 governs identity claims, not clocks, and the neighbouring
// packing_now_at has taken client values since it was written.
func TestStampActor_PackedAt_FR25_17(t *testing.T) {
	const acting = "user-andy"
	const tapped = "2026-08-01T10:00:00Z"

	tests := []struct {
		name   string
		fields map[string]any
		want   any // nil = absent or cleared; "" = any parseable server time
	}{
		{
			name:   "packing stamps the time",
			fields: map[string]any{"state": "packed"},
			want:   "",
		},
		{
			name:   "an offline client's own tap time survives the push",
			fields: map[string]any{"state": "packed", "packed_at": tapped},
			want:   tapped,
		},
		{
			name:   "an unparseable time is replaced rather than stored",
			fields: map[string]any{"state": "packed", "packed_at": "yesterday-ish"},
			want:   "",
		},
		{
			name:   "un-packing clears the time with the record it described",
			fields: map[string]any{"state": "open", "packed_at": tapped},
			want:   nil,
		},
		{
			name:   "claiming the row clears a previous packing time",
			fields: map[string]any{"state": "packing_now", "packed_at": tapped},
			want:   nil,
		},
		{
			name:   "a time smuggled in without a state change is dropped",
			fields: map[string]any{"packed_count": 2, "packed_at": tapped},
			want:   nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := &syncpkg.Mutation{Table: "trip_items", Op: syncpkg.OpUpsert, Fields: tc.fields}

			stampActor(m, acting)

			if tc.want == "" {
				got, _ := m.Fields["packed_at"].(string)
				if _, err := time.Parse(time.RFC3339, got); err != nil {
					t.Fatalf("packed_at = %q, want a server-stamped RFC3339 time: %v", got, err)
				}
				return
			}
			assertField(t, m, "packed_at", tc.want)
		})
	}
}

// A delete carries no fields at all. stampActor still runs on it, so the
// nil map must survive both the strip and the state switch — a panic
// here would 500 every item deletion.
func TestStampActor_DeleteWithoutFields_DoesNotPanic(t *testing.T) {
	m := &syncpkg.Mutation{Table: "trip_items", Op: syncpkg.OpDelete}

	stampActor(m, "user-andy")

	if len(m.Fields) != 0 {
		t.Errorf("a delete grew fields: %v", m.Fields)
	}
}

// assertField compares one mutation field against an expectation, where
// nil means the key must not be present at all — the difference between
// "clear it" (explicit nil value) and "do not touch it" matters here.
func assertField(t *testing.T, m *syncpkg.Mutation, key string, want any) {
	t.Helper()
	got, present := m.Fields[key]
	if want == nil {
		if present && got != nil {
			t.Errorf("%s = %v, want absent or cleared", key, got)
		}
		return
	}
	if !present {
		t.Fatalf("%s missing, want %v", key, want)
	}
	if got != want {
		t.Errorf("%s = %v, want %v", key, got, want)
	}
}

// The record must not be settable through the normal push path either —
// the whitelist lets it through so the *server's* stamp can be written,
// which is exactly why stampActor has to own it unconditionally.
func TestStampActor_ClearsRecordOnEveryTripItemMutation_Invariant3(t *testing.T) {
	m := &syncpkg.Mutation{
		Table: "trip_items",
		Op:    syncpkg.OpUpsert,
		Fields: map[string]any{
			"name":              "Zelt",
			"packed_by_user_id": "user-sia",
		},
	}

	stampActor(m, "user-andy")

	if v, ok := m.Fields["packed_by_user_id"]; ok && v != nil {
		t.Errorf("client-sent packing record reached the store: %v", v)
	}
}

// FR-25.11j: which list a row was bought from is a decision the person made
// on screen, not a claim about who they are, so it belongs to the client the
// way the FR-25.19 assignment does. stampActor must leave it untouched — a
// stripped value would take the undo with it, and a row bought at the
// destination is packed in the same mutation, which is where the stamping
// rules above do reach.
func TestStampActor_BoughtFrom_IsTheClientsToChoose_FR25_11j(t *testing.T) {
	const acting = "user-andy"

	tests := []struct {
		name   string
		fields map[string]any
		want   any
	}{
		{
			name:   "a purchase before departure carries the list it left",
			fields: map[string]any{"bought_from": "buy_before", "mode": "pack"},
			want:   "buy_before",
		},
		{
			name:   "a purchase at the destination survives beside the packing stamp",
			fields: map[string]any{"bought_from": "buy_local", "state": "packed"},
			want:   "buy_local",
		},
		{
			name:   "undoing a purchase clears it, and the clearing survives too",
			fields: map[string]any{"bought_from": nil, "mode": "buy_before"},
			want:   nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := &syncpkg.Mutation{Table: "trip_items", Op: syncpkg.OpUpsert, Fields: tc.fields}

			stampActor(m, acting)

			assertField(t, m, "bought_from", tc.want)
		})
	}
}
