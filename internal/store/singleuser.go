package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
)

var (
	// ErrInvalidDisplayName is returned when a display name violates
	// Addendum FR-17.13 (max 50 chars, [A-Za-z0-9._-] only).
	ErrInvalidDisplayName = errors.New("display name must be 1-50 characters from [A-Za-z0-9._-]")
	// ErrAvatarTooLarge is returned when an avatar upload exceeds the
	// 100 KB hard cap also enforced at the database layer (Schema v0.4).
	ErrAvatarTooLarge = errors.New("avatar exceeds 100 KB limit")
)

const maxAvatarBytes = 100 * 1024

var displayNamePattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,50}$`)

const localSingleUserDefaultName = "Demo User"

// EnsureLocalSingleUser returns the id of the implicit local user
// (Addendum FR-17.2), creating it on first call. Idempotent: subsequent
// calls return the same id without creating a second row.
func (s *Store) EnsureLocalSingleUser(ctx context.Context) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE is_local_singleuser = 1 LIMIT 1`).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("look up local single user: %w", err)
	}

	err = s.db.QueryRowContext(ctx,
		`INSERT INTO users (is_local_singleuser, display_name) VALUES (1, ?) RETURNING id`,
		localSingleUserDefaultName).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create local single user: %w", err)
	}
	return id, nil
}

// SetDisplayName validates and persists a user's display name
// (Addendum FR-17.13). Validation happens here as well as on the client;
// this is the server-side half of "validated client- and server-side."
func (s *Store) SetDisplayName(ctx context.Context, userID, name string) error {
	if !displayNamePattern.MatchString(name) {
		return ErrInvalidDisplayName
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE users SET display_name = ? WHERE id = ?`, name, userID); err != nil {
		return fmt.Errorf("set display name: %w", err)
	}
	return nil
}

// SetAvatar validates and persists a user's avatar image (Addendum
// FR-17.13, ADR-002). The caller (API handler) is expected to have
// already produced a 256x256 JPEG; this is the defense-in-depth check
// independent of client behavior, backed by the same limit as the
// database CHECK constraint (Schema v0.4).
func (s *Store) SetAvatar(ctx context.Context, userID string, jpeg []byte) error {
	if len(jpeg) > maxAvatarBytes {
		return ErrAvatarTooLarge
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET avatar_image = ?, avatar_mime = 'image/jpeg' WHERE id = ?`, jpeg, userID)
	if err != nil {
		return fmt.Errorf("set avatar: %w", err)
	}
	return nil
}

// GetAvatar returns the stored avatar bytes, or nil if the user has none
// set. A nil result is not an error — most users may never upload one.
func (s *Store) GetAvatar(ctx context.Context, userID string) ([]byte, error) {
	var data []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT avatar_image FROM users WHERE id = ?`, userID).Scan(&data)
	if err != nil {
		return nil, fmt.Errorf("get avatar: %w", err)
	}
	return data, nil
}
