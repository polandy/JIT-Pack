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

	// FK cascades delete child rows silently; collect their ids up front
	// so the whole cascade can be tombstoned for clients.
	cascaded, err := cascadeChildren(ctx, tx, m, merged.Deleted, exists)
	if err != nil {
		return MutationResult{}, err
	}

	changed, err := persist(ctx, tx, m.Table, m, merged, exists)
	if err != nil {
		if isConstraintViolation(err) {
			// e.g. deleting an item still referenced by a template, or two
			// admins racing to add the same member (UNIQUE): the statement
			// failed, the transaction survives — reject cleanly.
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
		for _, c := range cascaded {
			tombstone := sync.Mutation{Table: c.table, ID: c.id, HLC: m.HLC}
			if _, err := appendChangeLog(ctx, tx, nil, tombstone, true); err != nil {
				return MutationResult{}, err
			}
		}
		if m.Table == "trips" && !exists && !merged.Deleted {
			// The creator becomes the trip's Owner (FR-4.5); the membership
			// row syncs like any other so every device learns the roster.
			memberID := randomID()
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO trip_members (id, trip_id, user_id, role, updated_hlc) VALUES (?, ?, ?, 'owner', ?)`,
				memberID, m.ID, userID, string(m.HLC)); err != nil {
				return MutationResult{}, fmt.Errorf("creator membership: %w", err)
			}
			member := sync.Mutation{Table: "trip_members", ID: memberID, HLC: m.HLC}
			if _, err := appendChangeLog(ctx, tx, nil, member, false); err != nil {
				return MutationResult{}, err
			}
		}
		if m.Table == "trip_members" && !merged.Deleted {
			// A grant must resurface the trips row: the new member's pull
			// cursor is already past the trip's original change_log entry,
			// so without a fresh one they would never see the trip.
			if tripID, ok := memberTrip(current, m); ok {
				touch := sync.Mutation{Table: "trips", ID: tripID, HLC: m.HLC}
				if _, err := appendChangeLog(ctx, tx, nil, touch, false); err != nil {
					return MutationResult{}, err
				}
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
		return ownsAll(ctx, tx, userID,
			`SELECT owner_id FROM templates WHERE id = ?`,
			parentIDs(current, m, "template_id"))

	case "trip_series":
		if !exists {
			if m.Op != sync.OpDelete {
				setField(m, "owner_id", userID)
			}
			return true, nil
		}
		return current["owner_id"] == userID, nil

	case "destination_profiles":
		// Ownership follows the series chain (FR-13.2) — current and
		// target series alike, so profiles can't move to foreign series.
		return ownsAll(ctx, tx, userID,
			`SELECT owner_id FROM trip_series WHERE id = ?`,
			parentIDs(current, m, "series_id"))

	case "destination_checklist_items":
		return ownsAll(ctx, tx, userID,
			`SELECT s.owner_id FROM destination_profiles p
			 JOIN trip_series s ON s.id = p.series_id WHERE p.id = ?`,
			parentIDs(current, m, "profile_id"))

	case "trips":
		if !exists {
			if m.Op != sync.OpDelete {
				setField(m, "created_by", userID)
			}
			return true, nil
		}
		role, err := memberRole(ctx, tx, m.ID, userID)
		if err != nil {
			return false, err
		}
		if role == "" {
			return false, nil
		}
		if m.Op == sync.OpDelete {
			return role == "owner" || role == "admin", nil
		}
		return true, nil

	case "trip_members":
		// Clients can never grant 'owner' — the creator's server-created
		// row is the trip's only Owner (FR-4.5).
		if role, ok := m.Fields["role"].(string); ok && role == "owner" {
			return false, nil
		}
		// The creator's row is the only one with role 'owner' and is
		// immutable — no demotion, no removal, not even by an Admin
		// (FR-4.7).
		if exists && current["role"] == "owner" {
			return false, nil
		}
		trips := parentIDs(current, m, "trip_id")
		if len(trips) == 0 {
			return false, nil
		}
		for tripID := range trips {
			role, err := memberRole(ctx, tx, tripID, userID)
			if err != nil {
				return false, err
			}
			if role != "owner" && role != "admin" {
				return false, nil // FR-4.7: only Owner/Admin manage members
			}
		}
		return true, nil
	}
	return false, nil
}

// memberRole returns userID's role on the trip, or "" for non-members.
func memberRole(ctx context.Context, tx *sql.Tx, tripID, userID string) (string, error) {
	var role string
	err := tx.QueryRowContext(ctx,
		`SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?`,
		tripID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("trip role lookup: %w", err)
	}
	return role, nil
}

// parentIDs collects the parent references of a child row from both the
// existing row and the mutation fields — authorization must hold for the
// current parent *and* the target parent.
func parentIDs(current map[string]any, m *sync.Mutation, field string) map[string]bool {
	ids := map[string]bool{}
	if id, ok := current[field].(string); ok {
		ids[id] = true
	}
	if id, ok := m.Fields[field].(string); ok {
		ids[id] = true
	}
	return ids
}

// ownsAll reports whether ownerQuery resolves to userID for every id.
// An empty id set or a missing parent row denies.
func ownsAll(ctx context.Context, tx *sql.Tx, userID, ownerQuery string, ids map[string]bool) (bool, error) {
	if len(ids) == 0 {
		return false, nil
	}
	for id := range ids {
		var owner string
		err := tx.QueryRowContext(ctx, ownerQuery, id).Scan(&owner)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, fmt.Errorf("owner lookup: %w", err)
		}
		if owner != userID {
			return false, nil
		}
	}
	return true, nil
}

func setField(m *sync.Mutation, field, value string) {
	if m.Fields == nil {
		m.Fields = map[string]any{}
	}
	m.Fields[field] = value
}

// cascadeRow identifies one child row an FK cascade will delete.
type cascadeRow struct{ table, id string }

// cascadeChildren returns the child rows a delete will cascade to, in
// leaf-first order so clients can apply the tombstones verbatim.
func cascadeChildren(ctx context.Context, tx *sql.Tx, m sync.Mutation, deleted, exists bool) ([]cascadeRow, error) {
	if !deleted || !exists {
		return nil, nil
	}
	collect := func(table, query string) ([]cascadeRow, error) {
		ids, err := childIDs(ctx, tx, query, m.ID)
		if err != nil {
			return nil, err
		}
		rows := make([]cascadeRow, 0, len(ids))
		for _, id := range ids {
			rows = append(rows, cascadeRow{table, id})
		}
		return rows, nil
	}
	switch m.Table {
	case "templates":
		return collect("template_items", `SELECT id FROM template_items WHERE template_id = ?`)
	case "trip_series":
		items, err := collect("destination_checklist_items",
			`SELECT ci.id FROM destination_checklist_items ci
			 JOIN destination_profiles p ON p.id = ci.profile_id WHERE p.series_id = ?`)
		if err != nil {
			return nil, err
		}
		profiles, err := collect("destination_profiles",
			`SELECT id FROM destination_profiles WHERE series_id = ?`)
		if err != nil {
			return nil, err
		}
		return append(items, profiles...), nil
	case "destination_profiles":
		return collect("destination_checklist_items",
			`SELECT id FROM destination_checklist_items WHERE profile_id = ?`)
	}
	return nil, nil
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

// isConstraintViolation matches FK, UNIQUE, and CHECK failures — all
// cases where the client's data, not the server, is at fault.
func isConstraintViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "constraint failed")
}

// memberTrip resolves a trip_members mutation's trip id from the
// existing row or the mutation fields.
func memberTrip(current map[string]any, m sync.Mutation) (string, bool) {
	if id, ok := m.Fields["trip_id"].(string); ok && id != "" {
		return id, true
	}
	if id, ok := current["trip_id"].(string); ok && id != "" {
		return id, true
	}
	return "", false
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

	case "trip_members":
		// The roster is visible to every member of its trip — including
		// the row's subject, who becomes a member through this very row.
		var tripID string
		err := s.db.QueryRowContext(ctx,
			`SELECT trip_id FROM trip_members WHERE id = ?`, id).Scan(&tripID)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, fmt.Errorf("trip_members visibility: %w", err)
		}
		return s.IsTripMember(ctx, tripID, userID)

	case "trip_series":
		return s.ownedBy(ctx, userID,
			`SELECT owner_id FROM trip_series WHERE id = ?`, id)

	case "destination_profiles":
		return s.ownedBy(ctx, userID,
			`SELECT s.owner_id FROM destination_profiles p
			 JOIN trip_series s ON s.id = p.series_id WHERE p.id = ?`, id)

	case "destination_checklist_items":
		return s.ownedBy(ctx, userID,
			`SELECT s.owner_id FROM destination_checklist_items ci
			 JOIN destination_profiles p ON p.id = ci.profile_id
			 JOIN trip_series s ON s.id = p.series_id WHERE ci.id = ?`, id)
	}
	return false, nil
}

// ownedBy resolves query's single owner column for id and compares it to
// userID; a missing row denies (its tombstone follows in the feed).
func (s *Store) ownedBy(ctx context.Context, userID, query, id string) (bool, error) {
	var owner string
	err := s.db.QueryRowContext(ctx, query, id).Scan(&owner)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("ownership visibility: %w", err)
	}
	return owner == userID, nil
}
