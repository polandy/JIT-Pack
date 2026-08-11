package api

import (
	"testing"

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
