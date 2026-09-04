// backup.go implements the NFR-4.5 full-instance export: a versioned
// JSON dump of everything the requesting user can see, mirroring the
// pull-visibility rules (tables.go) so a backup never leaks foreign
// private data. Users (and their avatar blobs) are deliberately not
// included — identity is owned by the IdP, not the backup.

package store

import (
	"context"
	"fmt"
)

// FullExport is the NFR-4.5 versioned JSON backup envelope.
type FullExport struct {
	Version    int                         `json:"version"`
	ExportedAt string                      `json:"exported_at"`
	Data       map[string][]map[string]any `json:"data"`
}

// ExportFull collects all rows visible to userID, table by table. Which
// query answers for a table is the table's own `export` rule in tables.go:
// a backup is a promise about everything the caller can see, and the list
// this used to keep separately had silently fallen two tables behind the
// feed it mirrors.
func (s *Store) ExportFull(ctx context.Context, userID string) (FullExport, error) {
	export := FullExport{
		Version:    1,
		ExportedAt: s.nowRFC3339(),
		Data:       map[string][]map[string]any{},
	}
	for _, table := range exportTables() {
		q := tableSpecs[table].export
		var args []any
		if q.scoped {
			args = []any{userID}
		}
		rows, err := s.queryMaps(ctx, q.query, args...)
		if err != nil {
			return FullExport{}, fmt.Errorf("export %s: %w", table, err)
		}
		export.Data[table] = rows
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
