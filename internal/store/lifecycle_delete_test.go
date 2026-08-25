package store

import (
	"context"
	"database/sql"
	"testing"

	"jitpack/internal/sync"
)

// FR-24.3 replaces the still_referenced refusal for master items and
// Vorlagen with a decision: a row something references is *retired* — kept,
// clocked and synced, but hidden from every display surface — while a row
// nothing references is deleted outright. The marker is the whole mechanism,
// so it has to be a column like any other: nullable, defaulted absent, and on
// the sync whitelist, or no device ever learns a row went away.
func TestSchema_ItemsAndTemplatesCarryARetiredMarker_FR24_3(t *testing.T) {
	s := openTestStore(t)

	for _, table := range []string{TableItems, TableTemplates} {
		if !columns(t, s.db, table)[RetiredColumn] {
			t.Fatalf("%s.%s missing — FR-24.3 gives both tables the same marker", table, RetiredColumn)
		}
		if !syncableColumns[table][RetiredColumn] {
			t.Errorf("%s.%s is not on the sync whitelist — a marker no pull carries hides the row on one device only",
				table, RetiredColumn)
		}
	}

	// Absent is the default and the normal state: nothing about creating a
	// row may mention the marker.
	if _, err := s.db.Exec(`INSERT INTO items (id, name) VALUES ('it-active', 'Zelt')`); err != nil {
		t.Fatalf("an item must be insertable without the marker: %v", err)
	}
	var retired any
	if err := s.db.QueryRow(
		`SELECT ` + RetiredColumn + ` FROM items WHERE id = 'it-active'`).Scan(&retired); err != nil {
		t.Fatalf("read marker: %v", err)
	}
	if retired != nil {
		t.Errorf("%s defaulted to %v, want NULL — absent is active", RetiredColumn, retired)
	}
}

// A name held by a row no screen shows is a name taken by nothing. The
// uniqueness FR-16.3/FR-1.6 want is over what the user can see.
func TestSchema_ARetiredRowStopsHoldingItsName_FR24_3(t *testing.T) {
	s := openTestStore(t)

	if _, err := s.db.Exec(`INSERT INTO items (id, name) VALUES ('it-1', 'Zelt')`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	// The positive control: while it is active the name is still taken.
	if _, err := s.db.Exec(`INSERT INTO items (id, name) VALUES ('it-2', 'Zelt')`); err == nil {
		t.Fatal("two active items of one name were accepted — FR-16.3's UNIQUE(name) is gone")
	}
	if _, err := s.db.Exec(
		`UPDATE items SET ` + RetiredColumn + ` = '2026-08-25T10:00:00Z' WHERE id = 'it-1'`); err != nil {
		t.Fatalf("retire: %v", err)
	}
	if _, err := s.db.Exec(`INSERT INTO items (id, name) VALUES ('it-2', 'Zelt')`); err != nil {
		t.Errorf("a retired row still holds its name: %v", err)
	}
}

// The FR's first branch. Before it, this delete was answered
// still_referenced (Sync-API §5) and the row stayed put with no sign of the
// user's decision on it.
func TestApplyMasterMutation_DeletingAnItemATemplateUses_RetiresIt_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedItem(t, s)

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "it-1", "rd-3",
		nil, "0000000002000-0000-aaaaaaaa"))

	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%s) — FR-24.3 turns this refusal into a retire", res.Reason)
	}
	var retired sql.NullString
	if err := s.db.QueryRowContext(ctx,
		`SELECT `+RetiredColumn+` FROM items WHERE id = 'it-1'`).Scan(&retired); err != nil {
		t.Fatalf("the referenced item was deleted outright: %v", err)
	}
	if !retired.Valid || retired.String == "" {
		t.Errorf("%s = %v, want a stamp — the row survived but nothing records that it was retired",
			RetiredColumn, retired)
	}
}

// The FR's second branch, and the reason the first one cannot be "always
// retire": a mistake created a minute ago leaves nothing behind.
func TestApplyMasterMutation_DeletingAnUnreferencedItem_RemovesTheRow_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "it-lonely", "rd-1",
		map[string]any{"name": "Vertipper"}, "0000000001000-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "it-lonely", "rd-2",
		nil, "0000000002000-0000-aaaaaaaa"))

	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%s), want applied", res.Reason)
	}
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM items WHERE id = 'it-lonely'`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Errorf("the row is still there — a never-referenced item deletes physically (FR-24.3)")
	}
}

// A Vorlage a trip generated from is the FR-9.2 case, and the one the
// still_referenced refusal was written for.
func TestApplyMasterMutation_DeletingATemplateATripItemNames_RetiresIt_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedTemplate(t, s)

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTemplates, "tpl-ferien", "rt-3",
		nil, "0000000002000-0000-aaaaaaaa"))

	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%s) — FR-24.3 retires a referenced Vorlage", res.Reason)
	}
	var retired sql.NullString
	if err := s.db.QueryRowContext(ctx,
		`SELECT `+RetiredColumn+` FROM templates WHERE id = 'tpl-ferien'`).Scan(&retired); err != nil {
		t.Fatalf("the referenced template was deleted outright: %v", err)
	}
	if !retired.Valid {
		t.Errorf("%s is NULL — the Vorlage survived without being marked retired", RetiredColumn)
	}
	// The trip's provenance is what the refusal existed to protect; it has
	// to survive the branch that replaced it.
	var src string
	if err := s.db.QueryRowContext(ctx,
		`SELECT source_template_id FROM trip_items WHERE id = 'ti-1'`).Scan(&src); err != nil {
		t.Fatalf("trip item lost its provenance: %v", err)
	}
	if src != "tpl-ferien" {
		t.Errorf("source_template_id = %q, want tpl-ferien (FR-9.2)", src)
	}
}

// ADR-031: the client mirrors a delete's cascade optimistically, so a
// Vorlage that comes back has to bring its positions with it. A retire is a
// delete the client already drew — the same repair is owed.
func TestApplyMasterMutation_RetiringATemplate_KeepsAndRelogsItsPositions_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedTemplate(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "it-1", "rp-1",
		map[string]any{"name": "Zahnbürste"}, "0000000001002-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplateItems, "tit-1", "rp-2",
		map[string]any{"template_id": "tpl-ferien", "item_id": "it-1", "quantity": 1},
		"0000000001003-0000-aaaaaaaa"))

	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTemplates, "tpl-ferien", "rp-3",
		nil, "0000000002000-0000-aaaaaaaa"))

	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM template_items WHERE id = 'tit-1'`).Scan(&n); err != nil {
		t.Fatalf("count positions: %v", err)
	}
	if n != 1 {
		t.Fatalf("the position was cascaded away by a retire — a retire deletes nothing")
	}
	// The positive signal that the client is told: the position is named
	// again in the master feed, alive, after the retire.
	page, err := s.PullMaster(ctx, testUser, 0, 200)
	if err != nil {
		t.Fatalf("pull: %v", err)
	}
	var relogged bool
	for _, c := range page.Changes {
		if c.Table == TableTemplateItems && c.ID == "tit-1" && !c.Deleted {
			relogged = true
		}
	}
	if !relogged {
		t.Error("the retire did not re-log the positions — the client's optimistic cascade stands")
	}
}

// The marker is a display rule, never a sync rule: a device that has never
// seen the row must still receive it, or history stops resolving there.
func TestPullMaster_CarriesARetiredRow_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedItem(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "it-1", "pr-9",
		nil, "0000000002000-0000-aaaaaaaa"))

	page, err := s.PullMaster(ctx, testUser, 0, 200)
	if err != nil {
		t.Fatalf("pull: %v", err)
	}
	for _, c := range page.Changes {
		if c.Table != TableItems || c.ID != "it-1" {
			continue
		}
		if c.Deleted {
			t.Fatal("the retired item arrived as a tombstone — the row is still there")
		}
		if c.Row[RetiredColumn] == nil {
			t.Fatalf("the snapshot carries no %s — the device cannot tell it is retired", RetiredColumn)
		}
		return
	}
	t.Fatal("the retired item is absent from the master feed")
}

// "Restore" is free precisely because the marker is an ordinary field: one
// mutation clears it and the row is back everywhere.
func TestApplyMasterMutation_ClearingTheMarker_MakesTheRowActiveAgain_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedItem(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "it-1", "un-1",
		nil, "0000000002000-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableItems, "it-1", "un-2",
		map[string]any{RetiredColumn: nil}, "0000000003000-0000-aaaaaaaa"))
	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%s) — clearing the marker is an ordinary write", res.Reason)
	}

	var retired sql.NullString
	if err := s.db.QueryRowContext(ctx,
		`SELECT `+RetiredColumn+` FROM items WHERE id = 'it-1'`).Scan(&retired); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if retired.Valid {
		t.Errorf("%s = %q, want NULL", RetiredColumn, retired.String)
	}
}

// FR-24.3 names master items and Vorlagen and nothing else. A traveler a
// trip row is assigned to keeps refusing its delete — retiring it would put
// a person nobody can see on rows everybody can.
func TestApplyMutation_TheLifecycleRuleStopsAtItemsAndTemplates_FR24_3(t *testing.T) {
	if lifecycleTables[TableTravelers] || lifecycleTables[TableContainers] || lifecycleTables[TableTripSeries] {
		t.Error("FR-24.3 was widened past the two entities it names")
	}
	if !lifecycleTables[TableItems] || !lifecycleTables[TableTemplates] {
		t.Error("FR-24.3 covers master items and Vorlagen")
	}
}

func seedReferencedItem(t *testing.T, s *Store) {
	t.Helper()
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "it-1", "ri-1",
		map[string]any{"name": "Zahnbürste"}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, "tpl-1", "ri-2",
		map[string]any{"name": "Kulturbeutel", "kind": KindGroup}, "0000000001001-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplateItems, "tit-x", "ri-3",
		map[string]any{"template_id": "tpl-1", "item_id": "it-1", "quantity": 1},
		"0000000001002-0000-aaaaaaaa"))
}

func seedReferencedTemplate(t *testing.T, s *Store) {
	t.Helper()
	ctx := context.Background()
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, "tpl-ferien", "rt-1",
		map[string]any{"name": "Ferien", "kind": KindTemplate}, "0000000001000-0000-aaaaaaaa"))
	generated := upsert("ti-1", "rt-2", map[string]any{
		"trip_id": testTrip, "name": "Zahnbürste", "source_template_id": "tpl-ferien",
	}, "0000000001001-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, generated); err != nil {
		t.Fatalf("seed trip item: %v", err)
	}
}
