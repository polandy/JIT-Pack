package store_test

import (
	"context"
	"testing"

	"jitpack/internal/portable"
)

func TestExportTemplate(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	// Seed a user, items, template, and template_items.
	for _, q := range []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u1', 'auth|u1', 'Alice')`,
		`INSERT INTO categories (id, name) VALUES ('cat1', 'Toiletries')`,
		`INSERT INTO items (id, name, category_id, unit) VALUES ('i1', 'Toothbrush', 'cat1', 'pieces')`,
		`INSERT INTO items (id, name, category_id, unit) VALUES ('i2', 'Sunscreen', 'cat1', 'pieces')`,
		`INSERT INTO templates (id, owner_id, name) VALUES ('t1', 'u1', 'Base Travel')`,
		`INSERT INTO template_items (id, template_id, item_id, quantity_formula, assignment, conditions)
		 VALUES ('ti1', 't1', 'i1', '1', 'per_person', NULL)`,
		`INSERT INTO template_items (id, template_id, item_id, quantity_formula, assignment, conditions)
		 VALUES ('ti2', 't1', 'i2', 'ceil(trip_duration / 7)', 'trip_global', '{"season":["summer"]}')`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	doc, err := st.ExportTemplate(ctx, "t1")
	if err != nil {
		t.Fatalf("ExportTemplate: %v", err)
	}
	if doc.Kind != "template" {
		t.Errorf("kind = %q, want template", doc.Kind)
	}
	if doc.SchemaVersion != 1 {
		t.Errorf("schema_version = %d, want 1", doc.SchemaVersion)
	}
	if doc.Name != "Base Travel" {
		t.Errorf("name = %q", doc.Name)
	}
	if len(doc.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(doc.Items))
	}

	// Items are ordered by name.
	if doc.Items[0].Name != "Sunscreen" {
		t.Errorf("items[0].name = %q, want Sunscreen", doc.Items[0].Name)
	}
	if doc.Items[0].Quantity != "ceil(trip_duration / 7)" {
		t.Errorf("items[0].quantity = %q", doc.Items[0].Quantity)
	}
	if doc.Items[0].Assignment != "trip_global" {
		t.Errorf("items[0].assignment = %q", doc.Items[0].Assignment)
	}
	if doc.Items[1].Name != "Toothbrush" {
		t.Errorf("items[1].name = %q", doc.Items[1].Name)
	}
	if doc.Items[1].Unit != "pieces" {
		t.Errorf("items[1].unit = %q", doc.Items[1].Unit)
	}
}

func TestExportTemplate_NotFound(t *testing.T) {
	st := openTestStore(t)
	_, err := st.ExportTemplate(context.Background(), "nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent template")
	}
}

func TestImportTemplate(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	// Seed owner user.
	if _, err := st.DB().Exec(
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u1', 'auth|u1', 'Alice')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	doc := portable.Document{
		Kind:          "template",
		SchemaVersion: 1,
		Name:          "Imported Template",
		Items: []portable.Item{
			{Name: "Toothbrush", Quantity: "1", Assignment: "per_person", Unit: "pieces"},
			{Name: "Sunscreen", Quantity: "2", Assignment: "trip_global", Unit: "pieces",
				DefaultMode: "buy_before", LatePacker: true, Dedup: "sum"},
		},
	}

	templateID, err := st.ImportTemplate(ctx, "u1", doc)
	if err != nil {
		t.Fatalf("ImportTemplate: %v", err)
	}
	if templateID == "" {
		t.Fatal("templateID is empty")
	}

	// Verify by re-exporting.
	got, err := st.ExportTemplate(ctx, templateID)
	if err != nil {
		t.Fatalf("re-export: %v", err)
	}
	if got.Name != "Imported Template" {
		t.Errorf("name = %q", got.Name)
	}
	if len(got.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(got.Items))
	}
	// Items sorted by name.
	if got.Items[0].Name != "Sunscreen" {
		t.Errorf("items[0].name = %q", got.Items[0].Name)
	}
	if got.Items[0].DefaultMode != "buy_before" {
		t.Errorf("items[0].default_mode = %q", got.Items[0].DefaultMode)
	}
	if !got.Items[0].LatePacker {
		t.Error("items[0].late_packer should be true")
	}
	if got.Items[0].Dedup != "sum" {
		t.Errorf("items[0].dedup = %q", got.Items[0].Dedup)
	}
}

func TestExportTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	for _, q := range []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u1', 'auth|u1', 'Alice')`,
		`INSERT INTO trips (id, name, start_date, end_date) VALUES ('trip1', 'Summer 2026', '2026-07-01', '2026-07-10')`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip1', 'u1', 'owner')`,
		`INSERT INTO travelers (id, trip_id, name, profile) VALUES ('trav1', 'trip1', 'Andy', 'adult')`,
		`INSERT INTO travelers (id, trip_id, name, profile) VALUES ('trav2', 'trip1', 'Lisa', 'child')`,
		`INSERT INTO containers (id, trip_id, name, carrier_traveler_id, max_weight_grams) VALUES ('c1', 'trip1', 'Backpack', 'trav1', 8000)`,
		`INSERT INTO trip_items (id, trip_id, name, quantity, packed_count, mode, category_name, assigned_traveler_id, container_id, updated_hlc)
		 VALUES ('ti1', 'trip1', 'Toothbrush', 1, 0, 'pack', 'Toiletries', 'trav1', 'c1', '0001')`,
		`INSERT INTO trip_items (id, trip_id, name, quantity, packed_count, mode, category_name, updated_hlc)
		 VALUES ('ti2', 'trip1', 'Socks', 3, 2, 'pack', 'Clothing', '0002')`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	t.Run("with progress", func(t *testing.T) {
		doc, err := st.ExportTrip(ctx, "trip1", true)
		if err != nil {
			t.Fatalf("ExportTrip: %v", err)
		}
		if doc.Kind != "trip" {
			t.Errorf("kind = %q", doc.Kind)
		}
		if doc.Name != "Summer 2026" {
			t.Errorf("name = %q", doc.Name)
		}
		if doc.StartDate != "2026-07-01" {
			t.Errorf("start_date = %q", doc.StartDate)
		}
		if len(doc.Travelers) != 2 {
			t.Fatalf("travelers = %d", len(doc.Travelers))
		}
		if len(doc.Containers) != 1 {
			t.Fatalf("containers = %d", len(doc.Containers))
		}
		if doc.Containers[0].Carrier != "Andy" {
			t.Errorf("carrier = %q, want Andy", doc.Containers[0].Carrier)
		}
		if len(doc.Items) != 2 {
			t.Fatalf("items = %d", len(doc.Items))
		}
		// Items sorted by name.
		if doc.Items[0].Name != "Socks" {
			t.Errorf("items[0].name = %q", doc.Items[0].Name)
		}
		if doc.Items[0].PackedCount == nil || *doc.Items[0].PackedCount != 2 {
			t.Errorf("items[0].packed_count = %v, want 2", doc.Items[0].PackedCount)
		}
		if doc.Items[1].Traveler != "Andy" {
			t.Errorf("items[1].traveler = %q", doc.Items[1].Traveler)
		}
		if doc.Items[1].Container != "Backpack" {
			t.Errorf("items[1].container = %q", doc.Items[1].Container)
		}
	})

	t.Run("without progress", func(t *testing.T) {
		doc, err := st.ExportTrip(ctx, "trip1", false)
		if err != nil {
			t.Fatalf("ExportTrip: %v", err)
		}
		for _, item := range doc.Items {
			if item.PackedCount != nil {
				t.Errorf("item %q: packed_count should be nil without progress", item.Name)
			}
		}
	})
}

func TestExportTrip_NotFound(t *testing.T) {
	st := openTestStore(t)
	_, err := st.ExportTrip(context.Background(), "nonexistent", false)
	if err == nil {
		t.Error("expected error for nonexistent trip")
	}
}

func TestImportTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	// Seed owner user.
	if _, err := st.DB().Exec(
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u1', 'auth|u1', 'Alice')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	doc := portable.Document{
		Kind:          "trip",
		SchemaVersion: 1,
		Name:          "Imported Trip",
		StartDate:     "2026-08-01",
		EndDate:       "2026-08-10",
		Travelers: []portable.Traveler{
			{Name: "Andy", Profile: "adult"},
		},
		Containers: []portable.Container{
			{Name: "Backpack", Carrier: "Andy", MaxWeightGrams: 8000},
		},
		Items: []portable.Item{
			{Name: "Toothbrush", Quantity: "1", Mode: "pack", Category: "Toiletries",
				Traveler: "Andy", Container: "Backpack"},
			{Name: "Socks", Quantity: "3", Mode: "buy_before"},
		},
	}

	tripID, err := st.ImportTrip(ctx, "u1", doc)
	if err != nil {
		t.Fatalf("ImportTrip: %v", err)
	}
	if tripID == "" {
		t.Fatal("tripID is empty")
	}

	// Verify by re-exporting.
	got, err := st.ExportTrip(ctx, tripID, false)
	if err != nil {
		t.Fatalf("re-export: %v", err)
	}
	if got.Name != "Imported Trip" {
		t.Errorf("name = %q", got.Name)
	}
	if got.StartDate != "2026-08-01" {
		t.Errorf("start_date = %q", got.StartDate)
	}
	if len(got.Travelers) != 1 {
		t.Fatalf("travelers = %d", len(got.Travelers))
	}
	if got.Travelers[0].Name != "Andy" {
		t.Errorf("traveler = %q", got.Travelers[0].Name)
	}
	if len(got.Containers) != 1 {
		t.Fatalf("containers = %d", len(got.Containers))
	}
	if got.Containers[0].Carrier != "Andy" {
		t.Errorf("carrier = %q", got.Containers[0].Carrier)
	}
	if got.Containers[0].MaxWeightGrams != 8000 {
		t.Errorf("max_weight = %d", got.Containers[0].MaxWeightGrams)
	}
	if len(got.Items) != 2 {
		t.Fatalf("items = %d", len(got.Items))
	}
	// Items sorted by name.
	if got.Items[0].Name != "Socks" {
		t.Errorf("items[0].name = %q", got.Items[0].Name)
	}
	if got.Items[0].Mode != "buy_before" {
		t.Errorf("items[0].mode = %q", got.Items[0].Mode)
	}
	if got.Items[1].Traveler != "Andy" {
		t.Errorf("items[1].traveler = %q", got.Items[1].Traveler)
	}
	if got.Items[1].Container != "Backpack" {
		t.Errorf("items[1].container = %q", got.Items[1].Container)
	}
}
