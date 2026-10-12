package api

import (
	"testing"

	syncpkg "jitpack/internal/sync"
)

// FR-6.2: a side effect is owed for a mutation that changed the trip, and
// for no other — the verdict, not the mutation, decides what reaches
// internal/notify.
func TestLandedMutations_OnlyAChangeToTheTripEarnsASideEffect(t *testing.T) {
	for _, tc := range []struct {
		outcome MutationOutcome
		landed  bool
	}{
		{OutcomeApplied, true},
		// Applied in part is still a change.
		{OutcomeMerged, true},
		{OutcomeRejected, false},
		{OutcomeDuplicate, false},
	} {
		t.Run(string(tc.outcome), func(t *testing.T) {
			mut := syncpkg.Mutation{ID: "item-1"}
			got := landedMutations([]pushedMutation{{mut: mut, outcome: tc.outcome}})
			if landed := len(got) == 1 && got[0].ID == "item-1"; landed != tc.landed {
				t.Errorf("landed = %v, want %v", landed, tc.landed)
			}
		})
	}
}
