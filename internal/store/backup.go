// backup.go implements the NFR-4.5 full-instance export: a versioned
// JSON dump of everything the requesting user can see, mirroring the
// pull-visibility rules (master.go) so a backup never leaks foreign
// private data. Users (and their avatar blobs) are deliberately not
// included — identity is owned by the IdP, not the backup.

package store

import (
	"context"
	"fmt"
	"time"
)

// FullExport is the NFR-4.5 versioned JSON backup envelope.
type FullExport struct {
	Version    int                         `json:"version"`
	ExportedAt string                      `json:"exported_at"`
	Data       map[string][]map[string]any `json:"data"`
}

// ExportFull collects all rows visible to userID, table by table.
func (s *Store) ExportFull(ctx context.Context, userID string) (FullExport, error) {
	one := []any{userID}
	tables := []struct {
		table string
		query string
		args  []any
	}{
		{"categories", `SELECT * FROM categories`, nil},
		{"items", `SELECT * FROM items`, nil},
		{"templates", `SELECT * FROM templates WHERE owner_id = ? OR is_published = 1`, one},
		{"template_items", `SELECT ti.* FROM template_items ti
			JOIN templates t ON t.id = ti.template_id
			WHERE t.owner_id = ? OR t.is_published = 1`, one},
		{"trip_series", `SELECT * FROM trip_series WHERE owner_id = ?`, one},
		{"destination_profiles", `SELECT p.* FROM destination_profiles p
			JOIN trip_series s ON s.id = p.series_id WHERE s.owner_id = ?`, one},
		{"destination_checklist_items", `SELECT ci.* FROM destination_checklist_items ci
			JOIN destination_profiles p ON p.id = ci.profile_id
			JOIN trip_series s ON s.id = p.series_id WHERE s.owner_id = ?`, one},
		{"trips", `SELECT t.* FROM trips t
			JOIN trip_members m ON m.trip_id = t.id WHERE m.user_id = ?`, one},
		{"travelers", `SELECT x.* FROM travelers x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, one},
		{"containers", `SELECT x.* FROM containers x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, one},
		{"trip_items", `SELECT x.* FROM trip_items x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, one},
		{"comments", `SELECT x.* FROM comments x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, one},
	}

	export := FullExport{
		Version:    1,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Data:       map[string][]map[string]any{},
	}
	for _, t := range tables {
		rows, err := s.queryMaps(ctx, t.query, t.args...)
		if err != nil {
			return FullExport{}, fmt.Errorf("export %s: %w", t.table, err)
		}
		export.Data[t.table] = rows
	}
	return export, nil
}

// UserDisplayName resolves a user's display name.
func (s *Store) UserDisplayName(ctx context.Context, userID string) (string, error) {
	var name string
	err := s.db.QueryRowContext(ctx,
		`SELECT display_name FROM users WHERE id = ?`, userID).Scan(&name)
	if err != nil {
		return "", fmt.Errorf("display name: %w", err)
	}
	return name, nil
}

// queryMaps runs a SELECT * query and returns generic row maps with
// []byte columns converted to strings (JSON-friendly).
func (s *Store) queryMaps(ctx context.Context, query string, args ...any) ([]map[string]any, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	out := []map[string]any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		row := make(map[string]any, len(cols))
		for i, col := range cols {
			if b, ok := vals[i].([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = vals[i]
			}
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
