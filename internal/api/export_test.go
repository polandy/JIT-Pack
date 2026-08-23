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

func TestImportExportTemplate_RoundTrip(t *testing.T) {
	srv := newTestServer(t)

	// Import a template via POST.
	yamlBody := `kind: template
schema_version: 1
name: Test Template
items:
  - name: Toothbrush
    quantity: "1"
    assignment: per_person
    unit: pieces
  - name: Sunscreen
    quantity: "2"
    assignment: trip_global
    unit: pieces
`
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/templates/import",
		strings.NewReader(yamlBody))
	req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
	req.Header.Set("Content-Type", "application/x-yaml")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("import status = %d, body: %s", resp.StatusCode, body)
	}

	// Parse response to get template ID.
	body, _ := io.ReadAll(resp.Body)
	// Response is JSON: {"ok": true, "template_id": "..."}
	var importResp struct {
		OK         bool   `json:"ok"`
		TemplateID string `json:"template_id"`
	}
	if err := parseJSON(body, &importResp); err != nil {
		t.Fatalf("parse import response: %v", err)
	}
	if !importResp.OK || importResp.TemplateID == "" {
		t.Fatalf("unexpected import response: %s", body)
	}

	// Export the template.
	req, _ = http.NewRequest(http.MethodGet,
		srv.URL+"/api/v1/templates/"+importResp.TemplateID+"/export", nil)
	req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp2.Body)
		t.Fatalf("export status = %d, body: %s", resp2.StatusCode, body)
	}
	if ct := resp2.Header.Get("Content-Type"); ct != "application/x-yaml" {
		t.Errorf("content-type = %q, want application/x-yaml", ct)
	}

	exportBody, _ := io.ReadAll(resp2.Body)
	doc, err := portable.Unmarshal(exportBody)
	if err != nil {
		t.Fatalf("unmarshal exported YAML: %v", err)
	}
	if doc.Name != "Test Template" {
		t.Errorf("name = %q", doc.Name)
	}
	if len(doc.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(doc.Items))
	}
}

func TestImportTemplate_InvalidYAML(t *testing.T) {
	srv := newTestServer(t)

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/templates/import",
		strings.NewReader(":::bad"))
	req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
	req.Header.Set("Content-Type", "application/x-yaml")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422", resp.StatusCode)
	}
}

// The traveler `profile:` key below is deliberate: it is the shape
// exported before FR-25.9 retired the Adult/Child type (migration 018).
// A document written by an older instance must still import — the
// retired key is ignored, not an error, so nobody's backup goes stale.
func TestImportExportTrip_RoundTrip(t *testing.T) {
	srv := newTestServer(t)

	yamlBody := `kind: trip
schema_version: 1
name: Imported Trip
start_date: "2026-08-01"
end_date: "2026-08-10"
travelers:
  - name: Andy
    profile: adult
containers:
  - name: Backpack
    carrier: Andy
    max_weight_grams: 8000
items:
  - name: Toothbrush
    quantity: "1"
    mode: pack
    category: Toiletries
    traveler: Andy
    container: Backpack
  - name: Socks
    quantity: "3"
    mode: buy_before
`
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/trips/import",
		strings.NewReader(yamlBody))
	req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
	req.Header.Set("Content-Type", "application/x-yaml")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("import status = %d, body: %s", resp.StatusCode, body)
	}

	body, _ := io.ReadAll(resp.Body)
	var importResp struct {
		OK     bool   `json:"ok"`
		TripID string `json:"trip_id"`
	}
	if err := parseJSON(body, &importResp); err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !importResp.OK || importResp.TripID == "" {
		t.Fatalf("unexpected: %s", body)
	}

	// Export.
	req, _ = http.NewRequest(http.MethodGet,
		srv.URL+"/api/v1/trips/"+importResp.TripID+"/export.yaml", nil)
	req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp2.Body)
		t.Fatalf("export status = %d, body: %s", resp2.StatusCode, b)
	}

	exportBody, _ := io.ReadAll(resp2.Body)
	doc, err := portable.Unmarshal(exportBody)
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if doc.Name != "Imported Trip" {
		t.Errorf("name = %q", doc.Name)
	}
	if doc.StartDate != "2026-08-01" {
		t.Errorf("start_date = %q", doc.StartDate)
	}
	if len(doc.Travelers) != 1 || doc.Travelers[0].Name != "Andy" {
		t.Errorf("travelers = %+v", doc.Travelers)
	}
	if len(doc.Containers) != 1 || doc.Containers[0].Carrier != "Andy" {
		t.Errorf("containers = %+v", doc.Containers)
	}
	if len(doc.Items) != 2 {
		t.Fatalf("items = %d", len(doc.Items))
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

// FR-18.7: importing the same file twice is the ordinary case for a CLI
// import, and `templates` is UNIQUE on (owner_id, name) — the second one has
// to say so rather than answer an opaque 500.
func TestImportTemplate_NameAlreadyTaken_IsRefusedWithItsOwnCode(t *testing.T) {
	srv := newTestServer(t)
	body := "kind: template\nname: Twice\nitems:\n  - name: Socken\n    quantity: 1\n"

	post := func() (int, string) {
		req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/templates/import", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(raw)
	}

	if status, body := post(); status != http.StatusOK {
		t.Fatalf("first import: status = %d, body = %s", status, body)
	}
	status, answer := post()
	if status != http.StatusConflict {
		t.Errorf("second import: status = %d, want 409 — body: %s", status, answer)
	}
	if !strings.Contains(answer, "name_taken") {
		t.Errorf("answer does not carry its own code: %s", answer)
	}
	if !strings.Contains(answer, "Twice") {
		t.Errorf("answer does not name the template: %s", answer)
	}
}
