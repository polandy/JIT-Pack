package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"jitpack/internal/portable"
)

func TestExportTemplate_NotFound(t *testing.T) {
	srv := newTestServer(t)

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/templates/nonexistent/export", nil)
	req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

// The export endpoint serves the document a *user* can hand to someone else:
// the right media type, a filename, and the composition FR-27.1 promises.
func TestExportTemplate_ServesTheDocument(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	for _, q := range []string{
		`INSERT INTO templates (id, owner_id, name, kind) VALUES ('t1', 'user-a', 'Base Travel', 'template')`,
		`INSERT INTO items (id, name) VALUES ('i1', 'Toothbrush')`,
		`INSERT INTO template_items (id, template_id, item_id, quantity, assignment) VALUES ('ti1', 't1', 'i1', 1, 'per_person')`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/templates/t1/export", nil)
	req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, body: %s", resp.StatusCode, body)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/x-yaml" {
		t.Errorf("Content-Type = %q, want application/x-yaml", ct)
	}
	if cd := resp.Header.Get("Content-Disposition"); !strings.Contains(cd, "Base Travel") {
		t.Errorf("Content-Disposition = %q, want the template's name in it", cd)
	}

	body, _ := io.ReadAll(resp.Body)
	doc, err := portable.Unmarshal(body)
	if err != nil {
		t.Fatalf("what we served does not parse back: %v\n%s", err, body)
	}
	if doc.Kind != portable.KindTemplate || doc.Name != "Base Travel" {
		t.Errorf("doc = %+v", doc)
	}
	if len(doc.Items) != 1 || doc.Items[0].Name != "Toothbrush" {
		t.Errorf("items = %+v", doc.Items)
	}
}

// A trip document carries travelers and containers **by name** (FR-18.3) —
// internal ids mean nothing on the instance the file is opened on.
func TestExportTrip_CarriesTravelersAndContainersByName(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	for _, q := range []string{
		`INSERT INTO travelers (id, trip_id, name) VALUES ('tr1', 'trip-samedan', 'Andy')`,
		`INSERT INTO containers (id, trip_id, name, carrier_traveler_id, max_weight_grams)
		 VALUES ('c1', 'trip-samedan', 'Backpack', 'tr1', 8000)`,
		`INSERT INTO items (id, name) VALUES ('i1', 'Toothbrush')`,
		`INSERT INTO trip_items (id, trip_id, name, source_item_id, quantity, assigned_traveler_id, container_id)
		 VALUES ('x1', 'trip-samedan', 'Toothbrush', 'i1', 1, 'tr1', 'c1')`,
		`INSERT INTO trip_items (id, trip_id, name, quantity, mode)
		 VALUES ('x2', 'trip-samedan', 'Socks', 3, 'buy_before')`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/trips/trip-samedan/export.yaml", nil)
	req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, body: %s", resp.StatusCode, body)
	}

	body, _ := io.ReadAll(resp.Body)
	doc, err := portable.Unmarshal(body)
	if err != nil {
		t.Fatalf("what we served does not parse back: %v\n%s", err, body)
	}
	if len(doc.Travelers) != 1 || doc.Travelers[0].Name != "Andy" {
		t.Errorf("travelers = %+v", doc.Travelers)
	}
	if len(doc.Containers) != 1 || doc.Containers[0].Carrier != "Andy" {
		t.Errorf("containers = %+v", doc.Containers)
	}
	if len(doc.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(doc.Items))
	}
}

func TestExportTrip_Unauthenticated(t *testing.T) {
	srv := newTestServer(t)

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/trips/"+trip+"/export.yaml", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func parseJSON(data []byte, v any) error {
	return json.Unmarshal(data, v)
}

// A trip export is trip data, so it needs the same membership check the CSV
// export has always had. Without it any account on the instance could read any
// trip by guessing or learning its id — the YAML route was wired with `authed`
// alone, which authenticates the caller but authorizes nothing.
func TestExportTrip_NonMemberIsRefused(t *testing.T) {
	srv := newTestServer(t)

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/trips/"+trip+"/export.yaml", nil)
	req.Header.Set("Authorization", "Bearer "+token(t, "user-x", testSecret))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403 for a non-member", resp.StatusCode)
	}

	req, _ = http.NewRequest(http.MethodGet, srv.URL+"/api/v1/trips/"+trip+"/export.yaml", nil)
	req.Header.Set("Authorization", "Bearer "+token(t, userB, testSecret))
	member, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer member.Body.Close()

	if member.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200 for a member", member.StatusCode)
	}
}
