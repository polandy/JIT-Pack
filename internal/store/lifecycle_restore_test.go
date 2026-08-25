package store

import (
	"context"
	"database/sql"
	"testing"

	"jitpack/internal/sync"
)

// The restore FR-24.3 calls free: the marker is an ordinary synced column,
// so clearing it is one field write and not an undo of the delete. What has
// to hold on the server is that a *null* survives the trip through the merge
// and reaches the column as NULL — a marker that merges as "unchanged"
// because the value is empty would leave the row hidden forever.
func TestApplyMasterMutation_RestoringARetiredItem_ClearsTheMarker_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedItem(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "it-1", "rr-1",
		nil, "0000000002000-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableItems, "it-1", "rr-2",
		map[string]any{RetiredColumn: nil}, "0000000003000-0000-aaaaaaaa"))

	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%s) — a restore is an ordinary field write", res.Reason)
	}
	var retired sql.NullString
	var name string
	if err := s.db.QueryRowContext(ctx,
		`SELECT `+RetiredColumn+`, name FROM items WHERE id = 'it-1'`).Scan(&retired, &name); err != nil {
		t.Fatalf("read the restored row: %v", err)
	}
	if retired.Valid {
		t.Errorf("%s = %q, want NULL — the row is still hidden from every display surface",
			RetiredColumn, retired.String)
	}
	// The positive signal beside it: the restore cleared the marker and
	// nothing else, so the row it brings back is the row that was retired.
	if name != "Zahnbürste" {
		t.Errorf("name = %q after the restore, want the retired row's own name", name)
	}
}

// The same for a Vorlage — FR-24.3 governs both tables and the restore must
// not be built for one of them.
func TestApplyMasterMutation_RestoringARetiredTemplate_ClearsTheMarker_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedTemplate(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTemplates, "tpl-ferien", "rr-3",
		nil, "0000000002000-0000-aaaaaaaa"))

	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTemplates, "tpl-ferien", "rr-4",
		map[string]any{RetiredColumn: nil}, "0000000003000-0000-aaaaaaaa"))

	var retired sql.NullString
	if err := s.db.QueryRowContext(ctx,
		`SELECT `+RetiredColumn+` FROM templates WHERE id = 'tpl-ferien'`).Scan(&retired); err != nil {
		t.Fatalf("read the restored Vorlage: %v", err)
	}
	if retired.Valid {
		t.Errorf("%s = %q, want NULL", RetiredColumn, retired.String)
	}
}

// Retiring frees the name (idx_items_active_name is partial, over the active
// rows), so the name can be taken by a *different* row before the restore is
// asked for. Two active rows of one name is exactly what FR-16.3's uniqueness
// exists to prevent, so the restore has to lose — cleanly, as a rejection the
// push vocabulary already has, and without touching either row.
func TestApplyMasterMutation_RestoringOntoATakenName_IsRejected_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedItem(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "it-1", "rr-5",
		nil, "0000000002000-0000-aaaaaaaa"))
	// Someone re-creates what they think they lost. Allowed, and the whole
	// reason the partial index was chosen.
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "it-2", "rr-6",
		map[string]any{"name": "Zahnbürste"}, "0000000002500-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableItems, "it-1", "rr-7",
		map[string]any{RetiredColumn: nil}, "0000000003000-0000-aaaaaaaa"))

	if res.Outcome != sync.OutcomeRejected {
		t.Fatalf("outcome = %s, want rejected — two active rows would share a name", res.Outcome)
	}
	if res.Reason != ReasonConstraintViolated {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonConstraintViolated)
	}
	var retired sql.NullString
	if err := s.db.QueryRowContext(ctx,
		`SELECT `+RetiredColumn+` FROM items WHERE id = 'it-1'`).Scan(&retired); err != nil {
		t.Fatalf("the refused restore lost the row: %v", err)
	}
	if !retired.Valid {
		t.Error("the marker was cleared by a rejected mutation — the transaction did not hold")
	}
	// And the row that legitimately holds the name is untouched: a refusal
	// that repaired itself by removing the newcomer would be worse.
	var name string
	if err := s.db.QueryRowContext(ctx, `SELECT name FROM items WHERE id = 'it-2'`).Scan(&name); err != nil {
		t.Fatalf("the newcomer is gone: %v", err)
	}
	if name != "Zahnbürste" {
		t.Errorf("name = %q, want the newcomer untouched", name)
	}
}

// The way out the client offers: the restore carries a free name in the same
// mutation, so the row comes back beside the one that took its old name
// rather than instead of it. One mutation, because two — clear the marker,
// then rename — is a moment where the index is violated in between.
func TestApplyMasterMutation_RestoringUnderAFreeName_KeepsBothRows_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedItem(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "it-1", "rr-8",
		nil, "0000000002000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "it-2", "rr-9",
		map[string]any{"name": "Zahnbürste"}, "0000000002500-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableItems, "it-1", "rr-10",
		map[string]any{RetiredColumn: nil, "name": "Zahnbürste (alt)"},
		"0000000003000-0000-aaaaaaaa"))

	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%s) — the new name is free", res.Reason)
	}
	var active int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM items WHERE `+RetiredColumn+` IS NULL`).Scan(&active); err != nil {
		t.Fatalf("count: %v", err)
	}
	if active != 2 {
		t.Errorf("active items = %d, want 2 — the restored row and the one that took its name", active)
	}
}
