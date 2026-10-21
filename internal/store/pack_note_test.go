package store

import (
	"context"
	"strings"
	"testing"

	"jitpack/internal/sync"
)

// FR-25.33: a pack note is one line of at most 60 characters, and no note is
// NULL rather than a note that says nothing.
func TestSchema_PackNoteIsOneToSixtyCharacters_FR25_33(t *testing.T) {
	s := openTestStore(t)
	insert := func(id string, note any) error {
		_, err := s.db.Exec(
			`INSERT INTO trip_items (id, trip_id, name, pack_note) VALUES (?, ?, 'Lange Hose', ?)`, id, testTrip, note)
		return err
	}
	if err := insert("ok-60", strings.Repeat("a", 60)); err != nil {
		t.Errorf("a 60-character note was refused: %v", err)
	}
	if err := insert("ok-none", nil); err != nil {
		t.Errorf("a row without a note was refused: %v", err)
	}
	if err := insert("bad-61", strings.Repeat("a", 61)); err == nil {
		t.Error("a 61-character note was accepted")
	}
	if err := insert("bad-blank", ""); err == nil {
		t.Error("an empty note was accepted — none is NULL")
	}
}

// FR-25.33: the note is the client's to write, and un-packing the row — which
// clears the FR-25.17 stamp — leaves it standing: before packing it is the
// plan, after packing the record, and one field serves both.
func TestApplyMutation_PackNote_KeptThroughAnUnpack_FR25_33(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name) VALUES ('ti-1', ?, 'Lange Hose')`, testTrip)

	steps := []struct {
		name   string
		fields map[string]any
		hlc    sync.HLC
	}{
		{"pack", map[string]any{"state": "packed", "packed_count": 1}, "0000000002000-0000-aaaaaaaa"},
		{"note", map[string]any{"pack_note": "Jeans"}, "0000000003000-0000-aaaaaaaa"},
		{"unpack", map[string]any{"state": "open", "packed_count": 0}, "0000000004000-0000-aaaaaaaa"},
	}
	for _, st := range steps {
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, upsert("ti-1", st.name, st.fields, st.hlc)); err != nil ||
			res.Outcome != sync.OutcomeApplied {
			t.Fatalf("%s: outcome %q reason %q err %v, want applied", st.name, res.Outcome, res.Reason, err)
		}
	}

	var note *string
	var packedBy *string
	if err := s.db.QueryRow(`SELECT pack_note, packed_by_user_id FROM trip_items WHERE id = 'ti-1'`).
		Scan(&note, &packedBy); err != nil {
		t.Fatalf("read row: %v", err)
	}
	if note == nil || *note != "Jeans" {
		t.Errorf("note after the unpack = %v, want Jeans", note)
	}
	if packedBy != nil {
		t.Errorf("packed_by_user_id after the unpack = %q, want NULL — the stamp goes, the note stays", *packedBy)
	}
}
