package store

import (
	"context"
	crand "crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"

	"jitpack/internal/portable"
)

// ExportTemplate builds a portable Document from a stored template,
// stripping all instance-specific identifiers (FR-18.2).
func (s *Store) ExportTemplate(ctx context.Context, templateID string) (portable.Document, error) {
	var name string
	err := s.db.QueryRowContext(ctx,
		`SELECT name FROM templates WHERE id = ?`, templateID).Scan(&name)
	if err != nil {
		return portable.Document{}, fmt.Errorf("template %s: %w", templateID, err)
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT i.name, ti.quantity_formula, ti.assignment, i.unit,
		       ti.conditions, ti.default_mode, ti.late_packer, ti.dedup
		FROM template_items ti
		JOIN items i ON i.id = ti.item_id
		WHERE ti.template_id = ?
		ORDER BY i.name`, templateID)
	if err != nil {
		return portable.Document{}, fmt.Errorf("template items: %w", err)
	}
	defer rows.Close()

	var items []portable.Item
	for rows.Next() {
		var it portable.Item
		var conditions sql.NullString
		var latePacker int
		if err := rows.Scan(&it.Name, &it.Quantity, &it.Assignment, &it.Unit,
			&conditions, &it.DefaultMode, &latePacker, &it.Dedup); err != nil {
			return portable.Document{}, fmt.Errorf("scan template item: %w", err)
		}
		it.LatePacker = latePacker == 1
		if conditions.Valid && conditions.String != "" {
			var cond map[string]any
			if err := json.Unmarshal([]byte(conditions.String), &cond); err == nil {
				it.Conditions = cond
			}
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return portable.Document{}, fmt.Errorf("iterate template items: %w", err)
	}

	return portable.Document{
		Kind:          "template",
		SchemaVersion: 1,
		Name:          name,
		Items:         items,
	}, nil
}

// ImportTemplate creates a new template from a portable Document (FR-18.4).
// Items are matched by name; missing items are created in the master table.
func (s *Store) ImportTemplate(ctx context.Context, ownerID string, doc portable.Document) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	templateID := randomID()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO templates (id, owner_id, name) VALUES (?, ?, ?)`,
		templateID, ownerID, doc.Name); err != nil {
		return "", fmt.Errorf("insert template: %w", err)
	}

	for _, item := range doc.Items {
		itemID, err := ensureItem(ctx, tx, item.Name, item.Unit)
		if err != nil {
			return "", err
		}

		var condJSON sql.NullString
		if item.Conditions != nil {
			b, _ := json.Marshal(item.Conditions)
			condJSON = sql.NullString{String: string(b), Valid: true}
		}

		assignment := item.Assignment
		if assignment == "" {
			assignment = "per_person"
		}
		defaultMode := item.DefaultMode
		if defaultMode == "" {
			defaultMode = "pack"
		}
		dedup := item.Dedup
		if dedup == "" {
			dedup = "max"
		}
		latePacker := 0
		if item.LatePacker {
			latePacker = 1
		}

		if _, err := tx.ExecContext(ctx, `
			INSERT INTO template_items (id, template_id, item_id, quantity_formula, assignment, conditions, default_mode, late_packer, dedup)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			randomID(), templateID, itemID, item.Quantity,
			assignment, condJSON, defaultMode, latePacker, dedup); err != nil {
			return "", fmt.Errorf("insert template item %q: %w", item.Name, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	return templateID, nil
}

// ExportTrip builds a portable Document from a stored trip (FR-18.3).
// If includeProgress is true, packed_count is included; otherwise it is omitted.
func (s *Store) ExportTrip(ctx context.Context, tripID string, includeProgress bool) (portable.Document, error) {
	var name, startDate, endDate string
	err := s.db.QueryRowContext(ctx,
		`SELECT name, start_date, end_date FROM trips WHERE id = ?`, tripID).
		Scan(&name, &startDate, &endDate)
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
		StartDate:     startDate,
		EndDate:       endDate,
		Travelers:     travelers,
		Containers:    containers,
		Items:         items,
	}, nil
}

func (s *Store) loadTravelers(ctx context.Context, tripID string) ([]portable.Traveler, map[string]string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, profile FROM travelers WHERE trip_id = ? ORDER BY name`, tripID)
	if err != nil {
		return nil, nil, fmt.Errorf("travelers: %w", err)
	}
	defer rows.Close()

	var travelers []portable.Traveler
	names := map[string]string{} // id -> name
	for rows.Next() {
		var id string
		var t portable.Traveler
		if err := rows.Scan(&id, &t.Name, &t.Profile); err != nil {
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
		it.Quantity = strconv.Itoa(quantity)
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

// ImportTrip creates a new trip in planning status from a portable Document (FR-18.4).
func (s *Store) ImportTrip(ctx context.Context, ownerID string, doc portable.Document) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	tripID := randomID()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO trips (id, name, start_date, end_date, status)
		VALUES (?, ?, ?, ?, 'planning')`,
		tripID, doc.Name, doc.StartDate, doc.EndDate); err != nil {
		return "", fmt.Errorf("insert trip: %w", err)
	}

	// Add owner as trip member.
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')`,
		tripID, ownerID); err != nil {
		return "", fmt.Errorf("insert trip member: %w", err)
	}

	// Create travelers, build name->id map for item references.
	travelerIDs := map[string]string{}
	for _, trav := range doc.Travelers {
		id := randomID()
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO travelers (id, trip_id, name, profile)
			VALUES (?, ?, ?, ?)`, id, tripID, trav.Name, trav.Profile); err != nil {
			return "", fmt.Errorf("insert traveler %q: %w", trav.Name, err)
		}
		travelerIDs[trav.Name] = id
	}

	// Create containers, build name->id map.
	containerIDs := map[string]string{}
	for _, cont := range doc.Containers {
		id := randomID()
		var carrierID sql.NullString
		if cont.Carrier != "" {
			if tid, ok := travelerIDs[cont.Carrier]; ok {
				carrierID = sql.NullString{String: tid, Valid: true}
			}
		}
		var maxWeight sql.NullInt64
		if cont.MaxWeightGrams > 0 {
			maxWeight = sql.NullInt64{Int64: int64(cont.MaxWeightGrams), Valid: true}
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO containers (id, trip_id, name, carrier_traveler_id, max_weight_grams)
			VALUES (?, ?, ?, ?, ?)`,
			id, tripID, cont.Name, carrierID, maxWeight); err != nil {
			return "", fmt.Errorf("insert container %q: %w", cont.Name, err)
		}
		containerIDs[cont.Name] = id
	}

	// Create trip items.
	for _, item := range doc.Items {
		quantity := 1
		if item.Quantity != "" {
			if q, err := strconv.Atoi(item.Quantity); err == nil {
				quantity = q
			}
		}
		mode := item.Mode
		if mode == "" {
			mode = "pack"
		}

		var travelerID, containerID, category sql.NullString
		if item.Traveler != "" {
			if tid, ok := travelerIDs[item.Traveler]; ok {
				travelerID = sql.NullString{String: tid, Valid: true}
			}
		}
		if item.Container != "" {
			if cid, ok := containerIDs[item.Container]; ok {
				containerID = sql.NullString{String: cid, Valid: true}
			}
		}
		if item.Category != "" {
			category = sql.NullString{String: item.Category, Valid: true}
		}
		latePacker := 0
		if item.LatePacker {
			latePacker = 1
		}

		if _, err := tx.ExecContext(ctx, `
			INSERT INTO trip_items (id, trip_id, name, quantity, packed_count, mode,
				category_name, assigned_traveler_id, container_id, late_packer, updated_hlc)
			VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, '')`,
			randomID(), tripID, item.Name, quantity, mode,
			category, travelerID, containerID, latePacker); err != nil {
			return "", fmt.Errorf("insert trip item %q: %w", item.Name, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	return tripID, nil
}

// ensureItem finds or creates a master item by name.
func ensureItem(ctx context.Context, tx *sql.Tx, name, unit string) (string, error) {
	var id string
	err := tx.QueryRowContext(ctx,
		`SELECT id FROM items WHERE name = ? LIMIT 1`, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	if unit == "" {
		unit = "pieces"
	}
	id = randomID()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO items (id, name, unit) VALUES (?, ?, ?)`,
		id, name, unit); err != nil {
		return "", fmt.Errorf("insert item %q: %w", name, err)
	}
	return id, nil
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
