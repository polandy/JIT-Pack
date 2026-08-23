package api

import (
	"encoding/json"
	"testing"

	syncpkg "jitpack/internal/sync"
)

// The wire vocabulary and the merge vocabulary are the same four words. They
// are declared in two packages because `sync` may import nothing internal
// (invariant 1) and the contract lives beside the handlers — so the agreement
// is asserted rather than assumed (NFR-4.14).
func TestWire_OutcomeVocabularyMatchesTheMergeAlgorithm(t *testing.T) {
	pairs := []struct {
		wire  MutationOutcome
		merge syncpkg.Outcome
	}{
		{OutcomeApplied, syncpkg.OutcomeApplied},
		{OutcomeMerged, syncpkg.OutcomeMerged},
		{OutcomeDuplicate, syncpkg.OutcomeDuplicate},
		{OutcomeRejected, syncpkg.OutcomeRejected},
	}
	for _, p := range pairs {
		if string(p.wire) != string(p.merge) {
			t.Errorf("wire says %q where the merge says %q", p.wire, p.merge)
		}
	}
}

// The envelope is the half of the contract that already worked; this pins the
// exact bytes so a refactor of writeError cannot quietly reshape it.
func TestWire_ErrorEnvelopeIsCodeAndMessageUnderError(t *testing.T) {
	out, err := json.Marshal(APIError{Error: APIErrorBody{Code: ErrValidation, Message: "bad"}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	const want = `{"error":{"code":"validation","message":"bad"}}`
	if string(out) != want {
		t.Errorf("envelope changed:\n got %s\nwant %s", out, want)
	}
}

// A field the server omits must be absent, not null — the client's generated
// type says `field?`, and a null there would be a value it never expects.
func TestWire_OmittedFieldIsAbsentFromTheEnvelope(t *testing.T) {
	out, _ := json.Marshal(APIError{Error: APIErrorBody{Code: ErrNotFound, Message: "gone"}})
	var decoded map[string]map[string]any
	if err := json.Unmarshal(out, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, present := decoded["error"]["field"]; present {
		t.Error("an empty field must not reach the wire at all")
	}
}

// The generated client type declares `changes: PullChange[]`, never null. A Go
// nil slice marshals to null, so the encoder is held to the promise here
// rather than at the one call site that happens to pre-allocate.
func TestWire_EmptyPageEncodesAnArrayNotNull(t *testing.T) {
	out, err := json.Marshal(PullResponse{Changes: []PullChange{}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	const want = `{"changes":[],"next_cursor":0,"has_more":false}`
	if string(out) != want {
		t.Errorf("an empty page must be an empty array:\n got %s\nwant %s", out, want)
	}
}

func TestWire_EmptyPushResponseEncodesAnArrayNotNull(t *testing.T) {
	out, err := json.Marshal(PushResponse{Results: []MutationResult{}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	const want = `{"results":[],"pull_hint":{"next_cursor":0}}`
	if string(out) != want {
		t.Errorf("an empty batch must be an empty array:\n got %s\nwant %s", out, want)
	}
}
