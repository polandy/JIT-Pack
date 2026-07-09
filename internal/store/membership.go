package store

import (
	"context"
	"database/sql"
	"errors"
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

// GetMemberRole returns the user's role on the trip (FR-4.5).
// Returns empty string and false if the user is not a member.
func (s *Store) GetMemberRole(ctx context.Context, tripID, userID string) (string, bool, error) {
	var role string
	err := s.db.QueryRowContext(ctx,
		`SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?`,
		tripID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("role lookup: %w", err)
	}
	return role, true, nil
}

// IsTripCreator reports whether the user is the trip's original creator (FR-4.7).
// The creator's role is immutable — no one can demote them.
func (s *Store) IsTripCreator(ctx context.Context, tripID, userID string) (bool, error) {
	var createdBy sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT created_by FROM trips WHERE id = ?`,
		tripID).Scan(&createdBy)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("creator lookup: %w", err)
	}
	return createdBy.Valid && createdBy.String == userID, nil
}

// CanManageTravelers reports whether the user has Owner or Admin role
// on the trip (FR-4.7): only these roles may add/remove travelers and
// change member roles.
func (s *Store) CanManageTravelers(ctx context.Context, tripID, userID string) (bool, error) {
	role, isMember, err := s.GetMemberRole(ctx, tripID, userID)
	if err != nil || !isMember {
		return false, err
	}
	return role == "owner" || role == "admin", nil
}

// ListUsers returns every account on the instance with its display name,
// ordered by name — the M3 sharing step's user picker (FR-4.5).
func (s *Store) ListUsers(ctx context.Context) ([]MemberName, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, display_name FROM users ORDER BY display_name, id`)
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

// DB exposes the underlying handle for wiring (health checks) and test
// fixtures. Escape hatch until dedicated repositories for users, trips,
// and members exist; production handlers must not use it.
func (s *Store) DB() *sql.DB { return s.db }
