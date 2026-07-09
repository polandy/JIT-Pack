// Package store — notifications.go persists FR-6.2 notifications and the
// per-user event-type preferences behind them (UI-Spec M17). Notifications
// are per-user rows outside both sync partitions: clients fetch them via
// REST after a notification.created ping (Sync-API §7), they never flow
// through pull.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// Notification kinds (FR-6.2 / UI-Spec M17 event types).
const (
	NotifyDelegation = "delegation"
	NotifyMention    = "mention"
	NotifyTask       = "task"
)

// notificationKinds is the closed set of valid preference keys.
var notificationKinds = []string{NotifyDelegation, NotifyMention, NotifyTask}

// ErrNotificationNotFound is returned when a notification does not exist
// or belongs to another user — deliberately indistinguishable.
var ErrNotificationNotFound = errors.New("notification not found")

// Notification is one FR-6.2 notification row. Payload carries the
// deep-link context (FR-6.3): trip_id, item_id, comment_id, actor.
type Notification struct {
	ID        string
	UserID    string
	Kind      string
	Payload   map[string]any
	CreatedAt string
	ReadAt    *string
}

// CreateNotification inserts a notification for userID unless the user
// disabled the kind in their preferences (M17). Returns the new id, or
// "" when the preference suppressed it.
func (s *Store) CreateNotification(ctx context.Context, userID, kind string, payload map[string]any) (string, error) {
	prefs, err := s.NotificationPrefs(ctx, userID)
	if err != nil {
		return "", err
	}
	if !prefs[kind] {
		return "", nil
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal payload: %w", err)
	}
	var id string
	err = s.db.QueryRowContext(ctx,
		`INSERT INTO notifications (user_id, kind, payload) VALUES (?, ?, ?) RETURNING id`,
		userID, kind, string(data)).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert notification: %w", err)
	}
	return id, nil
}

// ListNotifications returns the user's notifications, newest first.
func (s *Store) ListNotifications(ctx context.Context, userID string, unreadOnly bool, limit int) ([]Notification, error) {
	q := `SELECT id, user_id, kind, payload, created_at, read_at
	        FROM notifications WHERE user_id = ?`
	if unreadOnly {
		q += ` AND read_at IS NULL`
	}
	q += ` ORDER BY created_at DESC, id DESC LIMIT ?`
	rows, err := s.db.QueryContext(ctx, q, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()

	out := []Notification{}
	for rows.Next() {
		var n Notification
		var payload string
		if err := rows.Scan(&n.ID, &n.UserID, &n.Kind, &payload, &n.CreatedAt, &n.ReadAt); err != nil {
			return nil, fmt.Errorf("scan notification: %w", err)
		}
		if err := json.Unmarshal([]byte(payload), &n.Payload); err != nil {
			return nil, fmt.Errorf("payload of %s: %w", n.ID, err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// MarkNotificationRead stamps read_at, scoped to the owner so users
// cannot mark each other's notifications.
func (s *Store) MarkNotificationRead(ctx context.Context, userID, id string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		  WHERE id = ? AND user_id = ? AND read_at IS NULL`, id, userID)
	if err != nil {
		return fmt.Errorf("mark read: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		// Distinguish already-read (idempotent success) from missing/foreign.
		var exists int
		err := s.db.QueryRowContext(ctx,
			`SELECT 1 FROM notifications WHERE id = ? AND user_id = ?`, id, userID).Scan(&exists)
		if err != nil {
			return ErrNotificationNotFound
		}
	}
	return nil
}

// NotificationPrefs returns the user's per-kind toggles. Kinds absent
// from the stored JSON (or a NULL column) default to enabled.
func (s *Store) NotificationPrefs(ctx context.Context, userID string) (map[string]bool, error) {
	var raw *string
	err := s.db.QueryRowContext(ctx,
		`SELECT notification_prefs FROM users WHERE id = ?`, userID).Scan(&raw)
	if err != nil {
		return nil, fmt.Errorf("load prefs: %w", err)
	}
	prefs := map[string]bool{}
	for _, k := range notificationKinds {
		prefs[k] = true
	}
	if raw != nil {
		stored := map[string]bool{}
		if err := json.Unmarshal([]byte(*raw), &stored); err != nil {
			return nil, fmt.Errorf("prefs of %s: %w", userID, err)
		}
		for k, v := range stored {
			if _, known := prefs[k]; known {
				prefs[k] = v
			}
		}
	}
	return prefs, nil
}

// SetNotificationPrefs persists the toggles; unknown kinds are dropped
// so the column never accumulates junk keys.
func (s *Store) SetNotificationPrefs(ctx context.Context, userID string, prefs map[string]bool) error {
	clean := map[string]bool{}
	for _, k := range notificationKinds {
		if v, ok := prefs[k]; ok {
			clean[k] = v
		}
	}
	data, err := json.Marshal(clean)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE users SET notification_prefs = ? WHERE id = ?`, string(data), userID)
	if err != nil {
		return fmt.Errorf("save prefs: %w", err)
	}
	return nil
}

// MemberName pairs a trip member with their display name — the input
// for @mention matching (FR-6.2).
type MemberName struct {
	UserID      string
	DisplayName string
}

// TripMemberNames returns all members of a trip with display names.
func (s *Store) TripMemberNames(ctx context.Context, tripID string) ([]MemberName, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT u.id, u.display_name FROM trip_members m
		   JOIN users u ON u.id = m.user_id WHERE m.trip_id = ?`, tripID)
	if err != nil {
		return nil, fmt.Errorf("trip members: %w", err)
	}
	defer rows.Close()

	var out []MemberName
	for rows.Next() {
		var m MemberName
		if err := rows.Scan(&m.UserID, &m.DisplayName); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// TripItemInfo returns an item's name and current packer (empty when
// unset) for notification payloads.
func (s *Store) TripItemInfo(ctx context.Context, itemID string) (name, packerUserID string, err error) {
	var packer *string
	err = s.db.QueryRowContext(ctx,
		`SELECT name, packer_user_id FROM trip_items WHERE id = ?`, itemID).Scan(&name, &packer)
	if err != nil {
		return "", "", fmt.Errorf("trip item %s: %w", itemID, err)
	}
	if packer != nil {
		packerUserID = *packer
	}
	return name, packerUserID, nil
}
