package store

import (
	"regexp"
	"sort"
	"strings"
	"testing"

	"jitpack/internal/sync"
)

// sync.Merge keys its rules by field name, not by table (ARCH-09): the
// packed_count/state coupling, the packed/packing_now precedence and the
// additive flags apply to whichever table carries the column. That is only
// correct while the tables that carry them mean the same thing by them; this
// file pins that, so a table that borrows a name fails here instead of
// silently merging by another table's rules.

func tablesWithColumn(column string) []string {
	var tables []string
	for table, cols := range syncableColumns {
		if cols[column] {
			tables = append(tables, table)
		}
	}
	sort.Strings(tables)
	return tables
}

func assertCarriers(t *testing.T, column string, want ...string) {
	t.Helper()
	sort.Strings(want)
	if got := tablesWithColumn(column); strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("tables carrying %q = %v, want %v — sync.Merge applies its %s rule to every one of them; "+
			"a new carrier needs that rule checked (ARCH-09)", column, got, want, column)
	}
}

func TestMergeFields_PackedCountIsCarriedOnlyByTheTwoPackedLists_ARCH09(t *testing.T) {
	assertCarriers(t, "packed_count", TableTripItems, TableExcursionItems)
}

func TestMergeFields_TheAdditiveFlagsAreCarriedOnlyByTripItems_ARCH09(t *testing.T) {
	assertCarriers(t, "flag_unused", TableTripItems)
	assertCarriers(t, "flag_missing", TableTripItems)
}

func TestMergeFields_TheStateRecordIsCarriedOnlyByTripItems_ARCH09(t *testing.T) {
	for _, column := range []string{"packing_now_by", "packing_now_at", "packed_by_user_id", "packed_at"} {
		assertCarriers(t, column, TableTripItems)
	}
}

func TestMergeFields_TheStateColumnIsCarriedByTheKnownTables_ARCH09(t *testing.T) {
	assertCarriers(t, sync.FieldState, TableTripItems, TableExcursionItems, TableIdeas)
}

var stateCheck = regexp.MustCompile(`(?s)\bstate\s+TEXT[^,]*?CHECK\s*\(\s*state\s+IN\s*\(([^)]*)\)\)`)

// stateVocabulary reads a table's `state` CHECK off the live schema.
func stateVocabulary(t *testing.T, s *Store, table string) map[string]bool {
	t.Helper()
	var ddl string
	if err := s.db.QueryRow(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&ddl); err != nil {
		t.Fatalf("read %s's DDL: %v", table, err)
	}
	m := stateCheck.FindStringSubmatch(ddl)
	if m == nil {
		t.Fatalf("%s has a state column but no `state IN (...)` CHECK the test can read", table)
	}
	vocab := map[string]bool{}
	for _, v := range strings.Split(m[1], ",") {
		vocab[strings.Trim(strings.TrimSpace(v), "'")] = true
	}
	return vocab
}

// A state vocabulary that contains packed or packing_now is a packing state:
// Merge's rule 2 would let it override or refuse its neighbour regardless of
// the clock. Only the tables that coupled it to packed_count may.
func TestMergeFields_OnlyThePackedListsSpeakTheTerminalPrecedenceStates_ARCH09(t *testing.T) {
	s := openTestStore(t)
	packing := map[string]bool{TableTripItems: true, TableExcursionItems: true}
	for _, table := range tablesWithColumn(sync.FieldState) {
		vocab := stateVocabulary(t, s, table)
		if len(vocab) == 0 {
			t.Fatalf("%s: empty state vocabulary", table)
		}
		for _, word := range []string{sync.StatePacked, sync.StatePackingNow} {
			if vocab[word] && !packing[table] {
				t.Errorf("%s.state admits %q, a state Merge's terminal-precedence rule orders by name — "+
					"idea-like tables must keep their vocabulary disjoint from the packing states (ARCH-09)", table, word)
			}
		}
	}
}

func TestMergeFields_IdeaStatesAreDisjointFromThePackingStates_ARCH09(t *testing.T) {
	s := openTestStore(t)
	ideas := stateVocabulary(t, s, TableIdeas)
	packing := stateVocabulary(t, s, TableTripItems)
	for word := range ideas {
		if packing[word] {
			t.Errorf("state %q is both an idea state and a packing state", word)
		}
	}
	if !packing[sync.StatePacked] || !packing[sync.StatePackingNow] {
		t.Errorf("trip_items states %v lost the two Merge orders by name", packing)
	}
}
