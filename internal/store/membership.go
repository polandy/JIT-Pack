package store

import (
	"context"
	"fmt"
)

// IsTripMember reports whether the user may access the trip (FR-4.5).
// Role-based distinctions (owner vs. editor) are enforced per
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

// ListUsers returns every active account on the instance with its
// display name, ordered by name — the M3 sharing step's user picker
// (FR-4.5). Deactivated accounts are excluded (FR-23.3).
func (s *Store) ListUsers(ctx context.Context) ([]MemberName, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, display_name FROM users WHERE deactivated_at IS NULL ORDER BY display_name, id`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	var users []MemberName
	for rows.Next() {
		var u MemberName
		if err := rows.Scan(&u.UserID, &u.DisplayName); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
