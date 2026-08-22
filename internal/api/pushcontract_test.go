package api

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

// The push response is the one envelope two codebases have to agree on, and
// they disagreed for months: the server has always written `outcome`, while
// the TypeScript type said `status`. Nothing caught it, because each side
// tested against its own idea of the shape — the client's fakes answered
// `status` too, so its rejection handling looked covered and had in fact
// never once run against a real response.
//
// testdata/push_response.json is the shared answer. This test holds the
// server's marshalling to it; client/src/composables/__tests__/
// pushContract.spec.ts feeds the very same file through the client. A key
// renamed on either side now fails on that side.
func TestPushResponse_MatchesTheSharedWireFixture(t *testing.T) {
	var resp pushResponse
	resp.Results = []pushResult{
		{MutationID: "uuid-applied", Outcome: "applied"},
		{
			MutationID: "uuid-merged",
			Outcome:    "merged",
			Conflicts:  []wireConflict{{Field: "quantity", LosingValue: 9, WinningValue: 5}},
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
