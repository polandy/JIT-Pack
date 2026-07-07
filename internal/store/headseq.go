package store

import (
	"context"
	"database/sql"
	"errors"
)

// HeadSeq returns the highest change_log sequence number for a trip,
// or 0 if the trip has no changes yet. Used by the WebSocket hub to
// compute in_sync state (Sync-API Spec §7).
func (s *Store) HeadSeq(ctx context.Context, tripID string) (int64, error) {
	var seq int64
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(seq), 0) FROM change_log WHERE trip_id = ?`,
		tripID).Scan(&seq)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return seq, err
}
