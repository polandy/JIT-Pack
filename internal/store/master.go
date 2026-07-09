// Package store — master.go implements the master-partition side of the
// sync protocol (Sync-API Spec §4/§5, P-3): per-user pull visibility and
// ownership-enforcing push for categories, items, templates,
// template_items, and trips metadata.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"jitpack/internal/sync"
)

// ApplyMasterMutation resolves one master-partition mutation for userID.
// Beyond the trip-partition pipeline it enforces ownership (FR-1.6,
// FR-4.5): templates and template_items are writable only by the template
// owner, trips only by members (delete: owner/admin), and server-owned
// columns (owner_id, created_by) are stamped on insert. Unauthorized
// mutations return outcome "rejected" instead of an error so the push
// batch continues (spec §5).
func (s *Store) ApplyMasterMutation(ctx context.Context, userID string, m sync.Mutation) (MutationResult, error) {
	if err := validate(m, masterPartitionTables); err != nil {
		return MutationResult{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MutationResult{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	if recorded, found, err := recordedResult(ctx, tx, m.MutationID); err != nil {
		return MutationResult{}, err
	} else if found {
		return recorded, nil
	}

	current, currentHLC, exists, err := loadRow(ctx, tx, m.Table, m.ID)
	if err != nil {
		return MutationResult{}, err
	}

	res := MutationResult{MutationID: m.MutationID}
	allowed, err := authorizeMaster(ctx, tx, userID, &m, current, exists)
	if err != nil {
		return MutationResult{}, err
	}
	if !allowed {
		res.Outcome = "rejected"
		return res, finalize(ctx, tx, res)
	}

	merged := sync.Merge(current, currentHLC, exists, m)
	res.Outcome = string(merged.Outcome)
	res.Conflicts = merged.Conflicts

	// Deleting a template cascades its template_items (FK); collect their
	// ids up front so the cascade can be tombstoned for clients.
	var cascaded []string
	if merged.Deleted && m.Table == "templates" && exists {
		if cascaded, err = childIDs(ctx, tx,
			`SELECT id FROM template_items WHERE template_id = ?`, m.ID); err != nil {
			return MutationResult{}, err
		}
	}

	changed, err := persist(ctx, tx, m.Table, m, merged, exists)
	if err != nil {
		if isFKViolation(err) {
			// e.g. deleting an item still referenced by a template: the
			// statement failed, the transaction survives — reject cleanly.
			res.Outcome = "rejected"
			res.Conflicts = nil
			return res, finalize(ctx, tx, res)
		}
		return MutationResult{}, err
	}
	if changed {
		res.Seq, err = appendChangeLog(ctx, tx, nil, m, merged.Deleted)
		if err != nil {
			return MutationResult{}, err
		}
		for _, id := range cascaded {
			tombstone := sync.Mutation{Table: "template_items", ID: id, HLC: m.HLC}
			if _, err := appendChangeLog(ctx, tx, nil, tombstone, true); err != nil {
				return MutationResult{}, err
			}
		}
		if m.Table == "trips" && !exists && !merged.Deleted {
			// The creator becomes the trip's Owner (FR-4.5); without this
			// row the trip-partition endpoints would reject them.
			if _, err := tx.ExecContext(ctx,
				`INSERT OR IGNORE INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')`,
				m.ID, userID); err != nil {
				return MutationResult{}, fmt.Errorf("creator membership: %w", err)
			}
		}
	}
	if err := logConflicts(ctx, tx, nil, m, merged.Conflicts); err != nil {
		return MutationResult{}, err
	}
	return res, finalize(ctx, tx, res)
}

// finalize records the idempotency memo and commits.
func finalize(ctx context.Context, tx *sql.Tx, res MutationResult) error {
	if err := recordResult(ctx, tx, res); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// authorizeMaster decides whether userID may apply m and stamps
// server-owned columns on insert. current is the existing row, if any.
func authorizeMaster(ctx context.Context, tx *sql.Tx, userID string, m *sync.Mutation, current map[string]any, exists bool) (bool, error) {
	switch m.Table {
	case "categories":
		return true, nil

	case "items":
		if !exists && m.Op != sync.OpDelete {
			setField(m, "created_by", userID)
		}
		return true, nil

	case "templates":
		if !exists {
			if m.Op != sync.OpDelete {
				setField(m, "owner_id", userID)
			}
			return true, nil
		}
		return current["owner_id"] == userID, nil

	case "template_items":
		// Both the current and the target template must be owned by the
		// pusher — otherwise items could be moved into foreign templates.
		templateIDs := map[string]bool{}
		if exists {
			if id, ok := current["template_id"].(string); ok {
				templateIDs[id] = true
			}
		}
		if id, ok := m.Fields["template_id"].(string); ok {
			templateIDs[id] = true
		}
		if len(templateIDs) == 0 {
			return false, nil
		}
		for id := range templateIDs {
			var owner string
			err := tx.QueryRowContext(ctx,
				`SELECT owner_id FROM templates WHERE id = ?`, id).Scan(&owner)
			if errors.Is(err, sql.ErrNoRows) {
				return false, nil
			}
			if err != nil {
				return false, fmt.Errorf("template owner lookup: %w", err)
			}
			if owner != userID {
				return false, nil
			}
		}
		return true, nil

	case "trips":
		if !exists {
			if m.Op != sync.OpDelete {
				setField(m, "created_by", userID)
			}
			return true, nil
		}
		var role string
		err := tx.QueryRowContext(ctx,
			`SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?`,
			m.ID, userID).Scan(&role)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, fmt.Errorf("trip role lookup: %w", err)
		}
		if m.Op == sync.OpDelete {
			return role == "owner" || role == "admin", nil
		}
		return true, nil
	}
	return false, nil
}

func setField(m *sync.Mutation, field, value string) {
	if m.Fields == nil {
		m.Fields = map[string]any{}
	}
	m.Fields[field] = value
}

func childIDs(ctx context.Context, tx *sql.Tx, query string, args ...any) ([]string, error) {
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("child ids: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan child id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func isFKViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "FOREIGN KEY constraint")
}

// PullMaster returns master-partition changes after the cursor, filtered
// to what userID may see (spec §4): categories and items are shared,
// templates require ownership or is_published, trips require membership.
// Tombstones are always delivered — they carry only the entity id.
func (s *Store) PullMaster(ctx context.Context, userID string, cursor int64, limit int) (PullPage, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT seq, entity_table, entity_id, deleted FROM change_log
		 WHERE trip_id IS NULL AND seq > ? ORDER BY seq LIMIT ?`,
		cursor, limit+1)
	if err != nil {
		return PullPage{}, fmt.Errorf("pull master change_log: %w", err)
	}
	defer rows.Close()

	entries, err := scanChanges(rows)
	if err != nil {
		return PullPage{}, err
	}

	page := PullPage{HasMore: len(entries) > limit}
	if page.HasMore {
		entries = entries[:limit]
	}
	if len(entries) > 0 {
		page.NextCursor = entries[len(entries)-1].Seq
	} else {
		page.NextCursor = cursor
	}

	for _, c := range compact(entries) {
		if !c.Deleted {
			visible, err := s.masterVisible(ctx, userID, c.Table, c.ID)
			if err != nil {
				return PullPage{}, err
			}
			if !visible {
				continue
			}
			c.Row, _, _, err = s.loadSnapshot(ctx, c.Table, c.ID)
			if err != nil {
				return PullPage{}, err
			}
		}
		page.Changes = append(page.Changes, c)
	}
	return page, nil
}

// HeadSeqMaster returns the highest master-partition change_log sequence,
// or 0 if there are no master changes yet.
func (s *Store) HeadSeqMaster(ctx context.Context) (int64, error) {
	var seq int64
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(seq), 0) FROM change_log WHERE trip_id IS NULL`).Scan(&seq)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return seq, err
}

func (s *Store) masterVisible(ctx context.Context, userID, table, id string) (bool, error) {
	switch table {
	case "categories", "items":
		return true, nil

	case "templates":
		var owner string
		var published int
		err := s.db.QueryRowContext(ctx,
			`SELECT owner_id, is_published FROM templates WHERE id = ?`, id).Scan(&owner, &published)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil // row already gone; its tombstone follows in the feed
		}
		if err != nil {
			return false, fmt.Errorf("template visibility: %w", err)
		}
		return owner == userID || published == 1, nil

	case "template_items":
		var owner string
		var published int
		err := s.db.QueryRowContext(ctx,
			`SELECT t.owner_id, t.is_published FROM template_items ti
			 JOIN templates t ON t.id = ti.template_id WHERE ti.id = ?`, id).Scan(&owner, &published)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, fmt.Errorf("template_items visibility: %w", err)
		}
		return owner == userID || published == 1, nil

	case "trips":
		return s.IsTripMember(ctx, id, userID)
	}
	return false, nil
}
