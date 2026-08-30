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
// list revokes the role at the next login. A nil isAdmin means the IdP
// gave nothing to resolve the role from and the stored flag is left
// untouched — "no information" must not read as "not an admin", or a
// degraded UserInfo response silently demotes every instance admin.
// On first provisioning nil creates a non-admin row. The token's email claim is
// stamped into users.email on every login (keeps the FR-23.2 overview
// current when the IdP-side address changes); an empty claim leaves
// the stored address alone. A display name reset to ” by an instance
// admin (FR-23.4) is re-stamped from the IdP claim here, exactly like
// initial provisioning. Deactivation is never touched — a login must
// not resurrect a deactivated account (FR-23.3/23.6).
func (s *Store) EnsureOIDCUser(ctx context.Context, subject, displayName, email string, isAdmin *bool) (string, error) {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = subject
	}
	if len(name) > 50 {
		name = name[:50] // users.display_name CHECK constraint
	}

	// NULL carries "leave the role as it stands" all the way into SQL, so
	// the unknown case cannot be mistaken for a false.
	var adminArg any
	if isAdmin != nil {
		adminArg = boolToInt(*isAdmin)
	}

	var id string
	err := s.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE oidc_subject = ?`, subject).Scan(&id)
	if err == nil {
		// Conditional write keeps the per-request hot path read-only.
		if _, err := s.db.ExecContext(ctx,
			`UPDATE users SET is_instance_admin = CASE WHEN ? IS NULL THEN is_instance_admin ELSE ? END,
			        display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END,
			        email = CASE WHEN ? = '' THEN email ELSE ? END
			 WHERE id = ? AND ((? IS NOT NULL AND is_instance_admin IS NOT ?) OR display_name = ''
			        OR (? != '' AND email IS NOT ?))`,
			adminArg, adminArg, name, email, email,
			id, adminArg, adminArg, email, email); err != nil {
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
		subject, name, emailArg, boolToInt(isAdmin != nil && *isAdmin)).Scan(&id)
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

// ErrUserRefAmbiguous means the reference names more than one account.
// `users.email` carries no UNIQUE constraint, so an address legitimately
// resolves to two rows — and minting a long-lived credential for whichever
// one the query happened to return first is the mistake this prevents.
var ErrUserRefAmbiguous = errors.New("user reference is ambiguous")

// ResolveUserRef turns an id or an e-mail address into a user id.
//
// It lives here rather than in the command that uses it because deciding who
// somebody meant is a rule, and because an unknown reference must be refused
// rather than silently minting a credential for nobody — the same hole
// AccountStatus closes at the other end (FR-23.7).
func (s *Store) ResolveUserRef(ctx context.Context, ref string) (string, error) {
	if ref == "" {
		return "", ErrUserNotFound
	}
	var id string
	err := s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE id = ?`, ref).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("resolve user %q: %w", ref, err)
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT id FROM users WHERE lower(email) = lower(?) ORDER BY id`, ref)
	if err != nil {
		return "", fmt.Errorf("resolve user %q by email: %w", ref, err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var got string
		if err := rows.Scan(&got); err != nil {
			return "", fmt.Errorf("resolve user %q by email: %w", ref, err)
		}
		ids = append(ids, got)
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("resolve user %q by email: %w", ref, err)
	}
	switch len(ids) {
	case 0:
		return "", ErrUserNotFound
	case 1:
		return ids[0], nil
	default:
		return "", fmt.Errorf("%w: %q names %d accounts", ErrUserRefAmbiguous, ref, len(ids))
	}
}
