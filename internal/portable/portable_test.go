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
			{Name: "Toothbrush", Quantity: 1, Assignment: "per_person"},
			{Name: "Sunscreen", Quantity: 2,
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
	if got.Items[1].Quantity != 2 {
		t.Errorf("items[1].quantity = %d, want 2", got.Items[1].Quantity)
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
			{Name: "Andy"},
			{Name: "Lisa"},
		},
		Containers: []portable.Container{
			{Name: "Backpack", Carrier: "Andy", MaxWeightGrams: 8000},
		},
		Items: []portable.Item{
			{Name: "Toothbrush", Quantity: 1, Mode: "pack", Category: "Toiletries",
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
			{Name: "Socks", Quantity: 3, Mode: "pack"},
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

// FR-27.1: a group must survive the round trip as a group. Without the scope
// field it would import as a Ferien-Vorlage — the same name, the wrong thing.
func TestMarshalUnmarshal_TemplateScopeRoundTrips(t *testing.T) {
	doc := portable.Document{
		Kind:          "template",
		SchemaVersion: 1,
		Name:          "Makro",
		Scope:         "group",
		Items:         []portable.Item{},
	}
	data, err := portable.Marshal(doc)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	got, err := portable.Unmarshal(data)
	if err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if got.Scope != "group" {
		t.Errorf("scope = %q, want group", got.Scope)
	}
}

func TestUnmarshal_ScopeOmittedIsNotAnError(t *testing.T) {
	// Files written before scopes existed carry none; migration 016 reads
	// those rows as Ferien-Vorlagen, and so does the importer.
	got, err := portable.Unmarshal([]byte("kind: template\nschema_version: 1\nname: Sommer\nitems: []\n"))
	if err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if got.Scope != "" {
		t.Errorf("scope = %q, want empty", got.Scope)
	}
}

func TestUnmarshal_UnknownScopeRejected(t *testing.T) {
	_, err := portable.Unmarshal([]byte("kind: template\nschema_version: 1\nname: Sommer\nscope: folder\nitems: []\n"))
	if err == nil {
		t.Error("expected error for unknown scope")
	}
}

func TestUnmarshal_ScopeOnTripRejected(t *testing.T) {
	_, err := portable.Unmarshal([]byte("kind: trip\nschema_version: 1\nname: Samedan\nscope: group\nitems: []\n"))
	if err == nil {
		t.Error("expected error for scope on a trip document")
	}
}

// A Ferien-Vorlage is nothing without its groups (FR-27.1), so the file
// carries them whole rather than by name: FR-18.2 promises a file that can be
// posted in a forum and imported into a different instance, and a reference
// to a group that instance has never heard of imports as an empty shell.
func TestMarshalUnmarshal_CarriesIncludedGroupsWithTheirItems(t *testing.T) {
	doc := portable.Document{
		Kind:          portable.KindTemplate,
		SchemaVersion: 1,
		Name:          "Fototage",
		Scope:         portable.ScopeTemplate,
		Includes: []portable.Group{{
			Name: "Makro Fotografie",
			Items: []portable.Item{{
				Name:     "Kamera",
				Quantity: 1,
				Tasks:    []string{"Akkus laden"},
			}},
		}},
		Items: []portable.Item{{Name: "Reiseapotheke", Quantity: 1}},
	}

	data, err := portable.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	back, err := portable.Unmarshal(data)
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if len(back.Includes) != 1 {
		t.Fatalf("includes: got %d, want 1", len(back.Includes))
	}
	group := back.Includes[0]
	if group.Name != "Makro Fotografie" {
		t.Errorf("group name: got %q", group.Name)
	}
	if len(group.Items) != 1 || group.Items[0].Name != "Kamera" {
		t.Fatalf("group items: got %+v", group.Items)
	}
	// FR-27.7: a position's preparation tasks are part of the shape, or the
	// knowledge the group exists to carry stays on the device that wrote it.
	if got := group.Items[0].Tasks; len(got) != 1 || got[0] != "Akkus laden" {
		t.Errorf("tasks: got %+v", got)
	}
	if len(back.Items) != 1 || back.Items[0].Name != "Reiseapotheke" {
		t.Errorf("own items: got %+v", back.Items)
	}
}

func TestUnmarshal_RejectsIncludesOnATrip(t *testing.T) {
	// A trip has no composition — it is the *result* of one. A file claiming
	// otherwise was written by something this build does not understand.
	data := []byte("kind: trip\nname: Engadin\nyear: 2026\nincludes:\n  - name: Makro\n")

	if _, err := portable.Unmarshal(data); err == nil {
		t.Fatal("expected an error for includes on a trip document")
	}
}

func TestUnmarshal_RejectsIncludesOnAGroup(t *testing.T) {
	// Two levels, structurally (FR-27.1): a group holds positions, never
	// other groups. Accepting this would import a cycle the schema forbids.
	data := []byte("kind: template\nscope: group\nname: Makro\nincludes:\n  - name: Wildlife\n")

	if _, err := portable.Unmarshal(data); err == nil {
		t.Fatal("expected an error for includes on a group document")
	}
}

func TestUnmarshal_RejectsAnUnnamedIncludedGroup(t *testing.T) {
	// The name is the group's whole identity across instances (see ADR-017);
	// without one there is nothing to link to and nothing to create.
	data := []byte("kind: template\nname: Fototage\nincludes:\n  - items: []\n")

	if _, err := portable.Unmarshal(data); err == nil {
		t.Fatal("expected an error for an included group with no name")
	}
}
