package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// The push endpoint checks membership for the trip in its URL and nothing
// else. Without the store's confinement a member of any trip could name a
// foreign trip's row id and reach every other trip through their own
// endpoint — writing it, deleting it, and (because the change_log entry
// lands under *their* trip) pulling its full snapshot back. user-x is a
// member of their own trip only; trip-samedan belongs to user-a and user-b.

const strangerTrip = "trip-stranger"

// seedStrangerTrip gives user-x a trip of their own, so the push below is
// authorised for its endpoint and only the confinement stands between the
// stranger and trip-samedan's rows.
func seedStrangerTrip(t *testing.T, exec func(string) error) {
	t.Helper()
	for _, q := range []string{
		`INSERT INTO trips (id, name, year) VALUES ('` + strangerTrip + `', 'Fremde Reise', 2026)`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('` + strangerTrip + `', 'user-x', 'owner')`,
		`INSERT INTO trip_items (id, trip_id, name, quantity) VALUES ('victim-item', '` + trip + `', 'Wanderschuhe', 2)`,
	} {
		if err := exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}
}

func TestPush_StrangerTargetingAnotherTripsRow_RejectedAndRowUntouched(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	seedStrangerTrip(t, func(q string) error {
		_, err := st.DB().Exec(q)
		return err
	})
	strangerPush := srv.URL + "/api/v1/trips/" + strangerTrip + "/sync"

	body := map[string]any{"mutations": []any{
		mutation("victim-item", "mut-1", "upsert",
			map[string]any{"name": "GEKAPERT", "quantity": 99},
			"0000000009000-0000-ffffffff"),
	}}
	resp, raw := doJSON(t, http.MethodPost, strangerPush, token(t, "user-x", testSecret), body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	var pushOut struct {
		Results []struct {
			Outcome string `json:"outcome"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &pushOut); err != nil {
		t.Fatalf("decode push response: %v (%s)", err, raw)
	}
	if len(pushOut.Results) != 1 || pushOut.Results[0].Outcome != "rejected" {
		t.Fatalf("results = %+v, want one rejected", pushOut.Results)
	}

	var name string
	var qty int
	if err := st.DB().QueryRow(
		`SELECT name, quantity FROM trip_items WHERE id = 'victim-item'`).Scan(&name, &qty); err != nil {
		t.Fatalf("victim row: %v", err)
	}
	if name != "Wanderschuhe" || qty != 2 {
		t.Errorf("victim row = (%q, %d), want (Wanderschuhe, 2) — another trip's row was written", name, qty)
	}

	// The read half: the stranger's own feed must not carry the foreign row.
	resp, raw = doJSON(t, http.MethodGet, strangerPush+"?cursor=0", token(t, "user-x", testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d, body %s", resp.StatusCode, raw)
	}
	var pullOut struct {
		Changes []struct {
			ID  string         `json:"id"`
			Row map[string]any `json:"row"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pullOut); err != nil {
		t.Fatalf("decode pull response: %v (%s)", err, raw)
	}
	for _, c := range pullOut.Changes {
		if c.ID == "victim-item" {
			t.Errorf("the stranger's pull carried another trip's row: %+v", c.Row)
		}
	}
}

func TestPush_StrangerDeletingAnotherTripsRow_RejectedAndRowSurvives(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	seedStrangerTrip(t, func(q string) error {
		_, err := st.DB().Exec(q)
		return err
	})
	strangerPush := srv.URL + "/api/v1/trips/" + strangerTrip + "/sync"

	body := map[string]any{"mutations": []any{
		mutation("victim-item", "mut-1", "delete", nil, "0000000009000-0000-ffffffff"),
	}}
	resp, raw := doJSON(t, http.MethodPost, strangerPush, token(t, "user-x", testSecret), body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	var alive int
	if err := st.DB().QueryRow(
		`SELECT count(*) FROM trip_items WHERE id = 'victim-item'`).Scan(&alive); err != nil {
		t.Fatal(err)
	}
	if alive != 1 {
		t.Error("another trip's row was deleted through a foreign endpoint")
	}
}

// The counterpart: the trip's own members keep working exactly as before.
func TestPush_OwnTripRow_StillApplies(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	seedStrangerTrip(t, func(q string) error {
		_, err := st.DB().Exec(q)
		return err
	})

	body := map[string]any{"mutations": []any{
		mutation("victim-item", "mut-1", "upsert",
			map[string]any{"quantity": 3}, "0000000009000-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	var qty int
	if err := st.DB().QueryRow(
		`SELECT quantity FROM trip_items WHERE id = 'victim-item'`).Scan(&qty); err != nil {
		t.Fatal(err)
	}
	if qty != 3 {
		t.Errorf("quantity = %d, want 3 — a member's own write was refused", qty)
	}
}
