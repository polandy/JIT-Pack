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
func (s *Store) EnsureOIDCUser(ctx context.Context, subject, displayName string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE oidc_subject = ?`, subject).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("lookup oidc subject: %w", err)
	}

	name := strings.TrimSpace(displayName)
	if name == "" {
		name = subject
	}
	if len(name) > 50 {
		name = name[:50] // users.display_name CHECK constraint
	}
	err = s.db.QueryRowContext(ctx,
		`INSERT INTO users (oidc_subject, display_name) VALUES (?, ?) RETURNING id`,
		subject, name).Scan(&id)
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
