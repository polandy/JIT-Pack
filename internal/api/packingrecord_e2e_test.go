package api_test

import (
	"database/sql"
	"net/http"
	"testing"
)

// FR-25.19 through the real push path, against real SQLite: the split
// only holds if the stamp and — crucially — its clearing survive the
// whole round trip as a genuine SQL NULL rather than an empty string.
func TestPush_PackingRecord_StampedAndCleared_FR25_19(t *testing.T) {
	srv, st := newTestServerWithStore(t)

	record := func(t *testing.T) sql.NullString {
		t.Helper()
		var v sql.NullString
		if err := st.DB().QueryRow(
			`SELECT packed_by_user_id FROM trip_items WHERE id = 'item-1'`).Scan(&v); err != nil {
			t.Fatalf("read record: %v", err)
		}
		return v
	}
	assignment := func(t *testing.T) sql.NullString {
		t.Helper()
		var v sql.NullString
		if err := st.DB().QueryRow(
			`SELECT packer_user_id FROM trip_items WHERE id = 'item-1'`).Scan(&v); err != nil {
			t.Fatalf("read assignment: %v", err)
		}
		return v
	}
	push := func(t *testing.T, mutID string, fields map[string]any, hlc string) {
		t.Helper()
		body := map[string]any{"mutations": []any{
			mutation("item-1", mutID, "upsert", fields, hlc),
		}}
		resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("push %s status = %d, body %s", mutID, resp.StatusCode, raw)
		}
	}

	// user-a creates the row and assigns it deliberately to user-b.
	push(t, "m1", map[string]any{
		"trip_id":        trip,
		"name":           "Wanderschuhe",
		"quantity":       1,
		"packer_user_id": userB,
	}, "0000000001000-0000-aaaaaaaa")

	if r := record(t); r.Valid {
		t.Errorf("an unpacked row already claims a packer: %q", r.String)
	}
	if a := assignment(t); a.String != userB {
		t.Errorf("assignment = %q, want %q — the client's choice must survive", a.String, userB)
	}

	// user-a then packs it themselves. This is the case the split exists
	// for: the app must not claim user-b packed it.
	push(t, "m2", map[string]any{
		"state":        "packed",
		"packed_count": 1,
	}, "0000000002000-0000-aaaaaaaa")

	if r := record(t); r.String != userA {
		t.Errorf("record = %q, want %q (the acting user)", r.String, userA)
	}
	if a := assignment(t); a.String != userB {
		t.Errorf("packing overwrote the assignment: %q, want %q", a.String, userB)
	}

	// Un-packing clears the stamp with the state it described (FR-25.17).
	push(t, "m3", map[string]any{
		"state":        "open",
		"packed_count": 0,
	}, "0000000003000-0000-aaaaaaaa")

	if r := record(t); r.Valid {
		t.Errorf("stale packing record outlived the packed state: %q", r.String)
	}
	if a := assignment(t); a.String != userB {
		t.Errorf("un-packing dropped the assignment: %q, want %q", a.String, userB)
	}
}

// Invariant 3 end to end: a client that names someone else as the packer
// cannot make that stick, even when it packs the row in the same push.
func TestPush_ClientCannotForgePackingRecord_Invariant3(t *testing.T) {
	srv, st := newTestServerWithStore(t)

	body := map[string]any{"mutations": []any{
		mutation("item-forge", "m1", "insert", map[string]any{
			"trip_id":           trip,
			"name":              "Zelt",
			"state":             "packed",
			"packed_by_user_id": userB,
		}, "0000000001000-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}

	var got sql.NullString
	if err := st.DB().QueryRow(
		`SELECT packed_by_user_id FROM trip_items WHERE id = 'item-forge'`).Scan(&got); err != nil {
		t.Fatalf("read record: %v", err)
	}
	if got.String != userA {
		t.Errorf("record = %q, want %q — the client's claim was trusted", got.String, userA)
	}
}
