package store

import (
	"context"
	"database/sql"
	"fmt"
)

// TripCSVRow is one line of the flat per-trip dump (NFR-4.5). Traveler and
// container are resolved to names here because the file is for a spreadsheet,
// not for re-import — the round-trippable form is the portable YAML the app
// writes (FR-18.3, ADR-025).
type TripCSVRow struct {
	Name        string
	Category    string
	Quantity    int
	PackedCount int
	Mode        string
	Traveler    string
	Container   string
}

// TripCSVRows loads a trip's packing list for the CSV export, in the order
// the file lists it.
func (s *Store) TripCSVRows(ctx context.Context, tripID string) ([]TripCSVRow, error) {
	var exists int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM trips WHERE id = ?`, tripID).Scan(&exists); err != nil {
		return nil, fmt.Errorf("trip: %w", err)
	}
	if exists == 0 {
		return nil, sql.ErrNoRows
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT ti.name, ti.category_name, ti.quantity, ti.packed_count, ti.mode,
		       tr.name, c.name
		FROM trip_items ti
		LEFT JOIN travelers  tr ON tr.id = ti.assigned_traveler_id
		LEFT JOIN containers c  ON c.id  = ti.container_id
		WHERE ti.trip_id = ?
		ORDER BY ti.name`, tripID)
	if err != nil {
		return nil, fmt.Errorf("trip items: %w", err)
	}
	defer rows.Close()

	var out []TripCSVRow
	for rows.Next() {
		var r TripCSVRow
		var category, traveler, container sql.NullString
		if err := rows.Scan(&r.Name, &category, &r.Quantity, &r.PackedCount, &r.Mode,
			&traveler, &container); err != nil {
			return nil, fmt.Errorf("scan trip item: %w", err)
		}
		r.Category, r.Traveler, r.Container = category.String, traveler.String, container.String
		out = append(out, r)
	}
	return out, rows.Err()
}
