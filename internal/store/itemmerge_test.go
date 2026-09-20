package store

import (
	"testing"
)

// FR-24.15: the merge alias is a reading convenience, not a reference that
// has to hold. Deleting the row a merged-away item points at — which FR-24.3
// only allows when nothing else resolves against it — empties the pointer
// instead of refusing the delete over something the user cannot see.
func TestDeleteItem_ClearsTheMergeAliasPointingAtIt_FR24_15(t *testing.T) {
	s := openTestStore(t)

	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('survivor', 'Stirnlampe')`)
	mustExec(t, s, `INSERT INTO items (id, name, retired_at, merged_into_id)
	                VALUES ('loser', 'Stirnlampe Petzl', '2026-09-20T00:00:00Z', 'survivor')`)

	if _, err := s.db.Exec(`DELETE FROM items WHERE id = 'survivor'`); err != nil {
		t.Fatalf("delete the survivor: %v", err)
	}

	var alias *string
	if err := s.db.QueryRow(`SELECT merged_into_id FROM items WHERE id = 'loser'`).Scan(&alias); err != nil {
		t.Fatalf("read the alias back: %v", err)
	}
	if alias != nil {
		t.Errorf("merged_into_id = %q, want NULL — the pointer should clear itself", *alias)
	}
	// And the row itself is still there: a merged-away item is history, and
	// deleting what it was merged into is not a reason to lose it.
	var rows int
	if err := s.db.QueryRow(`SELECT count(*) FROM items WHERE id = 'loser'`).Scan(&rows); err != nil {
		t.Fatalf("count: %v", err)
	}
	if rows != 1 {
		t.Errorf("the merged-away row is gone (%d rows), want it kept", rows)
	}
}
