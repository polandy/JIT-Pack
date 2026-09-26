package api

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

// The push response is the one envelope two codebases have to agree on, and
// each side testing against its own idea of the shape cannot see them
// disagree: a client whose fakes answer a key the server never writes has
// rejection handling that looks covered and never runs against a real
// response.
//
// testdata/push_response.json is the shared answer. This test holds the
// server's marshalling to it; client/src/composables/__tests__/
// pushContract.spec.ts feeds the very same file through the client. A key
// renamed on either side fails on that side.
func TestPushResponse_MatchesTheSharedWireFixture(t *testing.T) {
	var resp PushResponse
	resp.Results = []MutationResult{
		{MutationID: "uuid-applied", Outcome: "applied"},
		{
			MutationID: "uuid-merged",
			Outcome:    "merged",
			Conflicts:  []MutationConflict{{Field: "quantity", LosingValue: 9, WinningValue: 5}},
		},
		{MutationID: "uuid-rejected", Outcome: "rejected", Error: "column not syncable: trip_items.nope"},
	}
	resp.PullHint.NextCursor = 4712

	got, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	want, err := os.ReadFile("testdata/push_response.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	if !bytes.Equal(bytes.TrimSpace(got), bytes.TrimSpace(want)) {
		t.Errorf("the push envelope no longer matches testdata/push_response.json.\n"+
			"If the change is deliberate, update the fixture AND the client type in\n"+
			"client/src/api/types.ts, whose test reads the same file.\n\ngot:\n%s\n\nwant:\n%s", got, want)
	}
}
