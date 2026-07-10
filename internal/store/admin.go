// Package store — admin.go implements instance user management
// (Addendum 3.23): the FR-23.2 overview, deactivate/reactivate
// (FR-23.3), and profile intervention (FR-23.4). Who *holds* the
// instance-admin role is declarative (JITPACK_ADMIN_EMAILS, stamped
// in EnsureOIDCUser) — nothing here grants or revokes it.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var (
	ErrUserNotFound = errors.New("user not found")
	// ErrAdminUndeactivatable: the operator removes the subject from
	// JITPACK_ADMIN_EMAILS first — keeps env and database consistent.
	ErrAdminUndeactivatable = errors.New("instance admins cannot be deactivated")
)

// AdminUser is one row of the FR-23.2 overview.
type AdminUser struct {
	UserID          string
	DisplayName     string
	Email           string
	CreatedAt       string
	IsInstanceAdmin bool
	DeactivatedAt   *string
	TripCount       int
	TemplateCount   int
}

// AdminUsers returns every provisioned account with status and
// lightweight usage counts, ordered by display name (FR-23.2).
func (s *Store) AdminUsers(ctx context.Context) ([]AdminUser, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT u.id, u.display_name, COALESCE(u.email, ''), u.created_at,
		        u.is_instance_admin, u.deactivated_at,
		        (SELECT count(*) FROM trip_members m WHERE m.user_id = u.id),
		        (SELECT count(*) FROM templates t WHERE t.owner_id = u.id)
		 FROM users u ORDER BY u.display_name, u.id`)
	if err != nil {
		return nil, fmt.Errorf("admin users: %w", err)
	}
	defer rows.Close()

	var users []AdminUser
	for rows.Next() {
		var u AdminUser
		var admin int
		var deactivated sql.NullString
		if err := rows.Scan(&u.UserID, &u.DisplayName, &u.Email, &u.CreatedAt,
			&admin, &deactivated, &u.TripCount, &u.TemplateCount); err != nil {
			return nil, fmt.Errorf("scan admin user: %w", err)
		}
		u.IsInstanceAdmin = admin == 1
		if deactivated.Valid {
			u.DeactivatedAt = &deactivated.String
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// DeactivateUser revokes an account's access (FR-23.3): requests fail
// with account_deactivated, push subscriptions are dropped, and no new
// notifications are created — but no data is touched. Idempotent.
func (s *Store) DeactivateUser(ctx context.Context, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	var admin int
	err = tx.QueryRowContext(ctx,
		`SELECT is_instance_admin FROM users WHERE id = ?`, userID).Scan(&admin)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrUserNotFound
	}
	if err != nil {
		return fmt.Errorf("deactivate lookup: %w", err)
	}
	if admin == 1 {
		return ErrAdminUndeactivatable
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET deactivated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND deactivated_at IS NULL`, userID); err != nil {
		return fmt.Errorf("deactivate: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM push_subscriptions WHERE user_id = ?`, userID); err != nil {
		return fmt.Errorf("drop push subscriptions: %w", err)
	}
	return tx.Commit()
}

// ReactivateUser restores access (FR-23.3); the client re-registers
// Web Push itself on next app start. Idempotent.
func (s *Store) ReactivateUser(ctx context.Context, userID string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE users SET deactivated_at = NULL WHERE id = ?`, userID)
	if err != nil {
		return fmt.Errorf("reactivate: %w", err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return ErrUserNotFound
	}
	return nil
}

// UserDeactivated reports whether the account is deactivated. Unknown
// ids are not deactivated — existence is the caller's concern.
func (s *Store) UserDeactivated(ctx context.Context, userID string) (bool, error) {
	var deactivated sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT deactivated_at FROM users WHERE id = ?`, userID).Scan(&deactivated)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("deactivation lookup: %w", err)
	}
	return deactivated.Valid, nil
}

// IsInstanceAdmin reports whether the account holds the declarative
// instance-admin role (FR-23.1). Unknown ids are not admins.
func (s *Store) IsInstanceAdmin(ctx context.Context, userID string) (bool, error) {
	var admin int
	err := s.db.QueryRowContext(ctx,
		`SELECT is_instance_admin FROM users WHERE id = ?`, userID).Scan(&admin)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("admin lookup: %w", err)
	}
	return admin == 1, nil
}

// ResetDisplayName clears the name to ” (FR-23.4); EnsureOIDCUser
// re-stamps the IdP-provided name at the account's next login.
func (s *Store) ResetDisplayName(ctx context.Context, userID string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE users SET display_name = '' WHERE id = ?`, userID)
	if err != nil {
		return fmt.Errorf("reset display name: %w", err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return ErrUserNotFound
	}
	return nil
}

// ResetAvatar removes the avatar (FR-23.4); the user may set a new one.
func (s *Store) ResetAvatar(ctx context.Context, userID string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE users SET avatar_image = NULL, avatar_mime = NULL WHERE id = ?`, userID)
	if err != nil {
		return fmt.Errorf("reset avatar: %w", err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return ErrUserNotFound
	}
	return nil
}
