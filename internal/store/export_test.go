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

// seedComposedTemplate writes a Ferien-Vorlage that includes one group, with
// marks on all three levels and a preparation task on a group position — the
// fixture both §3.27 export promises are read from.
func seedComposedTemplate(t *testing.T, st *store.Store) {
	t.Helper()
	for _, q := range []string{
		`INSERT INTO templates (id, owner_id, name, kind, icon) VALUES ('tpl', 'u1', 'Fototage', 'template', '📷')`,
		`INSERT INTO templates (id, owner_id, name, kind, icon) VALUES ('grp', 'u1', 'Makro Fotografie', 'group', '⛺')`,
		`INSERT INTO template_includes (id, template_id, included_template_id) VALUES ('inc', 'tpl', 'grp')`,
		`INSERT INTO items (id, name, icon) VALUES ('cam', 'Kamera', '📸')`,
		`INSERT INTO items (id, name) VALUES ('ring', 'Ringlicht')`,
		`INSERT INTO items (id, name) VALUES ('med', 'Reiseapotheke')`,
		`INSERT INTO template_items (id, template_id, item_id, quantity) VALUES ('p1', 'grp', 'cam', 1)`,
		`INSERT INTO template_items (id, template_id, item_id, quantity) VALUES ('p2', 'grp', 'ring', 1)`,
		`INSERT INTO template_items (id, template_id, item_id, quantity) VALUES ('p3', 'tpl', 'med', 1)`,
		`INSERT INTO template_item_tasks (id, template_item_id, task) VALUES ('tk1', 'p1', 'Akkus laden')`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}
}

// A Ferien-Vorlage exports composed (FR-27.1, ADR-017): the groups it is made
// of travel *whole*, with their positions and each position's preparation
// tasks (FR-27.7), because a bare group name means nothing on the instance
// the file is opened on.
func TestExportTemplate_CarriesCompositionAndTasks(t *testing.T) {
	st := openTestStore(t)
	seedOwner(t, st)
	seedComposedTemplate(t, st)

	got, err := st.ExportTemplate(context.Background(), "tpl")
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
	if tasks := group.Items[0].Tasks; len(tasks) != 1 || tasks[0] != "Akkus laden" {
		t.Errorf("tasks = %+v, want [Akkus laden]", tasks)
	}
	if len(got.Items) != 1 || got.Items[0].Name != "Reiseapotheke" {
		t.Errorf("own items = %+v", got.Items)
	}
}

// FR-28.10: the mark is exported on all three levels. Without it the fold-back
// §3.27 depends on would strip the marks off a whole Vorlage, silently and
// irreversibly.
func TestExportTemplate_CarriesTheMark_FR28_10(t *testing.T) {
	st := openTestStore(t)
	seedOwner(t, st)
	seedComposedTemplate(t, st)

	got, err := st.ExportTemplate(context.Background(), "tpl")
	if err != nil {
		t.Fatalf("ExportTemplate: %v", err)
	}
	if got.Icon != "\U0001F4F7" {
		t.Errorf("template icon = %q, want the camera", got.Icon)
	}
	if got.Includes[0].Icon != "\u26FA" {
		t.Errorf("group icon = %q, want the tent", got.Includes[0].Icon)
	}
	if got.Includes[0].Items[0].Icon != "\U0001F4F8" {
		t.Errorf("item icon = %q, want the camera with flash", got.Includes[0].Items[0].Icon)
	}
	// An unmarked item stays unmarked rather than inheriting anything.
	if got.Items[0].Icon != "" {
		t.Errorf("own item came back marked %q", got.Items[0].Icon)
	}
}
