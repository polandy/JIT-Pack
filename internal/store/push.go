// Package store — push.go persists Web-Push subscriptions and the
// self-generated VAPID keypair (NFR-4.6).
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// PushSubscription is one browser push registration (RFC 8030): the
// push-service endpoint URL plus the client keys for RFC 8291 payload
// encryption.
type PushSubscription struct {
	UserID   string
	Endpoint string
	P256dh   string
	Auth     string
}

// SavePushSubscription registers or rebinds a push endpoint. The
// endpoint is the identity: re-registering (e.g. after a user switch on
// the same device) updates the binding instead of duplicating it.
func (s *Store) SavePushSubscription(ctx context.Context, sub PushSubscription) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
		     p256dh = excluded.p256dh, auth = excluded.auth`,
		sub.UserID, sub.Endpoint, sub.P256dh, sub.Auth)
	if err != nil {
		return fmt.Errorf("save push subscription: %w", err)
	}
	return nil
}

// PushSubscriptions returns all registered endpoints of a user.
func (s *Store) PushSubscriptions(ctx context.Context, userID string) ([]PushSubscription, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`, userID)
	if err != nil {
		return nil, fmt.Errorf("push subscriptions: %w", err)
	}
	defer rows.Close()

	var out []PushSubscription
	for rows.Next() {
		var sub PushSubscription
		if err := rows.Scan(&sub.UserID, &sub.Endpoint, &sub.P256dh, &sub.Auth); err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// DeletePushSubscription drops an endpoint the push service reported
// gone (404/410) — server-side cleanup, no ownership check.
func (s *Store) DeletePushSubscription(ctx context.Context, endpoint string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM push_subscriptions WHERE endpoint = ?`, endpoint)
	if err != nil {
		return fmt.Errorf("delete push subscription: %w", err)
	}
	return nil
}

// DeleteUserPushSubscription drops an endpoint on behalf of its owner
// (M17 opt-out) — scoped so nobody can unregister another user's device.
func (s *Store) DeleteUserPushSubscription(ctx context.Context, userID, endpoint string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`, endpoint, userID)
	if err != nil {
		return fmt.Errorf("delete push subscription: %w", err)
	}
	return nil
}

// ServerKey reads a named server secret; ok=false when unset.
func (s *Store) ServerKey(ctx context.Context, name string) (value string, ok bool, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT value FROM server_keys WHERE name = ?`, name).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("server key %s: %w", name, err)
	}
	return value, true, nil
}

// SetServerKey persists a named server secret; first writer wins so two
// racing startups cannot end up with different generated keys.
func (s *Store) SetServerKey(ctx context.Context, name, value string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO server_keys (name, value) VALUES (?, ?)
		 ON CONFLICT(name) DO NOTHING`, name, value)
	if err != nil {
		return fmt.Errorf("set server key %s: %w", name, err)
	}
	return nil
}
