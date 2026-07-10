package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// EnsureOIDCUser returns the users.id for an OIDC subject, provisioning
// the row on first sight (Sync-API §2 JIT provisioning). An existing
// row keeps its id and display name — this is also what FR-17.4's
// upgrade path relies on (linking sets oidc_subject on the local user).
//
// isAdmin stamps users.is_instance_admin in both directions (FR-23.1):
// the JITPACK_ADMIN_EMAILS list is authoritative, so removal from the
// list revokes the role at the next login. The token's email claim is
// stamped into users.email on every login (keeps the FR-23.2 overview
// current when the IdP-side address changes); an empty claim leaves
// the stored address alone. A display name reset to '' by an instance
// admin (FR-23.4) is re-stamped from the IdP claim here, exactly like
// initial provisioning. Deactivation is never touched — a login must
// not resurrect a deactivated account (FR-23.3/23.6).
func (s *Store) EnsureOIDCUser(ctx context.Context, subject, displayName, email string, isAdmin bool) (string, error) {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = subject
	}
	if len(name) > 50 {
		name = name[:50] // users.display_name CHECK constraint
	}

	var id string
	err := s.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE oidc_subject = ?`, subject).Scan(&id)
	if err == nil {
		// Conditional write keeps the per-request hot path read-only.
		if _, err := s.db.ExecContext(ctx,
			`UPDATE users SET is_instance_admin = ?,
			        display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END,
			        email = CASE WHEN ? = '' THEN email ELSE ? END
			 WHERE id = ? AND (is_instance_admin != ? OR display_name = ''
			        OR (? != '' AND email IS NOT ?))`,
			boolToInt(isAdmin), name, email, email,
			id, boolToInt(isAdmin), email, email); err != nil {
			return "", fmt.Errorf("stamp oidc user: %w", err)
		}
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("lookup oidc subject: %w", err)
	}

	var emailArg any
	if email != "" {
		emailArg = email
	}
	err = s.db.QueryRowContext(ctx,
		`INSERT INTO users (oidc_subject, display_name, email, is_instance_admin) VALUES (?, ?, ?, ?) RETURNING id`,
		subject, name, emailArg, boolToInt(isAdmin)).Scan(&id)
	if err != nil {
		// Concurrent provisioning of the same subject: the UNIQUE
		// constraint lost — the winner's row is what we want.
		var existing string
		if lookupErr := s.db.QueryRowContext(ctx,
			`SELECT id FROM users WHERE oidc_subject = ?`, subject).Scan(&existing); lookupErr == nil {
			return existing, nil
		}
		return "", fmt.Errorf("provision oidc user: %w", err)
	}
	return id, nil
}
