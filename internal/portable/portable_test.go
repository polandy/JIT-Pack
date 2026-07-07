package portable_test

import (
	"testing"

	"jitpack/internal/portable"
)

func TestMarshalTemplate_RoundTrip(t *testing.T) {
	doc := portable.Document{
		Kind:          "template",
		SchemaVersion: 1,
		Name:          "Base Travel",
		Items: []portable.Item{
			{Name: "Toothbrush", Quantity: "1", Assignment: "per_person", Unit: "pieces"},
			{Name: "Sunscreen", Quantity: "ceil(trip_duration / 7)", Unit: "pieces",
				Conditions: map[string]any{"season": []any{"summer"}}},
		},
	}

	data, err := portable.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	got, err := portable.Unmarshal(data)
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if got.Kind != doc.Kind {
		t.Errorf("kind = %q, want %q", got.Kind, doc.Kind)
	}
	if got.SchemaVersion != doc.SchemaVersion {
		t.Errorf("schema_version = %d, want %d", got.SchemaVersion, doc.SchemaVersion)
	}
	if got.Name != doc.Name {
		t.Errorf("name = %q, want %q", got.Name, doc.Name)
	}
	if len(got.Items) != 2 {
		t.Fatalf("items count = %d, want 2", len(got.Items))
	}
	if got.Items[0].Name != "Toothbrush" {
		t.Errorf("items[0].name = %q, want Toothbrush", got.Items[0].Name)
	}
	if got.Items[1].Quantity != "ceil(trip_duration / 7)" {
		t.Errorf("items[1].quantity = %q, want formula", got.Items[1].Quantity)
	}
}

func TestMarshalTrip_RoundTrip(t *testing.T) {
	doc := portable.Document{
		Kind:          "trip",
		SchemaVersion: 1,
		Name:          "Summer 2026",
		StartDate:     "2026-07-01",
		EndDate:       "2026-07-10",
		Travelers: []portable.Traveler{
			{Name: "Andy", Profile: "adult"},
			{Name: "Lisa", Profile: "child"},
		},
		Containers: []portable.Container{
			{Name: "Backpack", Carrier: "Andy", MaxWeightGrams: 8000},
		},
		Items: []portable.Item{
			{Name: "Toothbrush", Quantity: "1", Mode: "pack", Category: "Toiletries",
				Traveler: "Andy", Container: "Backpack", PackedCount: intPtr(0)},
		},
	}

	data, err := portable.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	got, err := portable.Unmarshal(data)
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if got.Kind != "trip" {
		t.Errorf("kind = %q, want trip", got.Kind)
	}
	if got.StartDate != "2026-07-01" {
		t.Errorf("start_date = %q", got.StartDate)
	}
	if len(got.Travelers) != 2 {
		t.Fatalf("travelers = %d, want 2", len(got.Travelers))
	}
	if got.Travelers[0].Name != "Andy" {
		t.Errorf("travelers[0] = %q", got.Travelers[0].Name)
	}
	if len(got.Containers) != 1 {
		t.Fatalf("containers = %d, want 1", len(got.Containers))
	}
	if got.Containers[0].MaxWeightGrams != 8000 {
		t.Errorf("max_weight = %d", got.Containers[0].MaxWeightGrams)
	}
	if len(got.Items) != 1 {
		t.Fatalf("items = %d, want 1", len(got.Items))
	}
	if got.Items[0].Container != "Backpack" {
		t.Errorf("container = %q", got.Items[0].Container)
	}
}

func TestUnmarshal_InvalidYAML(t *testing.T) {
	_, err := portable.Unmarshal([]byte(":::bad"))
	if err == nil {
		t.Error("expected error for invalid YAML")
	}
}

func TestUnmarshal_MissingKind(t *testing.T) {
	_, err := portable.Unmarshal([]byte("schema_version: 1\nname: X\n"))
	if err == nil {
		t.Error("expected error for missing kind")
	}
}

func TestUnmarshal_MissingName(t *testing.T) {
	_, err := portable.Unmarshal([]byte("kind: template\nschema_version: 1\n"))
	if err == nil {
		t.Error("expected error for missing name")
	}
}

func TestUnmarshal_UnknownKind(t *testing.T) {
	_, err := portable.Unmarshal([]byte("kind: spaceship\nschema_version: 1\nname: X\n"))
	if err == nil {
		t.Error("expected error for unknown kind")
	}
}

func TestUnmarshal_UnrecognizedFieldsIgnored(t *testing.T) {
	// FR-18.5: imports ignore unrecognized fields.
	yaml := "kind: template\nschema_version: 99\nname: Future\nfuture_field: yes\nitems:\n  - name: Foo\n    quantity: \"1\"\n    alien_attr: 42\n"
	doc, err := portable.Unmarshal([]byte(yaml))
	if err != nil {
		t.Fatalf("should not fail on unrecognized fields: %v", err)
	}
	if doc.Name != "Future" {
		t.Errorf("name = %q", doc.Name)
	}
}

func TestMarshalTrip_WithoutProgress(t *testing.T) {
	doc := portable.Document{
		Kind:          "trip",
		SchemaVersion: 1,
		Name:          "Clean Export",
		StartDate:     "2026-01-01",
		EndDate:       "2026-01-05",
		Items: []portable.Item{
			{Name: "Socks", Quantity: "3", Mode: "pack"},
		},
	}

	data, err := portable.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// packed_count should be omitted when nil.
	got, err := portable.Unmarshal(data)
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.Items[0].PackedCount != nil {
		t.Error("packed_count should be nil for clean export")
	}
}

func intPtr(n int) *int { return &n }
