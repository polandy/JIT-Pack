package store

import (
	"context"
	crand "crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"

	"jitpack/internal/portable"
)

// ExportTemplate builds a portable Document from a stored template,
// stripping all instance-specific identifiers (FR-18.2).
func (s *Store) ExportTemplate(ctx context.Context, templateID string) (portable.Document, error) {
	var name, kind string
	var icon sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT name, kind, `+MarkColumn+` FROM templates WHERE id = ?`,
		templateID).Scan(&name, &kind, &icon)
	if err != nil {
		return portable.Document{}, fmt.Errorf("template %s: %w", templateID, err)
	}

	items, err := templatePositions(ctx, s.db, templateID)
	if err != nil {
		return portable.Document{}, err
	}

	// FR-27.1: a Ferien-Vorlage travels with its groups (ADR-017). A group
	// document carries none by definition, and asking anyway would return an
	// empty list — the query is skipped so the file shape says which it is.
	var includes []portable.Group
	if kind == portable.ScopeTemplate {
		includes, err = includedGroups(ctx, s.db, templateID)
		if err != nil {
			return portable.Document{}, err
		}
	}

	return portable.Document{
		Kind:          portable.KindTemplate,
		SchemaVersion: 1,
		Name:          name,
		Scope:         kind,
		Icon:          icon.String,
		Includes:      includes,
		Items:         items,
	}, nil
}

// templatePositions reads one template's own positions with their FR-27.7
// preparation tasks, name-ordered so two exports of the same template are the
// same file.
func templatePositions(ctx context.Context, db *sql.DB, templateID string) ([]portable.Item, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT ti.id, i.name, i.`+MarkColumn+`, ti.quantity, ti.assignment,
		       ti.conditions, ti.default_mode, ti.late_packer, ti.dedup
		FROM template_items ti
		JOIN items i ON i.id = ti.item_id
		WHERE ti.template_id = ?
		ORDER BY i.name`, templateID)
	if err != nil {
		return nil, fmt.Errorf("template items: %w", err)
	}
	defer rows.Close()

	var items []portable.Item
	positionIDs := make([]string, 0)
	for rows.Next() {
		var it portable.Item
		var positionID string
		var conditions, icon sql.NullString
		var latePacker, quantity int
		if err := rows.Scan(&positionID, &it.Name, &icon, &quantity, &it.Assignment,
			&conditions, &it.DefaultMode, &latePacker, &it.Dedup); err != nil {
			return nil, fmt.Errorf("scan template item: %w", err)
		}
		it.Icon = icon.String
		it.Quantity = portable.Quantity(quantity)
		it.LatePacker = latePacker == 1
		if conditions.Valid && conditions.String != "" {
			var cond map[string]any
			if err := json.Unmarshal([]byte(conditions.String), &cond); err == nil {
				it.Conditions = cond
			}
		}
		items = append(items, it)
		positionIDs = append(positionIDs, positionID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate template items: %w", err)
	}

	for i, positionID := range positionIDs {
		tasks, err := positionTasks(ctx, db, positionID)
		if err != nil {
			return nil, err
		}
		items[i].Tasks = tasks
	}
	return items, nil
}

// positionTasks reads the FR-27.7 tasks of one position, in insertion order —
// a task list is a checklist, and reordering it changes what it says.
func positionTasks(ctx context.Context, db *sql.DB, positionID string) ([]string, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT task FROM template_item_tasks WHERE template_item_id = ? ORDER BY rowid`, positionID)
	if err != nil {
		return nil, fmt.Errorf("position tasks: %w", err)
	}
	defer rows.Close()

	var tasks []string
	for rows.Next() {
		var task string
		if err := rows.Scan(&task); err != nil {
			return nil, fmt.Errorf("scan task: %w", err)
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

// includedGroups reads a Ferien-Vorlage's groups whole (FR-27.1/ADR-017).
func includedGroups(ctx context.Context, db *sql.DB, templateID string) ([]portable.Group, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT g.id, g.name, g.`+MarkColumn+`
		FROM template_includes inc
		JOIN templates g ON g.id = inc.included_template_id
		WHERE inc.template_id = ?
		ORDER BY g.name`, templateID)
	if err != nil {
		return nil, fmt.Errorf("template includes: %w", err)
	}
	defer rows.Close()

	type ref struct{ id, name, icon string }
	var refs []ref
	for rows.Next() {
		var r ref
		var icon sql.NullString
		if err := rows.Scan(&r.id, &r.name, &icon); err != nil {
			return nil, fmt.Errorf("scan include: %w", err)
		}
		r.icon = icon.String
		refs = append(refs, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate includes: %w", err)
	}

	groups := make([]portable.Group, 0, len(refs))
	for _, r := range refs {
		items, err := templatePositions(ctx, db, r.id)
		if err != nil {
			return nil, err
		}
		groups = append(groups, portable.Group{Name: r.name, Icon: r.icon, Items: items})
	}
	return groups, nil
}

// ExportTrip builds a portable Document from a stored trip (FR-18.3).
// If includeProgress is true, packed_count is included; otherwise it is omitted.
func (s *Store) ExportTrip(ctx context.Context, tripID string, includeProgress bool) (portable.Document, error) {
	var name string
	var year int
	var startDate, endDate sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT name, year, start_date, end_date FROM trips WHERE id = ?`, tripID).
		Scan(&name, &year, &startDate, &endDate)
	if err != nil {
		return portable.Document{}, fmt.Errorf("trip %s: %w", tripID, err)
	}

	travelers, travelerNames, err := s.loadTravelers(ctx, tripID)
	if err != nil {
		return portable.Document{}, err
	}

	containers, containerNames, err := s.loadContainers(ctx, tripID, travelerNames)
	if err != nil {
		return portable.Document{}, err
	}

	items, err := s.loadTripItemsForExport(ctx, tripID, includeProgress, travelerNames, containerNames)
	if err != nil {
		return portable.Document{}, err
	}

	return portable.Document{
		Kind:          "trip",
		SchemaVersion: 1,
		Name:          name,
		StartDate:     startDate.String,
		EndDate:       endDate.String,
		Year:          year,
		Travelers:     travelers,
		Containers:    containers,
		Items:         items,
	}, nil
}

func (s *Store) loadTravelers(ctx context.Context, tripID string) ([]portable.Traveler, map[string]string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name FROM travelers WHERE trip_id = ? ORDER BY name`, tripID)
	if err != nil {
		return nil, nil, fmt.Errorf("travelers: %w", err)
	}
	defer rows.Close()

	var travelers []portable.Traveler
	names := map[string]string{} // id -> name
	for rows.Next() {
		var id string
		var t portable.Traveler
		if err := rows.Scan(&id, &t.Name); err != nil {
			return nil, nil, fmt.Errorf("scan traveler: %w", err)
		}
		travelers = append(travelers, t)
		names[id] = t.Name
	}
	return travelers, names, rows.Err()
}

func (s *Store) loadContainers(ctx context.Context, tripID string, travelerNames map[string]string) ([]portable.Container, map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, carrier_traveler_id, max_weight_grams
		FROM containers WHERE trip_id = ? ORDER BY name`, tripID)
	if err != nil {
		return nil, nil, fmt.Errorf("containers: %w", err)
	}
	defer rows.Close()

	var containers []portable.Container
	names := map[string]string{} // id -> name
	for rows.Next() {
		var id string
		var c portable.Container
		var carrierID sql.NullString
		var maxWeight sql.NullInt64
		if err := rows.Scan(&id, &c.Name, &carrierID, &maxWeight); err != nil {
			return nil, nil, fmt.Errorf("scan container: %w", err)
		}
		if carrierID.Valid {
			c.Carrier = travelerNames[carrierID.String]
		}
		if maxWeight.Valid {
			c.MaxWeightGrams = int(maxWeight.Int64)
		}
		containers = append(containers, c)
		names[id] = c.Name
	}
	return containers, names, rows.Err()
}

func (s *Store) loadTripItemsForExport(ctx context.Context, tripID string, includeProgress bool,
	travelerNames, containerNames map[string]string) ([]portable.Item, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT name, quantity, packed_count, mode, category_name,
		       assigned_traveler_id, container_id, late_packer
		FROM trip_items WHERE trip_id = ? ORDER BY name`, tripID)
	if err != nil {
		return nil, fmt.Errorf("trip items: %w", err)
	}
	defer rows.Close()

	var items []portable.Item
	for rows.Next() {
		var it portable.Item
		var quantity, packedCount int
		var category, travelerID, containerID sql.NullString
		var latePacker int
		if err := rows.Scan(&it.Name, &quantity, &packedCount, &it.Mode, &category,
			&travelerID, &containerID, &latePacker); err != nil {
			return nil, fmt.Errorf("scan trip item: %w", err)
		}
		it.Quantity = portable.Quantity(quantity)
		if includeProgress {
			pc := packedCount
			it.PackedCount = &pc
		}
		if category.Valid {
			it.Category = category.String
		}
		if travelerID.Valid {
			it.Traveler = travelerNames[travelerID.String]
		}
		if containerID.Valid {
			it.Container = containerNames[containerID.String]
		}
		it.LatePacker = latePacker == 1
		items = append(items, it)
	}
	return items, rows.Err()
}

// nullIfEmpty keeps an absent mark out of the column: absence is a
// first-class state (FR-28.1), and an empty string is a value that says the
// user chose one.
func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// randomID generates a random hex ID matching the schema default.
func randomID() string {
	// Use crypto/rand for proper randomness.
	var b [16]byte
	// We use the sql default pattern: lower(hex(randomblob(16)))
	// but generate it in Go to avoid an extra round-trip.
	_, _ = crand.Read(b[:])
	return fmt.Sprintf("%x", b)
}
