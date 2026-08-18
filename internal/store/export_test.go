package store_test

import (
	"context"
	"testing"

	"jitpack/internal/portable"
	"jitpack/internal/store"
)

func TestExportTemplate(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	// Seed a user, items, template, and template_items.
	for _, q := range []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u1', 'auth|u1', 'Alice')`,
		`INSERT INTO tags (id, name) VALUES ('cat1', 'Toiletries')`,
		`INSERT INTO items (id, name) VALUES ('i1', 'Toothbrush')`,
		`INSERT INTO items (id, name) VALUES ('i2', 'Sunscreen')`,
		// The tag is the item's primary one (FR-24.2) — position 0.
		`INSERT INTO item_tags (id, item_id, tag_id, position) VALUES ('it1', 'i1', 'cat1', 0)`,
		`INSERT INTO item_tags (id, item_id, tag_id, position) VALUES ('it2', 'i2', 'cat1', 0)`,
		`INSERT INTO templates (id, owner_id, name) VALUES ('t1', 'u1', 'Base Travel')`,
		`INSERT INTO template_items (id, template_id, item_id, quantity, assignment, conditions)
		 VALUES ('ti1', 't1', 'i1', 1, 'per_person', NULL)`,
		`INSERT INTO template_items (id, template_id, item_id, quantity, assignment, conditions)
		 VALUES ('ti2', 't1', 'i2', 2, 'trip_global', '{"season":["summer"]}')`,
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
	if doc.Items[0].Quantity != 2 {
		t.Errorf("items[0].quantity = %d", doc.Items[0].Quantity)
	}
	if doc.Items[0].Assignment != "trip_global" {
		t.Errorf("items[0].assignment = %q", doc.Items[0].Assignment)
	}
	if doc.Items[1].Name != "Toothbrush" {
		t.Errorf("items[1].name = %q", doc.Items[1].Name)
	}
}

func TestExportTemplate_NotFound(t *testing.T) {
	st := openTestStore(t)
	_, err := st.ExportTemplate(context.Background(), "nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent template")
	}
}

// seedOwner inserts the account every import needs as its owner.
func seedOwner(t *testing.T, st *store.Store) {
	t.Helper()
	if _, err := st.DB().Exec(
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u1', 'auth|u1', 'Alice')`); err != nil {
		t.Fatalf("seed user: %v", err)
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
			{Name: "Toothbrush", Quantity: 1, Assignment: "per_person"},
			{Name: "Sunscreen", Quantity: 2, Assignment: "trip_global",
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
		`INSERT INTO trips (id, name, year, start_date, end_date) VALUES ('trip1', 'Summer 2026', 2026, '2026-07-01', '2026-07-10')`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip1', 'u1', 'owner')`,
		`INSERT INTO travelers (id, trip_id, name) VALUES ('trav1', 'trip1', 'Andy')`,
		`INSERT INTO travelers (id, trip_id, name) VALUES ('trav2', 'trip1', 'Lisa')`,
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
			{Name: "Andy"},
		},
		Containers: []portable.Container{
			{Name: "Backpack", Carrier: "Andy", MaxWeightGrams: 8000},
		},
		Items: []portable.Item{
			{Name: "Toothbrush", Quantity: 1, Mode: "pack", Category: "Toiletries",
				Traveler: "Andy", Container: "Backpack"},
			{Name: "Socks", Quantity: 3, Mode: "buy_before"},
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

// TestExportImportTemplate_CarriesCompositionAndTasks is the §3.27 round trip
// (FR-27.1/27.7, ADR-017): a Ferien-Vorlage exported and imported again is
// still composed, and its positions still carry their preparation tasks.
func TestExportImportTemplate_CarriesCompositionAndTasks(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	seedOwner(t, st)

	source := portable.Document{
		Kind:          portable.KindTemplate,
		SchemaVersion: 1,
		Name:          "Fototage",
		Scope:         portable.ScopeTemplate,
		Includes: []portable.Group{{
			Name: "Makro Fotografie",
			Items: []portable.Item{
				{Name: "Kamera", Quantity: 1, Tasks: []string{"Akkus laden"}},
				{Name: "Ringlicht", Quantity: 1},
			},
		}},
		Items: []portable.Item{{Name: "Reiseapotheke", Quantity: 1}},
	}

	templateID, err := st.ImportTemplate(ctx, "u1", source)
	if err != nil {
		t.Fatalf("ImportTemplate: %v", err)
	}

	got, err := st.ExportTemplate(ctx, templateID)
	if err != nil {
		t.Fatalf("ExportTemplate: %v", err)
	}
	if got.Scope != portable.ScopeTemplate {
		t.Errorf("scope = %q, want template", got.Scope)
	}
	if len(got.Includes) != 1 {
		t.Fatalf("includes = %d, want 1", len(got.Includes))
	}
	group := got.Includes[0]
	if group.Name != "Makro Fotografie" {
		t.Errorf("group name = %q", group.Name)
	}
	if len(group.Items) != 2 {
		t.Fatalf("group items = %d, want 2", len(group.Items))
	}
	if got := group.Items[0].Tasks; len(got) != 1 || got[0] != "Akkus laden" {
		t.Errorf("tasks = %+v, want [Akkus laden]", got)
	}
	if len(got.Items) != 1 || got.Items[0].Name != "Reiseapotheke" {
		t.Errorf("own items = %+v", got.Items)
	}
}

// TestImportTemplate_LinksAnExistingGroupWithoutRewritingIt is the rule that
// keeps an import from reaching other people's trips: a group of the same name
// is *linked*, and its contents are left exactly as they are. Overwriting it
// would edit every Ferien-Vorlage that includes it and, through FR-27.4, every
// trip that follows one.
func TestImportTemplate_LinksAnExistingGroupWithoutRewritingIt(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	seedOwner(t, st)

	existingID, err := st.ImportTemplate(ctx, "u1", portable.Document{
		Kind:  portable.KindTemplate,
		Name:  "Makro Fotografie",
		Scope: portable.ScopeGroup,
		Items: []portable.Item{{Name: "Kamera", Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("seed group: %v", err)
	}

	vorlageID, err := st.ImportTemplate(ctx, "u1", portable.Document{
		Kind:  portable.KindTemplate,
		Name:  "Fototage",
		Scope: portable.ScopeTemplate,
		Includes: []portable.Group{{
			Name:  "Makro Fotografie",
			Items: []portable.Item{{Name: "Stativ", Quantity: 1}},
		}},
	})
	if err != nil {
		t.Fatalf("import vorlage: %v", err)
	}

	// Linked, not duplicated: one group of that name exists.
	var groups int
	if err := st.DB().QueryRow(
		`SELECT COUNT(*) FROM templates WHERE name = 'Makro Fotografie'`).Scan(&groups); err != nil {
		t.Fatalf("count groups: %v", err)
	}
	if groups != 1 {
		t.Errorf("groups named Makro Fotografie = %d, want 1", groups)
	}

	var includes int
	if err := st.DB().QueryRow(
		`SELECT COUNT(*) FROM template_includes WHERE template_id = ? AND included_template_id = ?`,
		vorlageID, existingID).Scan(&includes); err != nil {
		t.Fatalf("count includes: %v", err)
	}
	if includes != 1 {
		t.Errorf("include rows = %d, want 1", includes)
	}

	// And untouched: the file's "Stativ" did not join the existing group.
	existing, err := st.ExportTemplate(ctx, existingID)
	if err != nil {
		t.Fatalf("export existing: %v", err)
	}
	if len(existing.Items) != 1 || existing.Items[0].Name != "Kamera" {
		t.Errorf("existing group was rewritten: %+v", existing.Items)
	}
}

// TestImportTemplate_LinksAGroupDocumentToTheExistingGroup pins ADR-017's
// identity rule on a group's *own* document, not only on the groups a
// Ferien-Vorlage carries nested: a backup names the same group both ways, so
// importing the standalone document must land on the group already here
// rather than on a second copy of it.
func TestImportTemplate_LinksAGroupDocumentToTheExistingGroup(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	seedOwner(t, st)

	first, err := st.ImportTemplate(ctx, "u1", portable.Document{
		Kind:  portable.KindTemplate,
		Scope: portable.ScopeGroup,
		Name:  "Makro Fotografie",
		Items: []portable.Item{{Name: "Stativ", Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("seed group: %v", err)
	}

	second, err := st.ImportTemplate(ctx, "u1", portable.Document{
		Kind:  portable.KindTemplate,
		Scope: portable.ScopeGroup,
		Name:  "Makro Fotografie",
		Items: []portable.Item{{Name: "Kamera", Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("import group document again: %v", err)
	}
	if second != first {
		t.Fatalf("group document created a second group: %q then %q", first, second)
	}

	var groups int
	if err := st.DB().QueryRow(
		`SELECT count(*) FROM templates WHERE kind = ?`, portable.ScopeGroup).Scan(&groups); err != nil {
		t.Fatalf("count groups: %v", err)
	}
	if groups != 1 {
		t.Fatalf("groups = %d, want 1", groups)
	}

	// Linked, not rewritten: the second file's Kamera did not join the group.
	var names string
	if err := st.DB().QueryRow(`
		SELECT group_concat(i.name)
		FROM template_items ti JOIN items i ON i.id = ti.item_id
		WHERE ti.template_id = ?`, first).Scan(&names); err != nil {
		t.Fatalf("read positions: %v", err)
	}
	if names != "Stativ" {
		t.Fatalf("positions = %q, want %q", names, "Stativ")
	}
}
