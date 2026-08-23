package store

import (
	"context"
	"database/sql"
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
	// MutationID groups the fields one push lost together; ActorUserID is
	// who pushed it — the person a revert belongs to.
	MutationID  string
	ActorUserID string
	ResolvedAt  string
	Reverted    bool
}

// The two partitions keep two logs in one table, told apart by trip_id
// exactly as change_log is (Sync-API §4): a trip's rows carry its id, the
// master partition's carry NULL. Each list reads its own half — a query
// that mixed them would show a member of one trip the losers of another.
const (
	conflictColumns = `id, entity_table, entity_id, field,
	        coalesce(losing_value, ''), coalesce(winning_value, ''),
	        mutation_id, actor_user_id, resolved_at, reverted`
	conflictOrder = ` ORDER BY resolved_at DESC, id`
)

// ListConflicts returns a trip's conflict log, newest first. Rows live as
// long as the trip does: conflict_log.trip_id cascades on delete, and the
// compaction NFR-4.2a describes for an archived trip is not built.
func (s *Store) ListConflicts(ctx context.Context, tripID string) ([]ConflictEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+conflictColumns+` FROM conflict_log WHERE trip_id = ?`+conflictOrder,
		tripID)
	if err != nil {
		return nil, fmt.Errorf("list conflicts: %w", err)
	}
	return scanConflicts(rows)
}

// ListMasterConflicts returns the master partition's conflict log for one
// user, newest first. It is filtered through masterVisible for the same
// reason PullMaster is: a conflict entry names an entity, and naming one
// the user may not see would leak it — `trips` is the case that matters,
// since a trip's own fields are merged here rather than in its partition.
func (s *Store) ListMasterConflicts(ctx context.Context, userID string) ([]ConflictEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+conflictColumns+` FROM conflict_log WHERE trip_id IS NULL`+conflictOrder)
	if err != nil {
		return nil, fmt.Errorf("list master conflicts: %w", err)
	}
	entries, err := scanConflicts(rows)
	if err != nil {
		return nil, err
	}

	visible := entries[:0]
	for _, c := range entries {
		ok, err := s.masterVisible(ctx, userID, c.EntityTable, c.EntityID)
		if err != nil {
			return nil, fmt.Errorf("master conflict visibility: %w", err)
		}
		if ok {
			visible = append(visible, c)
		}
	}
	return visible, nil
}

func scanConflicts(rows *sql.Rows) ([]ConflictEntry, error) {
	defer rows.Close()

	entries := []ConflictEntry{}
	for rows.Next() {
		var c ConflictEntry
		if err := rows.Scan(&c.ID, &c.EntityTable, &c.EntityID, &c.Field,
			&c.LosingValue, &c.WinningValue, &c.MutationID, &c.ActorUserID,
			&c.ResolvedAt, &c.Reverted); err != nil {
			return nil, fmt.Errorf("scan conflict: %w", err)
		}
		entries = append(entries, c)
	}
	return entries, rows.Err()
}
