package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// NFR-4.2a promises audit *and* manual revert. These cases state the wire
// half of it: the log's own rows carry a `reverted` flag, one endpoint per
// partition restores the losing value, and every refusal has its own code
// so the client can say which sentence applies.

// seedTripConflict pushes a winner and a stale loser on trip_items.quantity
// and returns the id of the single conflict entry that produces.
func seedTripConflict(t *testing.T, srv *httptest.Server) string {
	t.Helper()
	push := func(mutID, hlc string, fields map[string]any) {
		body := map[string]any{"mutations": []any{
			mutation("item-r1", mutID, "upsert", fields, hlc),
		}}
		resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
		}
	}
	push("rv-1", "0000000002000-0000-bbbbbbbb", map[string]any{"trip_id": trip, "name": "Socken", "quantity": 5})
	push("rv-2", "0000000001000-0000-aaaaaaaa", map[string]any{"quantity": 9})
	return firstConflictID(t, srv, "/api/v1/trips/"+trip+"/conflicts")
}

func firstConflictID(t *testing.T, srv *httptest.Server, path string) string {
	t.Helper()
	resp, raw := doJSON(t, http.MethodGet, srv.URL+path, token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Conflicts []struct {
			ID       string `json:"id"`
			Reverted bool   `json:"reverted"`
		} `json:"conflicts"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
	if len(out.Conflicts) != 1 {
		t.Fatalf("conflicts = %d, want 1 (%s)", len(out.Conflicts), raw)
	}
	return out.Conflicts[0].ID
}

func conflictReverted(t *testing.T, srv *httptest.Server, path string) bool {
	t.Helper()
	resp, raw := doJSON(t, http.MethodGet, srv.URL+path, token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Conflicts []struct {
			Reverted bool `json:"reverted"`
		} `json:"conflicts"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
	if len(out.Conflicts) != 1 {
		t.Fatalf("conflicts = %d, want 1", len(out.Conflicts))
	}
	return out.Conflicts[0].Reverted
}

func TestRevertConflict_RestoresTheLoserAndHintsThePull_NFR42a(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	id := seedTripConflict(t, srv)

	resp, raw := doJSON(t, http.MethodPost,
		srv.URL+"/api/v1/trips/"+trip+"/conflicts/"+id+"/revert",
		token(t, userB, testSecret), nil)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		OK       bool `json:"ok"`
		PullHint struct {
			NextCursor int64 `json:"next_cursor"`
		} `json:"pull_hint"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
	if !out.OK {
		t.Error("ok = false")
	}
	// P-1: the client learns the outcome by pulling, so the hint has to
	// name the seq the revert just wrote.
	if out.PullHint.NextCursor == 0 {
		t.Error("pull_hint.next_cursor = 0, want the revert's seq")
	}
	var qty int
	if err := st.DB().QueryRow(`SELECT quantity FROM trip_items WHERE id = 'item-r1'`).Scan(&qty); err != nil {
		t.Fatal(err)
	}
	if qty != 9 {
		t.Errorf("quantity = %d, want 9 (the loser restored)", qty)
	}
	if !conflictReverted(t, srv, "/api/v1/trips/"+trip+"/conflicts") {
		t.Error("the entry must report itself reverted afterwards")
	}
}

func TestRevertConflict_SecondAttemptIsAConflict_NFR42a(t *testing.T) {
	srv := newTestServer(t)
	id := seedTripConflict(t, srv)
	url := srv.URL + "/api/v1/trips/" + trip + "/conflicts/" + id + "/revert"
	if resp, raw := doJSON(t, http.MethodPost, url, token(t, userA, testSecret), nil); resp.StatusCode != http.StatusOK {
		t.Fatalf("first revert status = %d, body %s", resp.StatusCode, raw)
	}

	resp, raw := doJSON(t, http.MethodPost, url, token(t, userA, testSecret), nil)

	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409, body %s", resp.StatusCode, raw)
	}
	if code := errorCode(t, raw); code != "already_reverted" {
		t.Errorf("error code = %q, want already_reverted", code)
	}
}

func TestRevertConflict_DeletedRowIsRefused_NFR42a(t *testing.T) {
	srv := newTestServer(t)
	id := seedTripConflict(t, srv)
	body := map[string]any{"mutations": []any{
		mutation("item-r1", "rv-del", "delete", nil, "0000000003000-0000-cccccccc"),
	}}
	if resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body); resp.StatusCode != http.StatusOK {
		t.Fatalf("delete status = %d, body %s", resp.StatusCode, raw)
	}

	resp, raw := doJSON(t, http.MethodPost,
		srv.URL+"/api/v1/trips/"+trip+"/conflicts/"+id+"/revert",
		token(t, userA, testSecret), nil)

	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409, body %s", resp.StatusCode, raw)
	}
	if code := errorCode(t, raw); code != "row_deleted" {
		t.Errorf("error code = %q, want row_deleted", code)
	}
	if conflictReverted(t, srv, "/api/v1/trips/"+trip+"/conflicts") {
		t.Error("a refused revert must leave the entry open")
	}
}

func TestRevertConflict_NonMemberForbidden_NFR42a(t *testing.T) {
	srv := newTestServer(t)
	id := seedTripConflict(t, srv)

	resp, _ := doJSON(t, http.MethodPost,
		srv.URL+"/api/v1/trips/"+trip+"/conflicts/"+id+"/revert",
		token(t, "user-x", testSecret), nil)

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", resp.StatusCode)
	}
}

func TestRevertConflict_UnknownEntryIsNotFound(t *testing.T) {
	srv := newTestServer(t)

	resp, _ := doJSON(t, http.MethodPost,
		srv.URL+"/api/v1/trips/"+trip+"/conflicts/no-such-id/revert",
		token(t, userA, testSecret), nil)

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

// §6 rule 2 outranks the revert: restoring packing_now onto a packed row
// is the write the merge exists to drop, and the caller must be told.
func TestRevertConflict_TerminalPrecedenceRefuses_NFR42a(t *testing.T) {
	srv := newTestServer(t)
	push := func(mutID, hlc string, fields map[string]any) {
		body := map[string]any{"mutations": []any{
			mutation("item-r2", mutID, "upsert", fields, hlc),
		}}
		resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
		}
	}
	push("rv-s1", "0000000002000-0000-bbbbbbbb", map[string]any{"trip_id": trip, "name": "Helm", "state": "packed"})
	push("rv-s2", "0000000009000-0000-dddddddd", map[string]any{"state": "packing_now"})
	id := firstConflictID(t, srv, "/api/v1/trips/"+trip+"/conflicts")

	resp, raw := doJSON(t, http.MethodPost,
		srv.URL+"/api/v1/trips/"+trip+"/conflicts/"+id+"/revert",
		token(t, userA, testSecret), nil)

	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409, body %s", resp.StatusCode, raw)
	}
	if code := errorCode(t, raw); code != "revert_refused" {
		t.Errorf("error code = %q, want revert_refused", code)
	}
}

func TestRevertMasterConflict_RestoresTheLoser_NFR42a(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	push := func(mutID, hlc string, fields map[string]any) {
		m := mutation("tpl-rv", mutID, "upsert", fields, hlc)
		m["table"] = "templates"
		body := map[string]any{"mutations": []any{m}}
		resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/sync/master", token(t, userA, testSecret), body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
		}
	}
	push("mrv-1", "0000000002000-0000-bbbbbbbb", map[string]any{"owner_id": userA, "name": "Ferien"})
	push("mrv-2", "0000000001000-0000-aaaaaaaa", map[string]any{"name": "Sommerferien"})
	id := firstConflictID(t, srv, "/api/v1/conflicts/master")

	resp, raw := doJSON(t, http.MethodPost,
		srv.URL+"/api/v1/conflicts/master/"+id+"/revert",
		token(t, userA, testSecret), nil)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var name string
	if err := st.DB().QueryRow(`SELECT name FROM templates WHERE id = 'tpl-rv'`).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Sommerferien" {
		t.Errorf("name = %q, want Sommerferien", name)
	}
}

// A trip's conflict is not the master log's, and vice versa — the two
// endpoints are per partition, exactly as the two list endpoints are.
func TestRevertMasterConflict_TripEntryIsNotInTheMasterLog_NFR42a(t *testing.T) {
	srv := newTestServer(t)
	id := seedTripConflict(t, srv)

	resp, _ := doJSON(t, http.MethodPost,
		srv.URL+"/api/v1/conflicts/master/"+id+"/revert",
		token(t, userA, testSecret), nil)

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestRevertMasterConflict_RequiresAuth(t *testing.T) {
	srv := newTestServer(t)

	resp, _ := doJSON(t, http.MethodPost, srv.URL+"/api/v1/conflicts/master/any/revert", "", nil)

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func errorCode(t *testing.T, raw []byte) string {
	t.Helper()
	var out struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode error body: %v (%s)", err, raw)
	}
	return out.Error.Code
}

// The store's own authorization, not the middleware's: a member may read
// a conflict on the trip's immutable owner row (FR-4.7) and may not write
// it. Seeded directly, because the push path refuses the write that would
// otherwise produce the entry.
func TestRevertMasterConflict_VisibleButUnwritableIsForbidden_NFR42a(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	// The fixture's own owner row, which FR-4.7 makes immutable.
	var memberID string
	if err := st.DB().QueryRow(
		`SELECT id FROM trip_members WHERE trip_id = ? AND role = 'owner'`, trip).Scan(&memberID); err != nil {
		t.Fatalf("owner membership row: %v", err)
	}
	if _, err := st.DB().Exec(
		`INSERT INTO conflict_log (id, trip_id, entity_table, entity_id, field, losing_value, winning_value, mutation_id, actor_user_id)
		 VALUES ('cf-owner', NULL, 'trip_members', ?, 'role', '"editor"', '"owner"', 'seed-mut', 'user-x')`, memberID); err != nil {
		t.Fatalf("seed conflict: %v", err)
	}

	resp, raw := doJSON(t, http.MethodPost,
		srv.URL+"/api/v1/conflicts/master/cf-owner/revert", token(t, userA, testSecret), nil)

	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403, body %s", resp.StatusCode, raw)
	}
	if code := errorCode(t, raw); code != "forbidden" {
		t.Errorf("error code = %q, want forbidden", code)
	}
}
