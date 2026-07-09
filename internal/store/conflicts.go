package store

import (
	"context"
	"fmt"
)

// ConflictEntry is one audited LWW loser (NFR-4.2a). Values are the
// JSON-encoded losing/winning field contents as logged at merge time.
type ConflictEntry struct {
	ID           string
	EntityTable  string
	EntityID     string
	Field        string
	LosingValue  string
	WinningValue string
	ResolvedAt   string
}

// ListConflicts returns a trip's conflict log, newest first. Rows live
// until the trip is archived (retention rule, Addendum NFR-4.2a).
func (s *Store) ListConflicts(ctx context.Context, tripID string) ([]ConflictEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, entity_table, entity_id, field,
		        coalesce(losing_value, ''), coalesce(winning_value, ''), resolved_at
		 FROM conflict_log WHERE trip_id = ?
		 ORDER BY resolved_at DESC, id`,
		tripID)
	if err != nil {
		return nil, fmt.Errorf("list conflicts: %w", err)
	}
	defer rows.Close()

	entries := []ConflictEntry{}
	for rows.Next() {
		var c ConflictEntry
		if err := rows.Scan(&c.ID, &c.EntityTable, &c.EntityID, &c.Field,
			&c.LosingValue, &c.WinningValue, &c.ResolvedAt); err != nil {
			return nil, fmt.Errorf("scan conflict: %w", err)
		}
		entries = append(entries, c)
	}
	return entries, rows.Err()
}
