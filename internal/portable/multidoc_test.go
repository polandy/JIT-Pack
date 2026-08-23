package portable_test

import (
	"strings"
	"testing"

	"jitpack/internal/portable"
)

func TestUnmarshalAll_SingleDocument_ReadsItLikeUnmarshal(t *testing.T) {
	results := portable.UnmarshalAll([]byte("kind: template\nname: Ferien\n"))
	if len(results) != 1 {
		t.Fatalf("want 1 document, got %d", len(results))
	}
	if results[0].Err != nil {
		t.Fatalf("unexpected error: %v", results[0].Err)
	}
	if results[0].Doc.Name != "Ferien" {
		t.Errorf("name = %q, want Ferien", results[0].Doc.Name)
	}
}

// FR-18.4: a backup is every trip and template of a device, so a file holds
// more than one document and they are imported in the order it lists them.
func TestUnmarshalAll_ManyDocuments_KeepsFileOrder(t *testing.T) {
	file := "kind: template\nname: Gruppe\n---\nkind: trip\nname: Cannobio\nyear: 2024\n---\nkind: template\nname: Ferien\n"
	results := portable.UnmarshalAll([]byte(file))
	if len(results) != 3 {
		t.Fatalf("want 3 documents, got %d", len(results))
	}
	want := []string{"Gruppe", "Cannobio", "Ferien"}
	for i, name := range want {
		if results[i].Err != nil {
			t.Fatalf("document %d: unexpected error: %v", i, results[i].Err)
		}
		if results[i].Doc.Name != name {
			t.Errorf("document %d name = %q, want %q", i, results[i].Doc.Name, name)
		}
	}
}

// FR-18.4: "a restore that gives up on the first bad document loses
// everything behind it" — the invalid one is reported in its place.
func TestUnmarshalAll_InvalidDocument_IsReportedInPlaceAndTheRestStillRead(t *testing.T) {
	file := "kind: template\nname: Gruppe\n---\nkind: nonsense\nname: Broken\n---\nkind: trip\nname: Cannobio\nyear: 2024\n"
	results := portable.UnmarshalAll([]byte(file))
	if len(results) != 3 {
		t.Fatalf("want 3 documents, got %d", len(results))
	}
	if results[0].Err != nil || results[2].Err != nil {
		t.Fatalf("intact documents did not survive: %v / %v", results[0].Err, results[2].Err)
	}
	if results[1].Err == nil {
		t.Fatal("the invalid document was reported as readable")
	}
	if !strings.Contains(results[1].Err.Error(), "nonsense") {
		t.Errorf("error does not name the offending value: %v", results[1].Err)
	}
	if results[2].Doc.Name != "Cannobio" {
		t.Errorf("document after the broken one = %q, want Cannobio", results[2].Doc.Name)
	}
}

// The separator between two documents may be followed by nothing at all —
// a trailing "---" must not become a document with no kind.
func TestUnmarshalAll_EmptyDocuments_AreNotReported(t *testing.T) {
	results := portable.UnmarshalAll([]byte("---\nkind: template\nname: Ferien\n---\n"))
	if len(results) != 1 {
		t.Fatalf("want 1 document, got %d: %+v", len(results), results)
	}
}

func TestUnmarshalAll_NoDocuments_ReturnsNothing(t *testing.T) {
	if results := portable.UnmarshalAll([]byte("   \n")); len(results) != 0 {
		t.Fatalf("want no documents, got %d", len(results))
	}
}

// A YAML syntax error costs its own document and no other — the reason the
// file is split before it is parsed rather than read as a stream.
func TestUnmarshalAll_SyntaxError_CostsOnlyItsOwnDocument(t *testing.T) {
	file := "kind: template\nname: Gruppe\n---\n\tkind: trip\n"
	results := portable.UnmarshalAll([]byte(file))
	if len(results) != 2 {
		t.Fatalf("want 2 results, got %d", len(results))
	}
	if results[0].Err != nil {
		t.Fatalf("first document did not survive: %v", results[0].Err)
	}
	if results[1].Err == nil {
		t.Fatal("the syntax error was not reported")
	}
}

// The same file with the typo *first*: a stream decoder would have lost the
// intact document behind it, which is the restore FR-18.4 forbids.
func TestUnmarshalAll_SyntaxErrorFirst_LeavesTheDocumentsBehindItReadable(t *testing.T) {
	results := portable.UnmarshalAll([]byte("\tkind: trip\n---\nkind: template\nname: Gruppe\n"))
	if len(results) != 2 {
		t.Fatalf("want 2 results, got %d", len(results))
	}
	if results[0].Err == nil {
		t.Fatal("the syntax error was not reported")
	}
	if results[1].Err != nil || results[1].Doc.Name != "Gruppe" {
		t.Fatalf("the intact document behind it was lost: %+v", results[1])
	}
}

// The custom scalar readers (Quantity) must run per document, not only on
// the single-document path.
func TestUnmarshalAll_QuantityStrings_StillFoldPerDocument(t *testing.T) {
	file := "kind: template\nname: A\nitems:\n  - name: Socken\n    quantity: \"3\"\n"
	results := portable.UnmarshalAll([]byte(file))
	if len(results) != 1 || results[0].Err != nil {
		t.Fatalf("unexpected result: %+v", results)
	}
	if got := results[0].Doc.Items[0].Quantity; got != 3 {
		t.Errorf("quantity = %d, want 3", got)
	}
}
