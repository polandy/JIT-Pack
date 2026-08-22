package store

import (
	"context"
	crand "crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

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

// ImportTemplate creates a new template from a portable Document (FR-18.4).
// Items are matched by name; missing items are created in the master table.
func (s *Store) ImportTemplate(ctx context.Context, ownerID string, doc portable.Document) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	scope := doc.Scope
	if scope == "" {
		// A file written before scopes existed reads back as a Ferien-Vorlage,
		// the same default migration 016 applied to pre-scope rows.
		scope = portable.ScopeTemplate
	}

	// FR-27.1/ADR-017: a group's own document obeys the same identity rule as
	// the groups a Ferien-Vorlage carries nested — the rule belongs to the
	// group, not to where in a file it appears. A backup names the same group
	// both ways, so the standalone document must land on the group already
	// here rather than beside it.
	if scope == portable.ScopeGroup {
		groupID, err := ensureGroup(ctx, tx, ownerID,
			portable.Group{Name: doc.Name, Icon: doc.Icon, Items: doc.Items})
		if err != nil {
			return "", err
		}
		if err := tx.Commit(); err != nil {
			return "", fmt.Errorf("commit: %w", err)
		}
		return groupID, nil
	}

	templateID := randomID()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO templates (id, owner_id, name, kind, `+MarkColumn+`) VALUES (?, ?, ?, ?, ?)`,
		templateID, ownerID, doc.Name, scope, nullIfEmpty(doc.Icon)); err != nil {
		return "", fmt.Errorf("insert template: %w", err)
	}

	if err := insertPositions(ctx, tx, templateID, doc.Items); err != nil {
		return "", err
	}

	// FR-27.1/ADR-017: a group named in the file is *linked* when one of that
	// name already exists and created otherwise. It is never rewritten — the
	// file may be older than the group, and overwriting would reach every
	// Ferien-Vorlage that includes it and, through FR-27.4, every trip that
	// follows one.
	for _, group := range doc.Includes {
		groupID, err := ensureGroup(ctx, tx, ownerID, group)
		if err != nil {
			return "", err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO template_includes (id, template_id, included_template_id)
			VALUES (?, ?, ?)`, randomID(), templateID, groupID); err != nil {
			return "", fmt.Errorf("include group %q: %w", group.Name, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	return templateID, nil
}

// ensureGroup returns the id of the group of that name, creating it with the
// file's positions when the instance has never heard of it (ADR-017: the name
// is a group's whole identity across instances).
func ensureGroup(ctx context.Context, tx *sql.Tx, ownerID string, group portable.Group) (string, error) {
	var existing string
	err := tx.QueryRowContext(ctx,
		`SELECT id FROM templates WHERE name = ? AND kind = ? LIMIT 1`,
		group.Name, portable.ScopeGroup).Scan(&existing)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("lookup group %q: %w", group.Name, err)
	}

	groupID := randomID()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO templates (id, owner_id, name, kind, `+MarkColumn+`) VALUES (?, ?, ?, ?, ?)`,
		groupID, ownerID, group.Name, portable.ScopeGroup, nullIfEmpty(group.Icon)); err != nil {
		return "", fmt.Errorf("insert group %q: %w", group.Name, err)
	}
	if err := insertPositions(ctx, tx, groupID, group.Items); err != nil {
		return "", err
	}
	return groupID, nil
}

// insertPositions writes one template's positions and their FR-27.7 tasks,
// applying the format's defaults for anything the file left out.
func insertPositions(ctx context.Context, tx *sql.Tx, templateID string, items []portable.Item) error {
	for _, item := range items {
		itemID, err := ensureItem(ctx, tx, item.Name, item.Icon)
		if err != nil {
			return err
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

		positionID := randomID()
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO template_items (id, template_id, item_id, quantity, assignment, conditions, default_mode, late_packer, dedup)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			positionID, templateID, itemID, max(int(item.Quantity), 1),
			assignment, condJSON, defaultMode, latePacker, dedup); err != nil {
			return fmt.Errorf("insert template item %q: %w", item.Name, err)
		}

		for _, task := range item.Tasks {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO template_item_tasks (id, template_item_id, task)
				VALUES (?, ?, ?)`, randomID(), positionID, task); err != nil {
				return fmt.Errorf("insert task for %q: %w", item.Name, err)
			}
		}
	}
	return nil
}

// yearOf picks the trip's year (FR-2.1b) from the first source that knows
// it: the document's own field, then the year inside either date, then the
// current one. A file written before FR-2.1b has no year field but always
// an end date, so the middle case is what carries old exports across.
func yearOf(stated int, dates ...string) int {
	if stated >= 1900 && stated <= 2200 {
		return stated
	}
	for _, d := range dates {
		if len(d) >= 4 {
			if y, err := strconv.Atoi(d[:4]); err == nil && y >= 1900 && y <= 2200 {
				return y
			}
		}
	}
	return time.Now().Year()
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

// ImportTrip creates a new trip in planning status from a portable Document (FR-18.4).
func (s *Store) ImportTrip(ctx context.Context, ownerID string, doc portable.Document) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	tripID := randomID()
	var startDateArg, endDateArg any
	if doc.StartDate != "" {
		startDateArg = doc.StartDate
	}
	if doc.EndDate != "" {
		endDateArg = doc.EndDate
	}
	// FR-2.1b: the year is the one required temporal fact. A document
	// carrying dates states it implicitly, one written by an older app
	// always has an end date, and a file with neither falls back to the
	// year of the import — the honest answer when nothing else is known.
	year := yearOf(doc.Year, doc.EndDate, doc.StartDate)
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO trips (id, name, year, start_date, end_date, status)
		VALUES (?, ?, ?, ?, ?, 'planning')`,
		tripID, doc.Name, year, startDateArg, endDateArg); err != nil {
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
			INSERT INTO travelers (id, trip_id, name)
			VALUES (?, ?, ?)`, id, tripID, trav.Name); err != nil {
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
		if item.Quantity > 0 {
			quantity = int(item.Quantity)
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
func ensureItem(ctx context.Context, tx *sql.Tx, name, icon string) (string, error) {
	var id string
	err := tx.QueryRowContext(ctx,
		`SELECT id FROM items WHERE name = ? LIMIT 1`, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	id = randomID()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO items (id, name, `+MarkColumn+`) VALUES (?, ?, ?)`,
		id, name, nullIfEmpty(icon)); err != nil {
		return "", fmt.Errorf("insert item %q: %w", name, err)
	}
	return id, nil
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
