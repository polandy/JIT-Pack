package api

import (
	"jitpack/internal/store"
	"testing"

	syncpkg "jitpack/internal/sync"
)

// The wire's outcome words cannot be *defined* from internal/sync: cmd/wiregen
// reads wire.go as source and only recognises a string literal, so a
// conversion would silently drop the union from the generated TypeScript
// (ADR-026). The literals therefore stay, and this test is what keeps them
// one vocabulary rather than a second spelling of it (NFR-4.14).
func TestWireOutcomes_MirrorSync(t *testing.T) {
	for _, tc := range []struct {
		name string
		wire MutationOutcome
		sync syncpkg.Outcome
	}{
		{"applied", OutcomeApplied, syncpkg.OutcomeApplied},
		{"merged", OutcomeMerged, syncpkg.OutcomeMerged},
		{"duplicate", OutcomeDuplicate, syncpkg.OutcomeDuplicate},
		{"rejected", OutcomeRejected, syncpkg.OutcomeRejected},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if string(tc.wire) != string(tc.sync) {
				t.Fatalf("wire outcome %q != sync outcome %q", tc.wire, tc.sync)
			}
		})
	}
}

// FR-32.1: the op an activity entry carries is the store's own word, passed
// through as a cast — a store spelling the wire does not know would reach
// the client as a value its union does not contain.
func TestWireActivityOps_MirrorStore(t *testing.T) {
	for _, tc := range []struct {
		wire  ActivityOp
		store string
	}{
		{ActivityInsert, store.ActivityInsert},
		{ActivityUpdate, store.ActivityUpdate},
		{ActivityDelete, store.ActivityDelete},
	} {
		if string(tc.wire) != tc.store {
			t.Errorf("wire op %q != store op %q", tc.wire, tc.store)
		}
	}
}
