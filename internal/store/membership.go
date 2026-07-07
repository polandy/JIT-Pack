package store

import (
	"context"
	"database/sql"
	"fmt"
)

// IsTripMember reports whether the user may access the trip (FR-4.5).
// Role-based distinctions (owner vs. collaborator) are enforced per
// operation in the API layer; sync read/write requires membership only.
func (s *Store) IsTripMember(ctx context.Context, tripID, userID string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM trip_members WHERE trip_id = ? AND user_id = ?`,
		tripID, userID).Scan(&n)
	if err != nil {
		return false, fmt.Errorf("membership lookup: %w", err)
	}
	return n > 0, nil
}

// DB exposes the underlying handle for wiring (health checks) and test
// fixtures. Escape hatch until dedicated repositories for users, trips,
// and members exist; production handlers must not use it.
func (s *Store) DB() *sql.DB { return s.db }
